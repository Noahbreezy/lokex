const cron = require('node-cron');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const R4Check = require('../../alliancemanager/r4check.js');
require('dotenv').config();

const MEMBERS_ENDPOINT = 'https://api-lok-live.leagueofkingdoms.com/api/alliance/members/list';
const MEDAL_ENDPOINT = 'https://api-lok-live.leagueofkingdoms.com/api/alliance/medal/distribute';
const MEDAL_HISTORY_ENDPOINT = 'https://api-lok-live.leagueofkingdoms.com/api/alliance/medal/history';
const MAX_MEDALS_PER_DISTRIBUTION = 40000;
const REPORT_LIST_LIMIT = 20;
const MANAGER_RANK_RETRIES = 2;
const MANAGER_RANK_DELAY_MS = 5000;

class UpdateMedals {
	constructor(sqlInstance, apiInstance) {
		this.sql = sqlInstance;
		this.api = apiInstance;
		this.r4Check = new R4Check(this.sql, this.api);

		this.discordToken = process.env.DISCORD_TOKEN;
		this.discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

		if (!this.discordToken) {
			console.warn('DISCORD_TOKEN not set. UpdateMedals will skip Discord reporting.');
			this.readyPromise = Promise.resolve();
		} else {
			let readyResolve;
			this.readyPromise = new Promise((resolve) => {
				readyResolve = resolve;
				this.discordClient.once('ready', () => {
					console.log('UpdateMedals Discord client ready.');
					resolve();
				});
			});

			this.discordClient.login(this.discordToken).catch((error) => {
				console.error('UpdateMedals Discord login failed:', error);
				if (typeof readyResolve === 'function') {
					readyResolve();
				}
			});
		}

		this.isRunning = false;
	}

	start() {
		this.scheduleDailyJob();
	}

	scheduleDailyJob() {
		cron.schedule('0 10 * * *', () => {
			this.executeCycle().catch((error) => {
				console.error('UpdateMedals executeCycle error:', error);
			});
		}, { timezone: 'UTC' });
		console.log('UpdateMedals scheduler started - runs daily at 10:00 UTC');
	}

	async executeCycle() {
		if (this.isRunning) {
			console.warn('UpdateMedals cycle skipped because a previous run is still active.');
			return;
		}

		this.isRunning = true;
		try {
			await this.readyPromise;
			const guildRows = await this.sql.getGuildsWithActiveSubscription();
			const guildIds = Array.isArray(guildRows)
				? guildRows
					.map((row) => row.guild_id || row.guildId)
					.filter(Boolean)
					.map((id) => id.toString())
				: [];

			if (!guildIds.length) {
				console.log('UpdateMedals: No guilds with active subscriptions.');
				return;
			}

			for (const guildId of guildIds) {
				await this.processGuild(guildId);
			}
		} catch (error) {
			console.error('UpdateMedals executeCycle failed:', error);
		} finally {
			this.isRunning = false;
		}
	}

