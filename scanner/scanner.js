// Simplified Scanner implementation
// Responsibilities:
//  - Connect (with proxy) to game websocket for a single (guild, continent)
//  - Request all zones sequentially (batched) and accumulate objects
//  - Report progress (%) while scanning
//  - After completion: filter cmines (20100105) & dsa mines (20100106), save & run reporting logic
//  - Use shared Discord, SQL, API instances
//  - On any 403 -> trigger 2h global pause (stop all scanners). Ignore 502.
//  - Before every (re)connect fetch fresh scanner token via getScannerTokens.

const { GatewayIntentBits, Client, Events } = require('discord.js');
const Encryption = require('../encryption/encryption.js');
const Api = require('../general/api.js');
const Sql = require('../database/sql.js');

// CONFIG CONSTANTS
const WEBSOCKET_BASE = 'wss://socf-lok-live.leagueofkingdoms.com/socket.io/?EIO=4&transport=websocket';
const ZONE_COUNT = 4096; // 64 x 64 world tiles (32x32 coords per zone) assumed
const BATCH_SIZE = 9;     // empiric batch size from legacy code
const BATCH_DELAY_MS = 0; // delay to mitigate rate limits
const GLOBAL_PAUSE_HOURS = 2; // 2h pause after 403

class Scanner {
	// ---- Static (shared) state ----
	static active = new Map(); // key => instance
	static discordClient = null;
	static discordReady = null;
	static sql = null;
	static api = null;
	static globalPauseUntil = 0; // ms timestamp
	static restarting = false;

	static initShared() {
		if (!this.sql) this.sql = new Sql();
		if (!this.api) this.api = new Api(this.sql);
		if (!this.discordClient) {
			this.discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
			this.discordReady = new Promise((resolve, reject) => {
				this.discordClient.once(Events.ClientReady, () => {
					console.log('[Scanner] Discord client ready');
					resolve();
				});
				const token = process.env.DISCORD_TOKEN;
				if (!token) {
					console.warn('[Scanner] DISCORD_TOKEN not set in env');
					resolve(); // continue without discord
				} else {
					this.discordClient.login(token).catch(e => { console.error('Discord login failed:', e); reject(e); });
				}
			});
		}
	}

	static isPaused() { return Date.now() < this.globalPauseUntil; }

	static triggerGlobalPause(reason = '403') {
		if (this.isPaused()) return;
		this.globalPauseUntil = Date.now() + GLOBAL_PAUSE_HOURS * 3600000;
		console.warn(`[Scanner] Global pause triggered for ${GLOBAL_PAUSE_HOURS}h due to ${reason}. Stopping all scanners.`);
		for (const inst of this.active.values()) {
			try { inst._finalize('global_pause'); } catch (e) { console.error('Finalize during pause failed:', e); }
		}
		this.active.clear();
	}

	static register(instance) {
		const key = instance.key;
		if (this.active.has(key)) return false;
		this.active.set(key, instance);
		return true;
	}

	static deregister(instance) {
		if (this.active.get(instance.key) === instance) this.active.delete(instance.key);
	}

	// ---- Instance ----
	constructor({ guildId, continent, xorPassword }) {
		Scanner.initShared();
		this.guildId = guildId;
		this.continent = continent;
		this.xorPassword = xorPassword || '.bx0531adex71.'; // updated default
		this.key = `${guildId}:${continent}`;
		this.encryption = new Encryption();
		this.zoneNumbers = Array.from({ length: ZONE_COUNT }, (_, i) => i);
		this.zoneIndex = 0;
		this.objects = [];
		this.wsConnection = null;
		this.token = null;
		this.finished = false;
		this.instanceId = Math.random().toString(36).slice(2, 10);
		this._enterSent = false;
		this._saved = false;
		this._reconnectAttempts = 0;
		this.maxReconnects = 5; // simple cap

		if (Scanner.isPaused()) {
			console.log(`[Scanner] Not starting ${this.key} (paused until ${new Date(Scanner.globalPauseUntil).toISOString()})`);
			return;
		}
		if (!Scanner.register(this)) {
			console.log(`[Scanner] Duplicate prevented for ${this.key}`);
			return;
		}
		(Scanner.discordReady || Promise.resolve()).then(() => this.start()).catch(e => console.error('Scanner start error:', e));
	}

	log(msg) { console.log(`${msg} [ ${this.key} ${this.instanceId} ]`); }

	async delay(ms) { return new Promise(r => setTimeout(r, ms)); }

