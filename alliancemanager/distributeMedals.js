const { EmbedBuilder } = require("discord.js");
const Api = require("../general/api.js");

const MAX_MEDALS_PER_DISTRIBUTION = 40000;
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

		const formPayload = new URLSearchParams({
			json: JSON.stringify({
				members: [
					{
						kingdomId: kingdomId.toString(),
						delta
					}
				]
			})
		});

		const requestHeaders = {
			"x-access-token": token
		};

		try {
			const response = await this.api.request(
				"https://api-lok-live.leagueofkingdoms.com/api/alliance/medal/distribute",
				formPayload,
				requestHeaders
			);

			if (response?.data?.result === false) {
				console.warn(`[MedalDistributor] Medal distribution rejected for ${kingdomId}:`, response.data);
				return { success: false, medalsOwed, response: response.data };
			}

            if (!discordId) {
                const verifiedRows = await this.sql.getVerifiedDiscordId(kingdomId.toString(), guildId);
                if (verifiedRows?.[0]?.discordId) {
                    discordId = verifiedRows[0].discordId;
                }
            }

			await this.sql.recordMedalTransaction(kingdomId.toString(), discordId, -delta, guildId);
			await this.logMedalDistribution({
				guildId,
				kingdomId: kingdomId.toString(),
				amount: delta,
				discordId,
				remaining: Math.max(medalsOwed - delta, 0)
			});
			console.log(`[MedalDistributor] Distributed ${delta} medals to kingdom ${kingdomId} (guild ${guildId}).`);

			return {
				success: true,
				medalsOwed,
				distributed: delta,
				response: response?.data ?? null
			};
		} catch (error) {
			const errorPayload = error?.response?.data || error?.message || error;
			console.error(`[MedalDistributor] Failed to distribute medals to ${kingdomId}:`, errorPayload);
			return { success: false, medalsOwed, error: errorPayload };
		}
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