	async processGuild(guildId) {
		const summary = {
			guildId,
			totalMedals: 0,
			recipients: 0,
			entries: [],
			failures: [],
			managersProcessed: 0,
			managersSucceeded: 0,
		};

		try {
			const owedTotals = await this.sql.getAllMedalTotals(guildId);
			const owedMap = new Map();
			if (owedTotals instanceof Map) {
				for (const [kingdomId, amount] of owedTotals.entries()) {
					const numericAmount = Number(amount);
					if (Number.isFinite(numericAmount) && numericAmount > 0) {
						owedMap.set(kingdomId.toString(), Math.trunc(numericAmount));
					}
				}
			}

			if (!owedMap.size) {
				summary.failures.push('No outstanding medal balances.');
				await this.sendDiscordReport(summary);
				return summary;
			}

			const tokenRows = await this.sql.getManagerTokens(guildId);
			const managerTokens = Array.isArray(tokenRows)
				? tokenRows.map((row) => row.token).filter(Boolean)
				: [];

			if (!managerTokens.length) {
				summary.failures.push('No manager tokens configured.');
				await this.sendDiscordReport(summary);
				return summary;
			}

			for (const token of managerTokens) {
				if (!token) continue;
				summary.managersProcessed += 1;

				const managerMeta = await this.lookupManagerMetadata(token);
				if (!managerMeta || !managerMeta.allianceId) {
					summary.failures.push('Manager token found without alliance information.');
					continue;
				}

				const rank = await this.checkIfManagerIsR5(managerMeta);
				if (!rank?.isR5) {
					summary.failures.push(`Manager ${managerMeta.allianceId} is not R5.`);
					continue;
				}

				const memberIds = await this.fetchAllianceMembers(managerMeta);
				if (!memberIds || !memberIds.length) {
					summary.failures.push(`No members retrieved for alliance ${managerMeta.allianceId}.`);
					continue;
				}

				const distributionPlan = this.buildDistributionPlan(memberIds, owedMap);
				if (!distributionPlan.length) {
					continue;
				}

				const distributionResult = await this.sendBatchDistribution(token, distributionPlan);
				let planToPersist = distributionPlan;
				if (!distributionResult.success) {
					console.warn(`Batch medal distribution failed for alliance ${managerMeta.allianceId}; attempting individual payouts.`);
					const fallbackResult = await this.distributeIndividually(token, distributionPlan);
					if (fallbackResult.failures.length) {
						summary.failures.push(...fallbackResult.failures);
					}
					const aggregated = this.aggregateDistributions(fallbackResult.distributed);
					if (!aggregated.length) {
						summary.failures.push(`Distribution failed for alliance ${managerMeta.allianceId}.`);
						continue;
					}
					planToPersist = aggregated;
				}

				const persisted = await this.persistDistribution(guildId, planToPersist);
				if (!persisted.length) {
					summary.failures.push(`Distribution failed for alliance ${managerMeta.allianceId}.`);
					continue;
				}

				for (const record of persisted) {
					const currentOwed = owedMap.get(record.kingdomId) || 0;
					owedMap.set(record.kingdomId, Math.max(0, currentOwed - record.delta));
					summary.entries.push({ ...record, allianceId: managerMeta.allianceId });
					summary.totalMedals += record.delta;
					summary.recipients += 1;
				}

				summary.managersSucceeded += 1;
			}
		} catch (error) {
			console.error(`UpdateMedals processGuild failed for ${guildId}:`, error);
			summary.failures.push('Unexpected error during processing.');
		}

		await this.sendDiscordReport(summary);
		return summary;
	}

	async lookupManagerMetadata(token) {
		try {
			const rows = await this.sql.query(
				"SELECT kingdomId, allianceId, allianceTag FROM botAccounts WHERE token = ? AND role = 'MANAGER' LIMIT 1;",
				[token]
			);
			if (Array.isArray(rows) && rows.length > 0) {
				return {
					token,
					kingdomId: rows[0].kingdomId,
					allianceId: rows[0].allianceId,
					allianceTag: rows[0].allianceTag,
				};
			}
		} catch (error) {
			console.error('UpdateMedals lookupManagerMetadata error:', error);
		}
		return null;
	}

	async checkIfManagerIsR5(managerMeta) {
		try {
			return await this.r4Check.checkR4(
				managerMeta.token,
				managerMeta.kingdomId,
				managerMeta.allianceId,
				MANAGER_RANK_RETRIES,
				MANAGER_RANK_DELAY_MS,
				MANAGER_RANK_RETRIES
			);
		} catch (error) {
			console.error(`UpdateMedals rank check failed for ${managerMeta.allianceId}:`, error);
			return null;
		}
	}

	async fetchAllianceMembers(managerMeta) {
		try {
			const response = await this.api.request(
				MEMBERS_ENDPOINT,
				{ allianceId: managerMeta.allianceId },
				{
					'x-access-token': managerMeta.token,
					'Content-Type': 'application/json',
				}
			);

			if (!response || response.status !== 200) {
				return null;
			}

			const groups = Array.isArray(response.data?.members) ? response.data.members : [];
			const memberIds = new Set();
			for (const group of groups) {
				if (!Array.isArray(group?.members)) continue;
				for (const member of group.members) {
					if (member?.kingdomId) {
						memberIds.add(member.kingdomId.toString());
					}
				}
			}
			return Array.from(memberIds);
		} catch (error) {
			console.error(`UpdateMedals failed to fetch members for alliance ${managerMeta.allianceId}:`, error);
			return null;
		}
	}