	async start() {
		try {
			await this.fetchLatestToken();
			await this.fetchXorPass();
			await this.openWebSocket();
		} catch (e) {
			this.log(`Failed to start: ${e}`);
			this._finalize('start_error');
		}
	}

	async fetchLatestToken() {
		try {
			const tokens = await Scanner.sql.getScannerTokens(this.guildId);
			if (!tokens || tokens.length === 0) throw new Error('No scanner token');
			this.token = tokens[0].token;
		} catch (e) { throw e; }
	}

	async fetchXorPass() {
		try {
			const row = await Scanner.sql.getXORPass();
			const val = row && row[0] && row[0].value;
			if (val) this.xorPassword = val;
			else this.xorPassword = '.bx0531adex71.'; // fallback if DB empty
		} catch (_) { /* keep default */ }
	}

	async openWebSocket() {
		if (Scanner.isPaused()) { this.log('Abort open (paused)'); return; }
		const url = `${WEBSOCKET_BASE}&token=${this.token}`;
		const maxHandshakeRetries = 10;
		let attempt = 0;
		while (attempt < maxHandshakeRetries) {
			attempt++;
			this.log(`Connecting websocket (proxies ENABLED) attempt ${attempt}/${maxHandshakeRetries}`);
			try {
				await Scanner.api.connectWebSocket(url, {
					useProxy: true,
					onConnect: (connection, proxy) => this.onConnect(connection, proxy),
					onMessage: (message, connection) => this.onMessage(message, connection),
					onError: (err) => this.onError(err, { duringHandshake: true }),
					onClose: () => this.onClose(),
				});
				return; // success -> exit loop
			} catch (e) {
				const msg = String(e && e.message || e);
				if (/403/.test(msg)) { // handled by onError -> global pause
					throw e; // break
				}
				if (/502/.test(msg)) { // transient gateway - retry
					this.log(`Handshake 502 (attempt ${attempt}) – retrying shortly`);
					await this.delay(1000 + Math.random()*1000);
					continue;
				}
				// Any other error -> throw
				throw e;
			}
		}
		throw new Error(`Exhausted websocket handshake retries (${maxHandshakeRetries})`);
	}

	async onConnect(connection, proxy) {
		if (!proxy) {
			this.log('No proxy allocated – aborting scan (will retry next schedule).');
			this._finalize('no_proxy');
			try { connection.close(); } catch (_) {}
			return;
		}
		this.wsConnection = connection;
		this._reconnectAttempts = 0;
		this.log(`Connected (proxy ${proxy})`);
		
		// Send the initial enter message to join the continent
		try {
			await this.sendEnter(connection);
		} catch (e) {
			this.log(`Failed to send enter message: ${e}`);
			this._finalize('enter_failed');
		}
	}

	async onMessage(message, connection) {
		try {
			if (message.type !== 'utf8') return;
			const dataStr = message.utf8Data;
			if (dataStr === '2') { // ping
				connection.sendUTF('3');
				return;
			}
			if (dataStr.startsWith('40')) { // open
				if (!this._enterSent) {
					await this.sendEnter(connection);
				}
				return;
			}
			if (dataStr === '3' || dataStr.startsWith('0')) return; // pong/handshake
			if (!dataStr.startsWith('42[')) return; // not an event packet
			let parsed;
			try { parsed = JSON.parse(dataStr.substring(2)); } catch (e) { return; }
			const [event, payload] = parsed;
			if (event === '/field/enter/v3') {
				await this.sendLeave(connection, []); // leave empty zones
				await this.sendNextBatch(connection); // first batch
			} else if (event === '/field/objects/v4') {
				await this.handleObjectsPayload(payload, connection);
			} else if (event === '/march/objects' || event === '/march/object/update') {
				// Ignore march updates
			}
		} catch (e) {
			this.log(`onMessage error: ${e}`);
		}
	}

	async sendEnter(connection) {
		try {
			const enc = await this.encryption.createXorMessage(JSON.stringify({ token: this.token }), this.xorPassword);
			const msg = `42["/field/enter/v3", "${enc}"]`;
			connection.sendUTF(msg);
			this._enterSent = true;
			this.log('Sent enter message');
		} catch (e) { this.log('Enter send failed ' + e); }
	}

	async sendLeave(connection, zones = []) {
		try {
			const payload = JSON.stringify({ world: this.continent, zones: JSON.stringify(zones) });
			const msg = `42["/zone/leave/list/v2", ${payload}]`;
			connection.sendUTF(msg);
		} catch (e) { this.log('Leave send failed ' + e); }
	}

