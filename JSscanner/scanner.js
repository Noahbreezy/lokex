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

// DEBUG CONTROL
const DEBUG = /^(1|true|yes)$/i.test(String(process.env.SCANNER_DEBUG || process.env.DEBUG_SCANNER || '')); // enable verbose logging

// CONFIG CONSTANTS
const WEBSOCKET_BASE = 'wss://socf-lok-live.leagueofkingdoms.com/socket.io/?EIO=4&transport=websocket';
const DEFAULT_ZONE_COUNT = 4096; // historical default; actual zone count derived from /field/enter/v3 when possible
const BATCH_SIZE = 9;     // empiric batch size from legacy code
const BATCH_DELAY_MS = Number.isFinite(Number(process.env.SCANNER_BATCH_DELAY_MS))
	? Number(process.env.SCANNER_BATCH_DELAY_MS)
	: 25; // delay to mitigate rate limits (env override)
const GLOBAL_PAUSE_HOURS = 2; // 2h pause after 403

const BATCH_TIMEOUT_MS = Number.isFinite(Number(process.env.SCANNER_BATCH_TIMEOUT_MS))
	? Number(process.env.SCANNER_BATCH_TIMEOUT_MS)
	: 3000; // watchdog: default > engine.io pingInterval(25s) to avoid premature reconnects