	buildDistributionPlan(memberIds, owedMap) {
		const plan = [];
		for (const kingdomId of memberIds) {
			const owed = owedMap.get(kingdomId);
			if (!owed || owed <= 0) continue;
			const normalized = Number.isFinite(owed) ? Math.trunc(owed) : 0;
			const delta = Math.max(0, Math.min(normalized, MAX_MEDALS_PER_DISTRIBUTION));
			if (delta > 0) {
				plan.push({ kingdomId, delta });
			}
		}
		return plan;
	}

	async sendBatchDistribution(token, plan) {
		return this.requestMedalDistribution(token, plan);
	}

	async distributeIndividually(token, plan) {
		const distributed = [];
		const failures = [];
		const exceedEntries = [];

		for (const entry of plan) {
			const kingdomId = entry.kingdomId.toString();
			const delta = Number(entry.delta) || 0;
			if (delta <= 0) {
				continue;
			}

			const attempt = await this.requestMedalDistribution(token, [{ kingdomId, delta }]);
			if (attempt.success) {
				distributed.push({ kingdomId, delta });
				continue;
			}

			if (attempt.errorCode === 'medal_distribution_exceed') {
				const singleResult = await this.requestMedalDistribution(token, [{ kingdomId, delta: 1 }]);
				if (!singleResult.success) {
					if (singleResult.errorCode === 'medal_distribution_exceed') {
						failures.push(`Kingdom ${kingdomId} exceeded medal cap even at 1 medal; skipping.`);
					} else {
						failures.push(`Kingdom ${kingdomId} single medal attempt failed: ${singleResult.errorCode || singleResult.error || 'unknown error'}.`);
					}
					continue;
				}
				distributed.push({ kingdomId, delta: 1 });
				const outstanding = Math.max(0, delta - 1);
				if (outstanding > 0) {
					exceedEntries.push({ kingdomId, outstanding });
				}
				continue;
			}

			const reason = attempt.errorCode || attempt.error || 'unknown error';
			failures.push(`Kingdom ${kingdomId} distribution failed: ${reason}.`);
		}

		if (exceedEntries.length) {
			const historyResult = await this.fetchMedalHistoryMap(token);
			if (!historyResult.success) {
				failures.push('Unable to fetch medal history after exceed errors; skipping remaining follow-ups.');
			} else {
				for (const item of exceedEntries) {
					const after = historyResult.map.get(item.kingdomId);
					if (!Number.isFinite(after)) {
						failures.push(`Kingdom ${item.kingdomId} missing medal history; follow-up skipped.`);
						continue;
					}

					const remainingAllowance = Math.max(0, MAX_MEDALS_PER_DISTRIBUTION - after);
					if (remainingAllowance <= 0) {
						failures.push(`Kingdom ${item.kingdomId} has no remaining medal allowance after history check.`);
						continue;
					}

					const followUpDelta = Math.min(remainingAllowance, item.outstanding);
					if (followUpDelta <= 0) {
						continue;
					}

					const followUpResult = await this.requestMedalDistribution(token, [{ kingdomId: item.kingdomId, delta: followUpDelta }]);
					if (followUpResult.success) {
						distributed.push({ kingdomId: item.kingdomId, delta: followUpDelta });
					} else {
						const followUpReason = followUpResult.errorCode || followUpResult.error || 'unknown error';
						failures.push(`Kingdom ${item.kingdomId} follow-up distribution failed: ${followUpReason}.`);
					}
				}
			}
		}

		return { distributed, failures };
	}

	aggregateDistributions(entries) {
		if (!Array.isArray(entries) || !entries.length) {
			return [];
		}
		const aggregated = new Map();
		for (const entry of entries) {
			const kingdomId = entry.kingdomId.toString();
			const delta = Number(entry.delta) || 0;
			if (delta <= 0) {
				continue;
			}
			aggregated.set(kingdomId, (aggregated.get(kingdomId) || 0) + delta);
		}
		return Array.from(aggregated.entries()).map(([kingdomId, delta]) => ({ kingdomId, delta }));
	}

