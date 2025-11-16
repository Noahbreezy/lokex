const { EmbedBuilder } = require("discord.js");
const Api = require("../general/api.js");

const MAX_MEDALS_PER_DISTRIBUTION = 40000;
const MEDAL_DISTRIBUTION_ENDPOINT = "https://api-lok-live.leagueofkingdoms.com/api/alliance/medal/distribute";
const MEDAL_HISTORY_ENDPOINT = "https://api-lok-live.leagueofkingdoms.com/api/alliance/medal/history";
const UTC_BLOCK_START = { day: 6, hour: 20, minute: 59 }; // Saturday 20:59 UTC
const UTC_BLOCK_END = { day: 6, hour: 23, minute: 59 };   // Saturday 23:59 UTC

function isWithinUtcBlock() {
	const now = new Date();
	const day = now.getUTCDay();
	const hours = now.getUTCHours();
	const minutes = now.getUTCMinutes();

	if (day !== UTC_BLOCK_START.day) {
		return false;
	}

	if (hours < UTC_BLOCK_START.hour || hours > UTC_BLOCK_END.hour) {
		return false;
	}

	if (hours === UTC_BLOCK_START.hour && minutes < UTC_BLOCK_START.minute) {
		return false;
	}

	if (hours === UTC_BLOCK_END.hour && minutes > UTC_BLOCK_END.minute) {
		return false;
	}

	return true;
}

class MedalDistributor {
	constructor(sql, api, discordClient = null) {
		if (!sql) {
			throw new Error("SQL instance is required for MedalDistributor");
		}
		this.sql = sql;
		this.api = api || new Api(sql);
		this.discordClient = discordClient;
	}

	async distributeMedalsForKingdom(kingdomId, guildId, token, discordId = null, deltaOverride = null) {

		if (!kingdomId) {
			throw new Error("kingdomId is required");
		}
		if (!guildId) {
			throw new Error("guildId is required");
		}
		if (!token) {
			throw new Error("x-access-token is required to distribute medals");
		}

		const medalsOwed = await this.sql.getMedalTotalForKingdom(kingdomId, guildId);
		if (!medalsOwed || medalsOwed <= 0) {
			// console.log(`[MedalDistributor] No medals owed for kingdom ${kingdomId} in guild ${guildId}.`);
			return { success: false, medalsOwed: medalsOwed ?? 0 };
		}

		if (isWithinUtcBlock()) {
			console.log(`[MedalDistributor] Medal distribution blocked for ${kingdomId}; within Saturday 20:59-23:59 UTC window.`);
			return { success: false, medalsOwed };
		}

		const requestedDelta = typeof deltaOverride === "number" ? deltaOverride : medalsOwed;
		const normalizedDelta = Number.isFinite(requestedDelta) ? Math.trunc(requestedDelta) : 0;
		const delta = Math.max(0, Math.min(normalizedDelta, MAX_MEDALS_PER_DISTRIBUTION));
		if (normalizedDelta > MAX_MEDALS_PER_DISTRIBUTION) {
			console.log(`[MedalDistributor] Capping medal payout for ${kingdomId} to ${MAX_MEDALS_PER_DISTRIBUTION} (requested ${normalizedDelta}).`);
		}
		if (delta <= 0) {
			console.log(`[MedalDistributor] Skipping medal distribution for ${kingdomId}; non-positive delta (${delta}).`);
			return { success: false, medalsOwed };
		}

		let distributionResponse = null;
		let distributedAmount = 0;

		const initialResult = await this.requestMedalDistribution(token, kingdomId.toString(), delta);

		if (!initialResult.success) {
			if (initialResult.errorCode === "medal_distribution_exceed") {
				console.warn(`[MedalDistributor] Medal distribution exceed for ${kingdomId}; attempting incremental payout.`);
				const exceedResult = await this.handleMedalDistributionExceed({
					token,
					kingdomId: kingdomId.toString(),
					delta
				});
				if (!exceedResult.success) {
					const errorPayload = exceedResult.error || exceedResult.response || initialResult.response || initialResult.error || null;
					if (errorPayload) {
						console.warn(`[MedalDistributor] Medal distribution aborted for ${kingdomId} after exceed handling:`, errorPayload);
					}
					return { success: false, medalsOwed, response: exceedResult.response ?? initialResult.response ?? null, error: errorPayload };
				}
				distributedAmount = exceedResult.distributed;
				distributionResponse = exceedResult.response ?? null;
			} else if (initialResult.response) {
				console.warn(`[MedalDistributor] Medal distribution rejected for ${kingdomId}:`, initialResult.response);
				return { success: false, medalsOwed, response: initialResult.response };
			} else {
				const errorPayload = initialResult.error || initialResult.errorCode || null;
				if (errorPayload) {
					console.error(`[MedalDistributor] Failed to distribute medals to ${kingdomId}:`, errorPayload);
				}
				return { success: false, medalsOwed, error: errorPayload };
			}
		} else {
			distributedAmount = delta;
			distributionResponse = initialResult.response ?? null;
		}

		if (distributedAmount <= 0) {
			return { success: false, medalsOwed, response: distributionResponse };
		}

		if (!discordId) {
			const verifiedRows = await this.sql.getVerifiedDiscordId(kingdomId.toString(), guildId);
			if (verifiedRows?.[0]?.discordId) {
				discordId = verifiedRows[0].discordId;
			}
		}

		await this.sql.recordMedalTransaction(kingdomId.toString(), discordId, -distributedAmount, guildId);
		await this.logMedalDistribution({
			guildId,
			kingdomId: kingdomId.toString(),
			amount: distributedAmount,
			discordId,
			remaining: Math.max(medalsOwed - distributedAmount, 0)
		});
		if (distributedAmount === delta) {
			console.log(`[MedalDistributor] Distributed ${distributedAmount} medals to kingdom ${kingdomId} (guild ${guildId}).`);
		} else {
			console.log(`[MedalDistributor] Distributed ${distributedAmount} medals to kingdom ${kingdomId} (guild ${guildId}) (requested ${delta}).`);
		}

		return {
			success: true,
			medalsOwed,
			distributed: distributedAmount,
			response: distributionResponse
		};
	}