const SKIP_ON_TIMEOUT = true; // always skip a stuck batch after soft retry

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
		this.worldId = continent;
		this.xorPassword = xorPassword || null;
		this.key = `${guildId}:${continent}`;
		this.encryption = new Encryption();
		this.zoneCount = DEFAULT_ZONE_COUNT;
		this.zonesX = 64; // fallback; updated from /field/enter/v3 map width
		this.zoneNumbers = Array.from({ length: this.zoneCount }, (_, i) => i);
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

		this._lastEvent = null; // for diagnostics
		this._lastPongAt = null;
		this._lastPingAt = null;
		this._socketIoOpened = false;
		this._sentSocketIoOpen = false;

		// Message/batch sequencing
		this._eventChain = Promise.resolve();
		this._awaitingObjects = false;
		this._batchTimer = null;
		this._batchSeq = 0;
		this._batchTimeoutsInARow = 0;
		this._lastRequestedZones = null;
		this._inFlightZones = null;
		this._inFlightStartIndex = 0;
		this._inFlightTimeoutRetries = 0;
		this._skippedZones = new Set();
		this._isRetryPass = false;
		this._adaptiveBatchDelayMs = BATCH_DELAY_MS;
		this._closingFor = null;

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
	dbg(msg) { if (DEBUG) this.log(`[debug] ${msg}`); }
	maskToken(t) {
		if (!t) return 'null';
		const s = String(t);
		if (s.length <= 8) return `***${s}`;
		return `${s.slice(0,4)}...${s.slice(-4)}`;
	}

	_decodeJwtPayload(jwt) {
		try {
			if (!jwt || typeof jwt !== 'string') return null;
			const parts = jwt.split('.');
			if (parts.length < 2) return null;
			const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
			const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
			const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
			return JSON.parse(json);
		} catch (_) {
			return null;
		}
	}

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
			// Prefer a token whose JWT payload worldId matches our configured world/continent.
			const desired = Number(this.continent);
			let picked = tokens[0];
			let pickedWorld = null;
			for (const row of tokens) {
				const payload = this._decodeJwtPayload(row && row.token);
				const worldId = payload && payload.worldId;
				if (worldId !== undefined && worldId !== null) {
					const w = Number(worldId);
					if (Number.isFinite(w) && Number.isFinite(desired) && w === desired) {
						picked = row;
						pickedWorld = w;
						break;
					}
					if (pickedWorld === null && Number.isFinite(w)) pickedWorld = w;
				}
			}
			this.token = picked.token;
			if (Number.isFinite(desired) && Number.isFinite(pickedWorld) && desired !== pickedWorld) {
				this.log(`No scanner token matched world ${desired}; picked token worldId=${pickedWorld}.`);
			}
			this.dbg(`Token fetched (masked): ${this.maskToken(this.token)} (guild ${this.guildId})`);
		} catch (e) { this.log(`fetchLatestToken error: ${e}`); throw e; }
	}

	async fetchXorPass() {
		try {
			const row = await Scanner.sql.getXORPass();
			const val = row && row[0] && row[0].value;
			this.xorPassword = val || process.env.XOR_PASS || null;
			if (!this.xorPassword) this.dbg('XOR password missing (XOR disabled; base64-only mode)');
			else this.dbg('XOR password loaded');
		} catch (e) { this.log(`fetchXorPass error: ${e}`); }
	}

	async openWebSocket() {
		if (Scanner.isPaused()) { this.log('Abort open (paused)'); return; }
		const url = `${WEBSOCKET_BASE}&token=${this.token}`;
		const maxHandshakeRetries = 10;
		let attempt = 0;
		while (attempt < maxHandshakeRetries) {
			attempt++;
			this.log(`Connecting websocket (proxies ENABLED) attempt ${attempt}/${maxHandshakeRetries}`);
			this.dbg(`WS URL base: ${WEBSOCKET_BASE} | token: ${this.maskToken(this.token)} | continent: ${this.continent}`);
			try {
				await Scanner.api.connectWebSocket(url, {
					useProxy: true,
					onConnect: (connection, proxy) => this.onConnect(connection, proxy),
					onMessage: (message, connection) => this.onMessage(message, connection),
					onError: (err) => this.onError(err, { duringHandshake: true }),
					onClose: (connection, code, description) => this.onClose(code, description),
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
				this.log(`Handshake error: ${msg}`);
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
		// New TCP/WebSocket session => reset per-connection protocol state.
		this._socketIoOpened = false;
		this._sentSocketIoOpen = false;
		this._enterSent = false;
		this._clearBatchWatchdog();
		this._awaitingObjects = false;
		this._closingFor = null;
		this._lastEvent = null;
		this._lastPingAt = null;
		this._lastPongAt = null;
		this._inFlightTimeoutRetries = 0;
		// Preserve _skippedZones and _isRetryPass across reconnects.

		this.wsConnection = connection;
		this._reconnectAttempts = 0;
		this.log(`Connected (proxy ${proxy})`);
		this.dbg(`Enter state: enterSent=${this._enterSent} tokenMasked=${this.maskToken(this.token)} xor=${this.xorPassword ? 'yes' : 'no'}`);

		// Socket.IO connect: client should send "40" first.
		try {
			connection.sendUTF('40');
			this._sentSocketIoOpen = true;
			this.dbg('Sent socket.io open (40)');
		} catch (e) {
			this.log(`Failed to send socket.io open (40): ${e}`);
		}
	}

	async onMessage(message, connection) {
		// Important: message callbacks can be concurrent; serialize so we don't race zoneIndex/batch state.
		this._eventChain = this._eventChain
			.then(() => this._handleMessage(message, connection))
			.catch((e) => this.log(`onMessage error: ${e}`));
	}

	async _handleMessage(message, connection) {
		if (message.type !== 'utf8') return;
		const dataStr = message.utf8Data;
		if (DEBUG && (dataStr.startsWith('0') || dataStr.startsWith('40'))) {
			this.dbg(`Control packet: ${dataStr.slice(0, 200)}`);
		}
		if (dataStr.startsWith('0')) {
			// Engine.IO open packet. Some servers expect client to send "40" after this.
			if (!this._sentSocketIoOpen) {
				try {
					connection.sendUTF('40');
					this._sentSocketIoOpen = true;
					this.dbg('Sent socket.io open (40) after engine open (0)');
				} catch (_) {}
			}
			return;
		}
		if (dataStr === '2') { // ping
			connection.sendUTF('3');
			this._lastPingAt = Date.now();
			return;
		}
		if (dataStr.startsWith('40')) { // socket.io open/ack
			this._socketIoOpened = true;
			if (!this._enterSent) await this.sendEnter(connection);
			this._lastEvent = 'open';
			return;
		}
		if (dataStr === '3') { this._lastPongAt = Date.now(); return; } // pong
		if (!dataStr.startsWith('42[')) return; // not an event packet

		let parsed;
		try {
			parsed = JSON.parse(dataStr.substring(2));
		} catch (e) {
			this.dbg(`Event parse failed: ${String(e)}`);
			return;
		}
		const [event, payload] = parsed;
		this._lastEvent = event;
		this.dbg(`Event ${event} received; payload type: ${typeof payload}`);
		if (event === '/field/enter/v3') {
			this._applyEnterPayload(payload);
			// If we disconnected mid-batch previously, the server may still have zones entered for this token.
			// Leaving them on reconnect helps prevent server-side subscription buildup.
			await this.sendLeave(connection, Array.isArray(this._inFlightZones) ? this._inFlightZones : []);
			await this.sendNextBatch(connection); // first (or retried) batch
			return;
		}
		if (event === '/field/objects/v4') {
			await this.handleObjectsPayload(payload, connection);
			return;
		}
		if (event === '/march/objects' || event === '/march/object/update') {
			// Ignore march updates
			this.dbg(`Ignored event ${event}`);
			return;
		}
	}

	_applyEnterPayload(payload) {
		// Your working trace shows enter response contains { Payload: "{...map:{width,height}...}" }
		try {
			let decoded = null;
			if (payload && typeof payload.Payload === 'string') {
				decoded = JSON.parse(payload.Payload);
			} else if (payload && payload.Payload && typeof payload.Payload === 'object') {
				decoded = payload.Payload;
			} else if (payload && typeof payload === 'string') {
				// Extremely defensive: sometimes servers send just a JSON string.
				decoded = JSON.parse(payload);
			}
			// The server response includes the authoritative worldId in loc[0].
			if (decoded && Array.isArray(decoded.loc) && decoded.loc.length >= 1) {
				const enteredWorld = Number(decoded.loc[0]);
				if (Number.isFinite(enteredWorld)) {
					if (Number(this.worldId) !== enteredWorld) {
						this.log(`World mismatch: configured=${this.continent} enter.loc[0]=${enteredWorld}. Using enter world for zone requests.`);
					}
					this.worldId = enteredWorld;
				}
			}
			const w = decoded && decoded.map && decoded.map.width;
			const h = decoded && decoded.map && decoded.map.height;
			const zonesX = Number(w) / 32;
			const zonesY = Number(h) / 32;
			if (Number.isInteger(zonesX) && Number.isInteger(zonesY) && zonesX > 0 && zonesY > 0) {
				const computed = zonesX * zonesY;
				this.zonesX = zonesX;
				// Only rebuild the scan plan before we start scanning.
				if (computed && computed !== this.zoneCount && this.zoneIndex === 0) {
					this.zoneCount = computed;
					this.zoneNumbers = Array.from({ length: this.zoneCount }, (_, i) => i);
					this.dbg(`Derived zoneCount from map: ${zonesX}x${zonesY} => ${this.zoneCount}`);
				}
			}
		} catch (e) {
			this.dbg(`Enter payload parse failed: ${String(e)}`);
		}
	}

	async sendEnter(connection) {
		try {
			if (!this.token) this.log('sendEnter: missing token');
			const enc = await this.encryption.createXorMessage({ token: this.token }, this.xorPassword);
			const msg = `42["/field/enter/v3", ${JSON.stringify(enc)}]`;
			this.dbg(`Enter payload length: ${String(enc).length} xor=${this.xorPassword ? 'yes' : 'no'} base64=yes`);
			connection.sendUTF(msg);
			this._enterSent = true;
			this.log('Sent enter message');
		} catch (e) { this.log('Enter send failed ' + e); }
	}

	async sendLeave(connection, zones = []) {
		try {
			const payload = JSON.stringify({ world: this.worldId, zones: JSON.stringify(zones) });
			const msg = `42["/zone/leave/list/v2", ${payload}]`;
			connection.sendUTF(msg);
			this.dbg(`Sent leave for ${zones.length} zones`);
		} catch (e) { this.log('Leave send failed ' + e); }
	}

	async sendNextBatch(connection) {
		if (this.finished || this._saved) return;
		if (this._awaitingObjects) {
			this.dbg('sendNextBatch skipped (already awaiting objects)');
			return;
		}

		// If we previously sent a batch and never got objects, retry that same batch.
		let zonesSubset = this._inFlightZones;
		let startIndex = this._inFlightStartIndex;
		if (!Array.isArray(zonesSubset) || zonesSubset.length === 0) {
			startIndex = this.zoneIndex;
			zonesSubset = this.zoneNumbers.slice(this.zoneIndex, this.zoneIndex + BATCH_SIZE);
			this._inFlightStartIndex = startIndex;
			this._inFlightZones = zonesSubset;
		}

		if (!Array.isArray(zonesSubset) || zonesSubset.length === 0) {
			// Nothing left (edge)
			await this.finishAndPersist();
			return;
		}

		const projectedIndex = startIndex + zonesSubset.length;
		if (projectedIndex >= this.zoneCount) this.finished = true;
		const payloadObj = { world: this.worldId, zones: JSON.stringify(zonesSubset) };
		const enc = await this.encryption.createXorMessage(payloadObj, this.xorPassword);
		const msg = `42["/zone/enter/list/v4", ${JSON.stringify(enc)}]`;
		if (this._adaptiveBatchDelayMs > 0) await this.delay(this._adaptiveBatchDelayMs);
		connection.sendUTF(msg);
		this._lastRequestedZones = zonesSubset;
		this._awaitingObjects = true;
		this._startBatchWatchdog(connection);
		this.dbg(`Sent batch zones=${zonesSubset.length} startIndex=${startIndex} projectedIndex=${projectedIndex}/${this.zoneCount}`);
	}

	_startBatchWatchdog(connection) {
		this._clearBatchWatchdog();
		this._batchSeq += 1;
		const seq = this._batchSeq;
		this._batchTimer = setTimeout(() => {
			// Still waiting for objects for the current batch.
			if (!this._awaitingObjects) return;
			if (seq !== this._batchSeq) return;
			this._batchTimeoutsInARow += 1;
			this._adaptiveBatchDelayMs = Math.min(Math.max(this._adaptiveBatchDelayMs, 25) * 2, 500);
			const zonesInfo = Array.isArray(this._inFlightZones) ? `${this._inFlightZones.length} zones @${this._inFlightStartIndex}` : 'n/a';
			this.log(`Batch timeout after ${BATCH_TIMEOUT_MS}ms (no /field/objects/v4). inFlight=${zonesInfo} timeoutsInARow=${this._batchTimeoutsInARow} nextDelayMs=${this._adaptiveBatchDelayMs}`);
			// Try a single soft retry of the same batch before tearing down the socket.
			if (this._inFlightTimeoutRetries < 1 && Array.isArray(this._inFlightZones) && this._inFlightZones.length) {
				this._inFlightTimeoutRetries += 1;
				this._awaitingObjects = false;
				this._clearBatchWatchdog();
				this.dbg('Soft retry of in-flight batch after timeout');
				// Leave then resend the same batch on the same connection.
				this.sendLeave(connection, this._inFlightZones).then(() => this.sendNextBatch(connection)).catch(()=>{});
				return;
			}
			// If configured, skip the stuck batch to keep progress moving (best-effort mode).
			if (SKIP_ON_TIMEOUT && Array.isArray(this._inFlightZones) && this._inFlightZones.length) {
				const completedZones = this._inFlightZones;
				const completedStartIndex = Number.isFinite(Number(this._inFlightStartIndex)) ? this._inFlightStartIndex : this.zoneIndex;
				const completedEndIndex = completedStartIndex + completedZones.length;
				this.zoneIndex = Math.max(this.zoneIndex, completedEndIndex);
				this._awaitingObjects = false;
				this._inFlightTimeoutRetries = 0;
				this._inFlightZones = null;
				this._clearBatchWatchdog();
				for (const z of completedZones) this._skippedZones.add(z);
				this.log(`Skipped timed-out batch (best-effort). advancedTo=${this.zoneIndex}/${this.zoneCount}`);
				this.sendLeave(connection, completedZones).then(() => this.sendNextBatch(connection)).catch(()=>{});
				return;
			}
			this._closingFor = 'batch_timeout';
			try { connection.close(); } catch (_) {}
		}, BATCH_TIMEOUT_MS);
		if (typeof this._batchTimer.unref === 'function') this._batchTimer.unref();
	}

	_clearBatchWatchdog() {
		if (this._batchTimer) {
			clearTimeout(this._batchTimer);
			this._batchTimer = null;
		}
	}

	async handleObjectsPayload(payload, connection) {
		let decoded;
		try {
			// Plaintext path: socket sends { EventName, Payload: "{...}" }
			if (payload && typeof payload.Payload === 'string') {
				decoded = JSON.parse(payload.Payload);
			} else if (payload && payload.Payload && typeof payload.Payload === 'object') {
				decoded = payload.Payload;
			} else if (payload && typeof payload === 'object' && payload.objects) {
				decoded = payload;
			} else if (payload && payload.packs) {
				// Encrypted/compressed legacy path
				const packsLen = payload.packs ? payload.packs.length : 0;
				this.dbg(`Objects packs length=${packsLen}`);
				const decompressed = await this.encryption.decodeGunzip(payload.packs);
				const decrypted = await this.encryption.decryptXorMessage(decompressed.toString(), this.xorPassword);
				decoded = JSON.parse(decrypted);
			}
			if (!decoded) throw new Error('Unknown objects payload shape');
		} catch (e) {
			this.log('Failed decoding objects payload ' + e);
			this.dbg(`Decode diagnostics: xor=${this.xorPassword ? 'yes' : 'no'}`);
			return;
		}
		this._awaitingObjects = false;
		this._batchTimeoutsInARow = 0;
		this._inFlightTimeoutRetries = 0;
		this._clearBatchWatchdog();
		// If we've backed off due to timeouts, allow it to recover slowly.
		if (this._adaptiveBatchDelayMs > BATCH_DELAY_MS) {
			this._adaptiveBatchDelayMs = Math.max(BATCH_DELAY_MS, Math.floor(this._adaptiveBatchDelayMs / 2));
		}

		// Mark the in-flight batch as completed only after we successfully decoded objects.
		const completedZones = Array.isArray(this._inFlightZones) ? this._inFlightZones : [];
		const completedStartIndex = Number.isFinite(Number(this._inFlightStartIndex)) ? this._inFlightStartIndex : this.zoneIndex;
		const completedEndIndex = completedStartIndex + completedZones.length;
		this.zoneIndex = Math.max(this.zoneIndex, completedEndIndex);
		// Clear in-flight so the next send uses the next slice.
		this._inFlightZones = null;

		const newObjs = decoded.objects || [];
		this.objects.push(...newObjs);
		const denom = this.zoneCount || DEFAULT_ZONE_COUNT;
		const percent = ((Math.min(this.zoneIndex, denom) / denom) * 100).toFixed(1);
		this.log(`Received ${newObjs.length} objects (${percent}% zones)`);
		if (this.finished || this.zoneIndex >= denom) {
			await this.finishAndPersist(connection);
			return;
		}
		// Leave the zones we just completed.
		await this.sendLeave(connection, completedZones);
		await this.sendNextBatch(connection);
	}

	async finishAndPersist(connection) {
		if (this._saved) return;

		// If we have skipped zones and haven't retried yet, report best-effort now, then launch a retry pass for those zones.
		if (!this._isRetryPass && this._skippedZones.size > 0) {
			this._saved = true;
			this.log(`Best-effort pass done with ${this._skippedZones.size} skipped zones – persisting & notifying before retry pass`);
			this.dbg(`Total objects accumulated (best-effort): ${this.objects.length}`);
			try { await this.processAndSaveData(this.objects); } catch (e) { this.log('Persist error ' + e); }
			// Prepare retry pass
			this._isRetryPass = true;
			this._saved = false;
			this.finished = false;
			this._awaitingObjects = false;
			this._inFlightZones = null;
			this._inFlightStartIndex = 0;
			this._inFlightTimeoutRetries = 0;
			this._lastRequestedZones = null;
			this._batchTimeoutsInARow = 0;
			this._clearBatchWatchdog();
			this.zoneNumbers = Array.from(this._skippedZones).sort((a, b) => a - b);
			this.zoneCount = this.zoneNumbers.length;
			this.zoneIndex = 0;
			this._skippedZones = new Set();
			this.log(`Retrying ${this.zoneCount} skipped zones (second pass)`);
			await this.sendLeave(connection, []);
			await this.sendNextBatch(connection);
			return;
		}

		this._saved = true;
		this.log('All zones processed – persisting data');
		this.dbg(`Total objects accumulated: ${this.objects.length}`);
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
		if (err && err.stack) this.dbg(String(err.stack).split('\n')[0]);
	}

	async onClose(code, description) {
		const codeStr = (code !== undefined && code !== null) ? String(code) : 'n/a';
		const descStr = description ? String(description) : '';
		this.log(`Connection closed (code=${codeStr}${descStr ? ` desc=${descStr}` : ''})`);
		this.dbg(`Last event=${this._lastEvent} lastPingAt=${this._lastPingAt} lastPongAt=${this._lastPongAt}`);
		this._clearBatchWatchdog();
		// If we were waiting on a batch and the socket died before we could skip/retry, mark those zones as skipped for the retry pass.
		if (this._awaitingObjects && Array.isArray(this._inFlightZones) && this._inFlightZones.length) {
			for (const z of this._inFlightZones) this._skippedZones.add(z);
			this.dbg(`Marked in-flight zones as skipped due to close: ${this._inFlightZones.length}`);
		}
		this._awaitingObjects = false;
		const closingFor = this._closingFor;
		this._closingFor = null;
		if (this.finished || this._saved) { this._finalize('normal_close'); return; }
		if (Scanner.isPaused()) { this._finalize('paused_close'); return; }
		if (this._reconnectAttempts >= this.maxReconnects) { this._finalize('reconnect_limit'); return; }
		// If we closed intentionally (watchdog), don't treat it as an unexpected failure.
		if (closingFor === 'batch_timeout') {
			this.log('Reconnect after batch-timeout watchdog');
		} else {
			this._reconnectAttempts++;
			this.log(`Closed unexpectedly – reconnect attempt ${this._reconnectAttempts}`);
		}
		try { await this.fetchLatestToken(); } catch (e) { this.dbg(`Token refresh failed: ${e}`); }
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
			const zx = Number.isFinite(Number(this.zonesX)) ? Number(this.zonesX) : 64;
			const zone = (typeof x === 'number' && typeof y === 'number') ? (Math.floor(x / 32) + zx * Math.floor(y / 32)) : null;
			return {
				fid: _id,
				zone,
				code,
				continent: this.worldId,
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

			// Whitelist licenses may still be stored under legacy `continent` values after migration.
			// To avoid false positives, load whitelist across all worldIds linked to this guild
			// (both legacy `continent` and migrated `new_continent`) and treat ANY matching license as valid.
			let worldIds = [];
			try {
				if (typeof Scanner.sql.getGuildWorldIds === 'function') {
					worldIds = await Scanner.sql.getGuildWorldIds(this.guildId);
				}
			} catch (_) {}
			if (!Array.isArray(worldIds) || worldIds.length === 0) {
				worldIds = [Number(this.worldId ?? this.continent)];
			}
			worldIds = worldIds.map(Number).filter(Number.isFinite);
			if (worldIds.length === 0) worldIds = [Number(this.worldId ?? this.continent)].filter(Number.isFinite);
			if (DEBUG && worldIds.length > 1) {
				this.dbg(`Whitelist worldIds for guild ${this.guildId}: ${worldIds.join(',')}`);
			}

			const whitelistByKingdom = {};
			for (const wid of worldIds) {
				let rows = [];
				try { rows = await Scanner.sql.getWhitelist(this.guildId, wid); } catch (_) { rows = []; }
				if (!Array.isArray(rows) || rows.length === 0) continue;
				for (const row of rows) {
					const cmineExpiryTime = row.cmine_expiry ? new Date(row.cmine_expiry).getTime() : null;
					const dsaExpiryTime = row.dsa_expiry ? new Date(row.dsa_expiry).getTime() : null;
					const entry = {
						cmine: Number.parseInt(row.cmine, 10) || 0,
						dsa: Number.parseInt(row.dsa, 10) || 0,
						cmineExpiry: Number.isFinite(cmineExpiryTime) ? cmineExpiryTime : null,
						dsaExpiry: Number.isFinite(dsaExpiryTime) ? dsaExpiryTime : null,
						worldId: wid,
					};
					const kid = row.kingdomid;
					if (!whitelistByKingdom[kid]) whitelistByKingdom[kid] = [];
					whitelistByKingdom[kid].push(entry);
				}
			}

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
				const wls = kingdomId !== null ? whitelistByKingdom[kingdomId] : null;
				let startedAt = null;
				if (r.occupied.started) {
					const ts = new Date(r.occupied.started).getTime();
					if (Number.isFinite(ts)) startedAt = ts;
				}
				if (r.code === 20100105 && r.level > minCmine) {
					if (Array.isArray(wls) && wls.length) {
						for (const wl of wls) {
							if (wl.cmine >= r.level) return false;
							if (wl.cmineExpiry !== null && startedAt !== null && startedAt <= wl.cmineExpiry) return false;
						}
					}
					return true;
				}
				if (r.code === 20100106 && r.level > minDsa) {
					if (Array.isArray(wls) && wls.length) {
						for (const wl of wls) {
							if (wl.dsa >= r.level) return false;
							if (wl.dsaExpiry !== null && startedAt !== null && startedAt <= wl.dsaExpiry) return false;
						}
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
				continent: this.worldId ?? this.continent,
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