	async requestMedalDistribution(token, members) {
		if (!Array.isArray(members) || !members.length) {
			return { success: true, response: null };
		}

		const payload = new URLSearchParams({
			json: JSON.stringify({
				members: members.map((entry) => ({
					kingdomId: entry.kingdomId.toString(),
					delta: Math.trunc(entry.delta),
				})),
			}),
		});

		try {
			const response = await this.api.request(MEDAL_ENDPOINT, payload, { 'x-access-token': token });
			if (response?.data?.result === false) {
				console.warn('Medal distribution API returned false result:', response.data);
				return {
					success: false,
					errorCode: response?.data?.err?.code || null,
					response: response.data,
				};
			}
			return {
				success: true,
				response: response?.data || null,
			};
		} catch (error) {
			const errorPayload = error?.response?.data || error?.message || error;
			const errorCode = error?.response?.data?.err?.code || error?.err?.code || null;
			console.error('Medal distribution request failed:', errorPayload);
			return {
				success: false,
				errorCode,
				error: errorPayload,
			};
		}
	}

	async fetchMedalHistoryMap(token) {
		const payload = new URLSearchParams({
			json: JSON.stringify({}),
		});

		try {
			const response = await this.api.request(MEDAL_HISTORY_ENDPOINT, payload, { 'x-access-token': token });
			const history = Array.isArray(response?.data?.history) ? response.data.history : [];
			const map = new Map();
			for (const record of history) {
				const kingdomId = record?.kingdom?._id?.toString();
				if (!kingdomId) {
					continue;
				}
				const after = Number(record.after);
				if (Number.isFinite(after)) {
					map.set(kingdomId, after);
				}
			}
			return { success: true, map, response: response?.data || null };
		} catch (error) {
			const errorPayload = error?.response?.data || error?.message || error;
			console.error('Medal history request failed:', errorPayload);
			return { success: false, error: errorPayload };
		}
	}

	async persistDistribution(guildId, plan) {
		const persisted = [];
		for (const entry of plan) {
			try {
				const rows = await this.sql.getVerifiedDiscordId(entry.kingdomId.toString(), guildId);
				const discordId = rows?.[0]?.discordId || null;
				await this.sql.recordMedalTransaction(entry.kingdomId.toString(), discordId, -entry.delta, guildId);
				persisted.push({ ...entry, discordId });
			} catch (error) {
				console.error(`Failed to persist medal transaction for kingdom ${entry.kingdomId}:`, error);
			}
		}
		return persisted;
	}

	async sendDiscordReport(summary) {
		if (!this.discordToken) {
			return;
		}
		try {
			await this.readyPromise;
			const channel = await this.resolveLogChannel(summary.guildId);
			if (!channel) {
				return;
			}

			const color = summary.totalMedals > 0 ? 0x2ecc71 : 0x95a5a6;
			const embed = new EmbedBuilder()
				.setTitle('Daily Medal Distribution')
				.setColor(color)
				.addFields(
					{ name: 'Total Medals', value: formatNumber(summary.totalMedals), inline: true },
					{ name: 'Recipients', value: summary.recipients.toString(), inline: true },
					{ name: 'Manager Batches', value: `${summary.managersSucceeded}/${summary.managersProcessed}`, inline: true }
				)
				.setTimestamp();

			if (summary.entries.length) {
				const lines = summary.entries
					.slice(0, REPORT_LIST_LIMIT)
					.map((entry) => `\`${entry.kingdomId}\` → ${formatNumber(entry.delta)}`);
				if (summary.entries.length > REPORT_LIST_LIMIT) {
					lines.push(`…and ${summary.entries.length - REPORT_LIST_LIMIT} more.`);
				}
				embed.addFields({ name: 'Breakdown', value: lines.join('\n') });
			} else {
				embed.setDescription('No medals were distributed in this cycle.');
			}

			if (summary.failures.length) {
				const warnings = summary.failures.slice(0, 5).join('\n');
				embed.addFields({ name: 'Notes', value: warnings });
			}

			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error(`UpdateMedals failed to send Discord report for guild ${summary.guildId}:`, error);
		}
	}

	async resolveLogChannel(guildId) {
		try {
			const rows = await this.sql.getGuildLogChannels(guildId);
			if (!Array.isArray(rows) || !rows.length) {
				return null;
			}
			const row = rows[0];
			const channelId = row.shop_log_channel || row.accept_log_channel;
			if (!channelId) {
				return null;
			}
			const channel = await this.discordClient.channels.fetch(channelId).catch(() => null);
			return channel || null;
		} catch (error) {
			console.error(`UpdateMedals resolveLogChannel error for guild ${guildId}:`, error);
			return null;
		}
	}
}

function formatNumber(value) {
	return Number(value || 0).toLocaleString('en-US');
}

module.exports = UpdateMedals;