	async sendNextBatch(connection) {
		if (this.finished) return;
		const zonesSubset = this.zoneNumbers.slice(this.zoneIndex, this.zoneIndex + BATCH_SIZE);
		this.zoneIndex += BATCH_SIZE;
		if (zonesSubset.length === 0) {
			// Nothing left (edge)
			await this.finishAndPersist();
			return;
		}
		if (this.zoneIndex >= ZONE_COUNT) this.finished = true;
		const payload = JSON.stringify({ world: this.continent, zones: JSON.stringify(zonesSubset) });
		const enc = await this.encryption.createXorMessage(payload, this.xorPassword);
		const msg = `42["/zone/enter/list/v4", "${enc}"]`;
		await this.delay(BATCH_DELAY_MS);
		connection.sendUTF(msg);
	}

	async handleObjectsPayload(payload, connection) {
		let decompressed, decrypted, decoded;
		try {
			decompressed = await this.encryption.decodeGunzip(payload.packs);
			decrypted = await this.encryption.decryptXorMessage(decompressed.toString(), this.xorPassword);
			decoded = JSON.parse(decrypted);
		} catch (e) {
			this.log('Failed decoding objects payload ' + e);
			return;
		}
		const newObjs = decoded.objects || [];
		this.objects.push(...newObjs);
		const percent = ((Math.min(this.zoneIndex, ZONE_COUNT) / ZONE_COUNT) * 100).toFixed(1);
		this.log(`Received ${newObjs.length} objects (${percent}% zones)`);
		if (this.finished || this.zoneIndex >= ZONE_COUNT) {
			await this.finishAndPersist(connection);
			return;
		}
		// Send leave for previous batch
		const prevStart = this.zoneIndex - BATCH_SIZE;
		const prevZones = this.zoneNumbers.slice(prevStart, this.zoneIndex);
		await this.sendLeave(connection, prevZones);
		await this.sendNextBatch(connection);
	}

	async finishAndPersist(connection) {
		if (this._saved) return;
		this._saved = true;
		this.log('All zones processed – persisting data');
		try { await this.processAndSaveData(this.objects); } catch (e) { this.log('Persist error ' + e); }
		this._finalize('completed');
		try { connection && connection.close(); } catch (_) {}
	}

	async onError(err, ctx = {}) {
		const msg = String(err && err.message || err);
		if (/403/.test(msg)) {
			this.log('403 detected – triggering global pause');
			Scanner.triggerGlobalPause('403');
			return;
		}
		if (/502/.test(msg)) {
			// Handshake phase: swallow so caller retry loop proceeds
			if (ctx.duringHandshake) {
				this.log('Handshake 502 captured (will retry)');
				return;
			}
			// Post-connect: ignore; close event will manage reconnect
			this.log('Ignoring 502 error');
			return;
		}
		this.log('WebSocket error: ' + msg);
	}

	async onClose() {
		if (this.finished || this._saved) { this._finalize('normal_close'); return; }
		if (Scanner.isPaused()) { this._finalize('paused_close'); return; }
		if (this._reconnectAttempts >= this.maxReconnects) { this._finalize('reconnect_limit'); return; }
		this._reconnectAttempts++;
		this.log(`Closed unexpectedly – reconnect attempt ${this._reconnectAttempts}`);
		try { await this.fetchLatestToken(); } catch (_) {}
		await this.delay(500 + Math.random() * 800);
		try { await this.openWebSocket(); } catch (e) { this.log('Reconnect failed ' + e); }
	}

	async processAndSaveData(allObjects) {
		// Deduplicate by _id
		const seen = new Set();
		const filtered = allObjects.filter(o => {
			if (!o || !o._id) return false;
			if (seen.has(o._id)) return false;
			seen.add(o._id);
			return (o.code === 20100105 || o.code === 20100106);
		});
		this.log(`Filtered ${filtered.length} mines (c + dsa)`);

		const mines = filtered.map(item => {
			const { _id, loc = [], level, code, expired, param = {}, occupied = {} } = item;
			const [, x, y] = loc; // loc[0] = continent
			const zone = (typeof x === 'number' && typeof y === 'number') ? (Math.floor(x / 32) + 64 * Math.floor(y / 32)) : null;
			return {
				fid: _id,
				zone,
				code,
				continent: this.continent,
				guild: this.guildId,
				x, y,
				level,
				value: param.value || 0,
				expired: toMysqlDatetime(expired),
				location: null,
				allianceTag: occupied.allianceTag || null,
				kingdomId: occupied.id || null,
				name: occupied.name || null,
				targetValue: occupied.targetValue || null,
				diff: occupied && (param.value || 0) - (occupied.targetValue || 0),
				started: toMysqlDatetime(occupied.started),
				ended: toMysqlDatetime(occupied.ended),
			};
		});
		if (mines.length) {
			try {
				if (typeof Scanner.sql.insertMineDataBulk === 'function') {
					await Scanner.sql.insertMineDataBulk(mines);
				} else if (typeof Scanner.sql.insertMineData === 'function') {
					for (const m of mines) await Scanner.sql.insertMineData(m);
				}
			} catch (e) { this.log('DB insert mines failed ' + e); }
		}
		await this.elaborateAndCompare(filtered);
	}