	async requestMedalDistribution(token, kingdomId, delta) {
		const payload = new URLSearchParams({
			json: JSON.stringify({
				members: [
					{
						kingdomId: kingdomId.toString(),
						delta
					}
				]
			})
		});

		const headers = {
			"x-access-token": token
		};

		try {
			const response = await this.api.request(MEDAL_DISTRIBUTION_ENDPOINT, payload, headers);
			if (response?.data?.result === false) {
				return {
					success: false,
					errorCode: response?.data?.err?.code || null,
					response: response.data
				};
			}
			return {
				success: true,
				response: response?.data ?? null
			};
		} catch (error) {
			return {
				success: false,
				errorCode: error?.response?.data?.err?.code || error?.err?.code || null,
				error: error?.response?.data || error?.message || error
			};
		}
	}

	async fetchLatestMedalTotal(token, kingdomId) {
		const payload = new URLSearchParams({
			json: JSON.stringify({})
		});
		const headers = {
			"x-access-token": token
		};

		try {
			const response = await this.api.request(MEDAL_HISTORY_ENDPOINT, payload, headers);
			const history = Array.isArray(response?.data?.history) ? response.data.history : [];
			const entry = history.find((record) => record?.kingdom?._id?.toString() === kingdomId.toString());
			if (!entry) {
				return { success: false, response: response?.data ?? null };
			}
			const afterValue = Number(entry.after);
			if (!Number.isFinite(afterValue)) {
				return { success: false, response: response?.data ?? null };
			}
			return {
				success: true,
				total: afterValue,
				response: response?.data ?? null
			};
		} catch (error) {
			return {
				success: false,
				error: error?.response?.data || error?.message || error
			};
		}
	}

	async handleMedalDistributionExceed({ token, kingdomId, delta }) {
		let distributed = 0;
		let latestResponse = null;

		const singleResult = await this.requestMedalDistribution(token, kingdomId, 1);
		if (!singleResult.success) {
			return {
				success: false,
				errorCode: singleResult.errorCode,
				error: singleResult.error || singleResult.response || null,
				response: singleResult.response ?? null
			};
		}

		distributed += 1;
		latestResponse = singleResult.response ?? null;

		const historyResult = await this.fetchLatestMedalTotal(token, kingdomId);
		if (historyResult.success) {
			const remainingAllowance = Math.max(0, MAX_MEDALS_PER_DISTRIBUTION - historyResult.total);
			const outstandingRequest = Math.max(0, delta - distributed);
			const followUpDelta = Math.min(remainingAllowance, outstandingRequest);
			if (followUpDelta > 0) {
				const followUpResult = await this.requestMedalDistribution(token, kingdomId, followUpDelta);
				if (followUpResult.success) {
					distributed += followUpDelta;
					latestResponse = followUpResult.response ?? latestResponse;
				} else {
					const followUpError = followUpResult.error || followUpResult.response || followUpResult.errorCode || null;
					if (followUpError) {
						console.warn(`[MedalDistributor] Follow-up medal distribution failed for ${kingdomId}:`, followUpError);
					}
				}
			}
		} else {
			console.warn(`[MedalDistributor] Unable to fetch medal history for ${kingdomId}; additional medals skipped.`);
		}

		return {
			success: distributed > 0,
			distributed,
			response: latestResponse
		};
	}

	async logMedalDistribution({ guildId, kingdomId, amount, discordId, remaining }) {
		if (!this.discordClient) {
			return;
		}

		try {
			const channelId = await this.sql.getGuildDSTNotificationChannel(guildId);
			if (!channelId) {
				return;
			}

			let channel = this.discordClient.channels?.cache?.get(channelId);
			if (!channel && typeof this.discordClient.channels?.fetch === "function") {
				try {
					channel = await this.discordClient.channels.fetch(channelId);
				} catch (fetchError) {
					console.warn(`[MedalDistributor] Unable to fetch log channel ${channelId} for guild ${guildId}:`, fetchError.message || fetchError);
					channel = null;
				}
			}

			if (!channel || typeof channel.send !== "function") {
				return;
			}

			const embedFields = [
				{ name: "Kingdom", value: `\`${kingdomId}\``, inline: true },
				{ name: "Medals Sent", value: amount.toLocaleString(), inline: true },
				{ name: "Remaining Balance", value: remaining.toLocaleString(), inline: true }
			];

			const embed = new EmbedBuilder()
				.setColor(0x2ECC71)
				.setTitle("Medals Distributed")
				.addFields(embedFields)
				.setTimestamp();

			const mention = discordId ? `<@${discordId}>` : null;
			await channel.send({
				content: mention || undefined,
				embeds: [embed]
			});
		} catch (error) {
			console.error(`[MedalDistributor] Failed to log medal distribution for guild ${guildId}:`, error);
		}
	}

	async distributeMedalsForGuild() {
		throw new Error("Not implemented yet");
	}
}

module.exports = MedalDistributor;
