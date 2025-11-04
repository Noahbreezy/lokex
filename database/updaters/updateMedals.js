const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cron = require('node-cron');
const { Client, GatewayIntentBits, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
require('dotenv').config();

class UpdateMedals {
	constructor(sqlInstance, apiInstance) {
		this.sql = sqlInstance;
		this.api = apiInstance;

		this.discordClient = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
			],
		});

		this.discordToken = process.env.DISCORD_TOKEN;

		if (!this.discordToken) {
			console.warn('DISCORD_TOKEN not set. UpdateMedals cannot send Discord notifications.');
			this.readyPromise = Promise.resolve();
		} else {
			let readyResolve;
			this.readyPromise = new Promise((resolve) => {
				readyResolve = resolve;
				this.discordClient.once('ready', () => {
					console.log('UpdateMedals Discord client is ready.');
					resolve();
				});
			});

			this.discordClient.login(this.discordToken).catch((error) => {
				console.error('Failed to login Discord client for UpdateMedals:', error);
				if (typeof readyResolve === 'function') {
					readyResolve();
				}
			});
		}

		this.guildCache = new Map();
		this.isRunning = false;
	}

	start() {
		this.scheduleDailyJob();
	}

	scheduleDailyJob() {
		cron.schedule('0 9 * * *', () => {
			this.executeCycle().catch((error) => {
				console.error('UpdateMedals executeCycle error:', error);
			});
		}, { timezone: 'UTC' });

		console.log('UpdateMedals scheduler started - runs daily at 09:00 UTC');
	}

	async executeCycle() {
		if (this.isRunning) {
			console.warn('UpdateMedals cycle skipped because a previous run is still in progress.');
			return;
		}

		this.isRunning = true;
		try {
			await this.readyPromise;

			const now = new Date();
			const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const fromDateTime = this.formatDateTimeForSql(windowStart);
			const toDateTime = this.formatDateTimeForSql(now);

			const guildIds = await this.getTrackedGuildIds();
			if (!guildIds.length) {
				console.log('UpdateMedals: No guilds found to process.');
				return;
			}

			for (const guildId of guildIds) {
				await this.processGuild(guildId, {
					windowStart,
					windowEnd: now,
					fromDateTime,
					toDateTime,
				});
			}
		} catch (error) {
			console.error('UpdateMedals cycle failed:', error);
		} finally {
			this.isRunning = false;
		}
	}

	async processGuild(guildId, timeContext) {
		try {
			const queenToken = await this.getQueenToken(guildId);
			if (!queenToken) {
				return;
			}

			const mailInfo = await this.fetchShrineMailInfo(queenToken, timeContext.windowStart);
			if (!mailInfo.hasMail) {
				return;
			}

			const reportData = await this.collectMedalPurchaseData(guildId, timeContext);

			if (!reportData || reportData.purchaseSummaries.length === 0) {
				await this.announceNoPurchases(guildId, mailInfo);
				return;
			}

			await this.sendPurchaseReport(guildId, mailInfo, timeContext, reportData);
		} catch (error) {
			console.error(`UpdateMedals failed for guild ${guildId}:`, error);
		}
	}

	async getTrackedGuildIds() {
		try {
			const rows = await this.sql.query("SELECT DISTINCT guild_id FROM guild_settings WHERE LENGTH(guild_id) > 2;");
			if (!Array.isArray(rows)) {
				return [];
			}
			const guildIds = rows
				.map((row) => row.guild_id)
				.filter(Boolean)
				.map((id) => id.toString().trim());
			return [...new Set(guildIds)];
		} catch (error) {
			console.error('UpdateMedals getTrackedGuildIds error:', error);
			return [];
		}
	}

	async getQueenToken(guildId) {
		try {
			const rows = await this.sql.getQueenToken(guildId);
			if (Array.isArray(rows) && rows.length > 0 && rows[0]?.token) {
				return rows[0].token;
			}
		} catch (error) {
			console.error(`UpdateMedals failed to fetch queen token for guild ${guildId}:`, error);
		}
		return null;
	}

	async fetchShrineMailInfo(token, since) {
		const url = 'https://api-lok-live.leagueofkingdoms.com/api/mail/list';
		const headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
			'Accept': '*/*',
			'Content-Type': 'application/x-www-form-urlencoded',
			'x-access-token': token,
			'Origin': 'https://play.leagueofkingdoms.com',
			'Referer': 'https://play.leagueofkingdoms.com/',
		};
		const body = `json=${encodeURIComponent(JSON.stringify({ category: 3 }))}`;

		try {
			const response = await this.api.request(url, body, headers);
			let mails = Array.isArray(response?.data?.mails) ? response.data.mails : [];

			if ((!mails || mails.length === 0) && response?.data?.payload) {
				const decoded = this.tryDecodePayload(response.data.payload);
				if (decoded && Array.isArray(decoded.mails)) {
					mails = decoded.mails;
				}
			}

			if (!Array.isArray(mails) || mails.length === 0) {
				return { hasMail: false };
			}

			const relevant = mails.filter((mail) => {
				if (!mail || mail.type !== 15) {
					return false;
				}
				const subtitle = mail?.subject?.subTitle;
				if (typeof subtitle !== 'string') {
					return false;
				}
				const receivedAt = mail.receiveDate ? new Date(mail.receiveDate) : null;
				if (!receivedAt || Number.isNaN(receivedAt.getTime())) {
					return false;
				}
				return subtitle.toLowerCase().includes('shrine') && receivedAt >= since;
			});

			if (relevant.length === 0) {
				return { hasMail: false };
			}

			let latestMailDate = relevant.reduce((latest, mail) => {
				const receivedAt = new Date(mail.receiveDate);
				if (!latest || receivedAt > latest) {
					return receivedAt;
				}
				return latest;
			}, null);

			latestMailDate = latestMailDate ?? null;

			return {
				hasMail: true,
				mailCount: relevant.length,
				latestMailDate,
			};
		} catch (error) {
			console.error('UpdateMedals fetchShrineMailInfo error:', error);
			return { hasMail: false };
		}
	}

	tryDecodePayload(payload) {
		try {
			const buffer = Buffer.from(payload, 'base64');
			const decompressed = zlib.gunzipSync(buffer).toString('utf8');
			return JSON.parse(decompressed);
		} catch (error) {
			console.warn('UpdateMedals failed to decode payload:', error.message);
			return null;
		}
	}

	async collectMedalPurchaseData(guildId, { fromDateTime, toDateTime }) {
		try {
			const history = await this.sql.getMedalsHistory(guildId, fromDateTime, toDateTime);
			const kingdomSummaries = Array.isArray(history?.kingdomSummaries) ? history.kingdomSummaries : [];

			if (kingdomSummaries.length === 0) {
				return { purchaseSummaries: [], totalMedalsSpent: 0 };
			}

			const totalsMap = await this.sql.getAllMedalTotals(guildId);

			const purchaseSummaries = kingdomSummaries
				.map((summary) => ({
					kingdomId: summary.kingdomId,
					startingBalance: Number(summary.startingBalance || 0),
					totalPositive: Number(summary.totalPositive || 0),
					totalNegative: Number(summary.totalNegative || 0),
					netChange: Number(summary.netChange || 0),
					endingBalance: Number(
						totalsMap instanceof Map
							? totalsMap.get(summary.kingdomId) ?? summary.endingBalance ?? 0
							: summary.endingBalance ?? 0
					),
					transactionCount: Number(summary.transactionCount || 0),
				}))
				.filter((summary) => summary.totalNegative < 0);

			if (purchaseSummaries.length === 0) {
				return { purchaseSummaries: [], totalMedalsSpent: 0 };
			}

			purchaseSummaries.sort((a, b) => Math.abs(b.totalNegative) - Math.abs(a.totalNegative));

			const totalMedalsSpent = purchaseSummaries.reduce((accumulator, summary) => {
				return accumulator + Math.abs(summary.totalNegative);
			}, 0);

			return { purchaseSummaries, totalMedalsSpent };
		} catch (error) {
			console.error(`UpdateMedals collectMedalPurchaseData error for guild ${guildId}:`, error);
			return { purchaseSummaries: [], totalMedalsSpent: 0 };
		}
	}

	async announceNoPurchases(guildId, mailInfo) {
		const channelInfo = await this.fetchLogChannel(guildId);
		if (!channelInfo || !channelInfo.channel) {
			return;
		}

		const { channel } = channelInfo;

		try {
			await channel.send('No medals bought during this cycle');
		} catch (error) {
			console.error(`UpdateMedals announceNoPurchases failed for guild ${guildId}:`, error);
		}
	}

	async sendPurchaseReport(guildId, mailInfo, timeContext, reportData) {
		const channelInfo = await this.fetchLogChannel(guildId);
		if (!channelInfo || !channelInfo.channel || !channelInfo.guild) {
			return;
		}

		const { channel, guild } = channelInfo;

		try {
			await guild.roles.fetch().catch(() => null);
			const adminMentions = this.resolveAdminRoleMentions(guild);

			const csvContent = this.generateCsv(reportData.purchaseSummaries);
			if (!csvContent) {
				console.warn(`UpdateMedals: CSV generation returned empty content for guild ${guildId}.`);
				return;
			}

			const fileName = `shrine_medals_${guildId}_${this.formatFileTimestamp(timeContext.windowEnd)}.csv`;
			const tempFilePath = path.join(__dirname, '..', '..', '..', 'temp', fileName);
			const tempDir = path.dirname(tempFilePath);

			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true });
			}

			fs.writeFileSync(tempFilePath, '\ufeff' + csvContent, { encoding: 'utf8' });

			const attachment = new AttachmentBuilder(tempFilePath, { name: fileName });

			const totalMedalsSpent = this.formatNumber(reportData.totalMedalsSpent);
			const timeframe = `${this.formatDisplayDate(timeContext.windowStart)} - ${this.formatDisplayDate(timeContext.windowEnd)}`;
			const mailCount = typeof mailInfo.mailCount === 'number' ? mailInfo.mailCount : 0;
			const mailLine = mailInfo.latestMailDate
				? `Latest shrine mail: ${this.formatDisplayDate(mailInfo.latestMailDate)} (detected ${mailCount}).`
				: `Shrine mails detected: ${mailCount}.`;

			const messageParts = [];
			if (adminMentions) {
				messageParts.push(adminMentions);
			}
			messageParts.push('📊 **Shrine Medal Purchases Report**');
			messageParts.push(`🕒 Window: ${timeframe}`);
			messageParts.push(mailLine);
			messageParts.push(`🏅 Total medals spent: ${totalMedalsSpent}`);
			messageParts.push(`🏰 Kingdoms buying medals: ${reportData.purchaseSummaries.length}`);

			await channel.send({
				content: messageParts.join('\n'),
				files: [attachment],
			});

			setTimeout(() => {
				try {
					if (fs.existsSync(tempFilePath)) {
						fs.unlinkSync(tempFilePath);
					}
				} catch (cleanupError) {
					console.error('UpdateMedals failed to cleanup report file:', cleanupError);
				}
			}, 60_000);
		} catch (error) {
			console.error(`UpdateMedals sendPurchaseReport failed for guild ${guildId}:`, error);
		}
	}

	async fetchLogChannel(guildId) {
		try {
			const rows = await this.sql.getGuildLogChannels(guildId);
			if (!Array.isArray(rows) || rows.length === 0) {
				return null;
			}

			const channels = rows[0] || {};
			const channelId = channels.shop_log_channel || channels.accept_log_channel;
			if (!channelId) {
				return null;
			}

			const guild = await this.fetchGuild(guildId);
			if (!guild) {
				return null;
			}

			const channel = await guild.channels.fetch(channelId).catch(() => null);
			if (!channel) {
				return null;
			}

			return { guild, channel };
		} catch (error) {
			console.error(`UpdateMedals fetchLogChannel error for guild ${guildId}:`, error);
			return null;
		}
	}

	async fetchGuild(guildId) {
		if (this.guildCache.has(guildId)) {
			return this.guildCache.get(guildId);
		}

		try {
			const guild = await this.discordClient.guilds.fetch(guildId);
			this.guildCache.set(guildId, guild);
			return guild;
		} catch (error) {
			console.error(`UpdateMedals failed to fetch guild ${guildId}:`, error);
			return null;
		}
	}

	resolveAdminRoleMentions(guild) {
		if (!guild?.roles?.cache) {
			return '';
		}

		const adminRoles = guild.roles.cache
			.filter((role) => role.id !== guild.id && role.permissions.has(PermissionFlagsBits.Administrator));

		if (!adminRoles.size) {
			return '';
		}

		const sortedRoles = adminRoles.sort((a, b) => b.position - a.position);
		const topRoles = sortedRoles.first(2).filter(Boolean);

		if (!topRoles.length) {
			return '';
		}

		return topRoles.map((role) => `<@&${role.id}>`).join(' ');
	}

	generateCsv(purchaseSummaries) {
		if (!Array.isArray(purchaseSummaries) || purchaseSummaries.length === 0) {
			return '';
		}

		const escapeCsvValue = (value) => {
			if (value === null || value === undefined) {
				return '';
			}
			const stringValue = String(value);
			if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
				return '"' + stringValue.replace(/"/g, '""') + '"';
			}
			return stringValue;
		};

		const lines = ['sep=,'];
		lines.push('Kingdom ID,Starting Balance,Total Gains,Total Losses,Net Change,Ending Balance,Transactions');

		for (const summary of purchaseSummaries) {
			lines.push([
				escapeCsvValue(summary.kingdomId),
				summary.startingBalance,
				summary.totalPositive,
				summary.totalNegative,
				summary.netChange,
				summary.endingBalance,
				summary.transactionCount,
			].join(','));
		}

		return lines.join('\n');
	}

	formatDateTimeForSql(date) {
		const pad = (value) => value.toString().padStart(2, '0');
		return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
	}

	formatDisplayDate(dateInput) {
		const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
		if (Number.isNaN(date.getTime())) {
			return 'Unknown';
		}
		const pad = (value) => value.toString().padStart(2, '0');
		return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
	}

	formatFileTimestamp(date) {
		const pad = (value) => value.toString().padStart(2, '0');
		return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
	}

	formatNumber(value) {
		return Number(value || 0).toLocaleString('en-US');
	}
}

module.exports = UpdateMedals;