	async elaborateAndCompare(records) {
		// (Copied logic structure from scannertemp.js with simplifications; behavior intent preserved)
		try {
			// Free days logic
			let skipReporting = false;
			if (typeof Scanner.sql.getFreeDays === 'function') {
				try {
					const freeDays = await Scanner.sql.getFreeDays(this.guildId);
					if (freeDays && typeof freeDays === 'string') {
						let day = new Date().getDay(); // 0=Sun
						day = day === 0 ? 7 : day; // convert Sun->7
						if (freeDays.includes(day.toString())) skipReporting = true;
					}
				} catch (_) {}
			}
			if (skipReporting) { this.log('Reporting skipped (free day)'); return; }

			const whitelistRows = await Scanner.sql.getWhitelist(this.guildId, this.continent);
			const whitelist = whitelistRows.reduce((acc, row) => {
				const cmineExpiryTime = row.cmine_expiry ? new Date(row.cmine_expiry).getTime() : null;
				const dsaExpiryTime = row.dsa_expiry ? new Date(row.dsa_expiry).getTime() : null;
				acc[row.kingdomid] = {
					cmine: Number.parseInt(row.cmine, 10) || 0,
					dsa: Number.parseInt(row.dsa, 10) || 0,
					cmineExpiry: Number.isFinite(cmineExpiryTime) ? cmineExpiryTime : null,
					dsaExpiry: Number.isFinite(dsaExpiryTime) ? dsaExpiryTime : null,
				};
				return acc;
			}, {});

			// Level thresholds
			let minCmine = 2, minDsa = 2;
			try {
				if (typeof Scanner.sql.getCmineAndDsaLevels === 'function') {
					const levels = await Scanner.sql.getCmineAndDsaLevels(this.guildId);
					if (levels) {
						minCmine = Number(levels.cmine_lvl) || minCmine;
						minDsa = Number(levels.dsa_lvl) || minDsa;
					}
				}
			} catch (_) {}

			const illegalCandidates = records.filter(r => {
				if (!r || !r.occupied || !r.occupied.name) return false;
				const kingdomId = (r.occupied.id !== undefined && r.occupied.id !== null) ? r.occupied.id : null;
				const wl = kingdomId !== null ? whitelist[kingdomId] : null;
				let startedAt = null;
				if (r.occupied.started) {
					const ts = new Date(r.occupied.started).getTime();
					if (Number.isFinite(ts)) startedAt = ts;
				}
				if (r.code === 20100105 && r.level > minCmine) {
					if (wl) {
						if (wl.cmine >= r.level) return false;
						if (wl.cmineExpiry !== null && startedAt !== null && startedAt <= wl.cmineExpiry) return false;
					}
					return true;
				}
				if (r.code === 20100106 && r.level > minDsa) {
					if (wl) {
						if (wl.dsa >= r.level) return false;
						if (wl.dsaExpiry !== null && startedAt !== null && startedAt <= wl.dsaExpiry) return false;
					}
					return true;
				}
				return false;
			});

			const fids = illegalCandidates.map(r => r._id);
			let already = [];
			try { already = await Scanner.sql.checkIllegalMinesBulk(fids, this.guildId); } catch (_) {}
			const newIllegals = illegalCandidates.filter(r => !already.includes(r._id));

			if (!newIllegals.length) { this.log('No new illegal mines'); return; }

			const illegalRecords = newIllegals.map(r => ({
				fid: r._id,
				code: r.code,
				name: r.occupied.name,
				x: r.loc[1],
				y: r.loc[2],
				allianceTag: r.occupied.allianceTag,
				started: toMysqlDatetime(r.occupied?.started),
				kingdomId: r.occupied.id,
				level: r.level,
				value: r.param?.value,
				continent: this.continent,
				guild: this.guildId,
			}));

			try {
				if (typeof Scanner.sql.insertIllegalMinesBulk === 'function') {
					await Scanner.sql.insertIllegalMinesBulk(illegalRecords);
				} else if (typeof Scanner.sql.insertIllegalMine === 'function') {
					for (const r of illegalRecords) await Scanner.sql.insertIllegalMine(r);
				}
			} catch (e) { this.log('Insert illegal mines failed ' + e); }

			// Notifications sequential for simplicity
			for (const rec of illegalRecords) {
				await this.sendDiscordNotification({
					code: rec.code,
					name: rec.name,
					level: rec.level,
					x: rec.x,
					y: rec.y,
					value: rec.value,
					allianceTag: rec.allianceTag,
					id: rec.kingdomId,
					started: rec.started,
				});
			}
		} catch (e) { this.log('elaborateAndCompare error ' + e); }
	}

	async sendDiscordNotification({ code, name, level, x, y, value, allianceTag, id, started }) {
		try {
			if (!Scanner.discordClient) return;
			const resourceMap = {
				20100105: { type: 'Crystal', title: 'CMine', typeb: 'crystals' },
				20100106: { type: 'DSA', title: 'DSA', typeb: 'DSA' },
			};
			const resource = resourceMap[code] || { type: 'Mine', typeb: 'resources' };
			const channels = await Scanner.sql.getGuildLogChannels(this.guildId);
			const chInfo = channels && channels[0];
			if (!chInfo) { this.log('No log channels configured'); return; }
			const channelId = code === 20100105 ? chInfo.cmine_whitelist_channel : chInfo.dsa_whitelist_channel;
			if (!channelId) { this.log('Missing specific channel id'); return; }
			let discordId = null;
			try {
				const v = await Scanner.sql.getVerifiedDiscordId(id, this.guildId);
				discordId = v && v[0] && v[0].discordId;
			} catch (_) {}
			const discordTag = discordId ? `<@${discordId}>` : '';
			let miningStart = 0;
			if (started) {
				const d = new Date(started); if (!isNaN(d.getTime())) miningStart = Math.floor(d.getTime()/1000);
			}
			const safeValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;
			const channel = await Scanner.discordClient.channels.fetch(channelId).catch(()=>null);
			if (!channel) { this.log('Channel fetch failed'); return; }
			const customEmoji = code === 20100105 ? '<:crystal:1400996986395688960>' : '<:dsa:1400996962827899101>';
			const embed = {
				color: 0xff0000,
				title: `${customEmoji} Illegal ${resource.type} Mining Detected`,
				description: `**${discordTag || `[${allianceTag}] ${name}`} is illegally mining a ${resource.type} Mine Lv. ${level} at ${x}:${y} with ${safeValue.toLocaleString()} ${resource.typeb} inside**`,
				fields: [
					{ name: 'Criminal', value: `[${allianceTag}] ${name} ${discordTag}`, inline: false },
					{ name: 'Kingdom ID', value: `${id || 'Unknown'}`, inline: true },
					{ name: 'Mining Started', value: `<t:${miningStart}:F> (<t:${miningStart}:R>)`, inline: false },
					{ name: 'Location', value: `${x}:${y}`, inline: true },
					{ name: 'Mine Level', value: `${level}`, inline: true },
					{ name: 'Resources Inside', value: `${safeValue.toLocaleString()} ${resource.typeb}`, inline: true }
				],
				timestamp: new Date().toISOString(),
				footer: { text: `${resource.type} Mine Alert` }
			};
			await channel.send({ content: discordTag || null, embeds: [embed] });
			this.log('Sent discord notification');
		} catch (e) { this.log('Discord notification error ' + e); }
	}

	_finalize(reason) {
		if (this._done) return;
		this._done = true;
		this.finished = true;
		try { this.wsConnection && this.wsConnection.close && this.wsConnection.close(); } catch(_){}
		Scanner.deregister(this);
		this.log(`Finalized (${reason})`);
	}
}

function toMysqlDatetime(dateInput) {
	if (!dateInput) return null;
	let date;
	if (typeof dateInput === 'number') {
		date = new Date(dateInput * 1000);
	} else {
		date = new Date(dateInput);
	}
	if (isNaN(date.getTime())) return null;
	return date.toISOString().replace('T',' ').replace('Z','').split('.')[0];
}

module.exports = Scanner;

