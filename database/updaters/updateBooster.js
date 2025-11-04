const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Routes } = require('discord-api-types/v10');
const cron = require('node-cron');

class UpdateBooster {
	constructor(sql) {
		this.sql = sql;
		this.discordToken = process.env.DISCORD_TOKEN;
		this.isRunning = false;

		this.discordClient = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
			],
		});

		if (!this.discordToken) {
			console.warn('DISCORD_TOKEN not set. UpdateBooster cannot send Discord notifications.');
			this.readyPromise = Promise.resolve();
		} else {
			let readyResolve;
			this.readyPromise = new Promise((resolve) => {
				readyResolve = resolve;
				this.discordClient.once('ready', () => {
					console.log('UpdateBooster Discord client is ready.');
					resolve();
				});
			});

			this.discordClient.login(this.discordToken).catch((error) => {
				console.error('Failed to login Discord client for UpdateBooster:', error);
				if (typeof readyResolve === 'function') {
					readyResolve();
				}
			});
		}
	}

	start() {
		this.scheduleDailyJob();
	}

	scheduleDailyJob() {
		cron.schedule('50 23 * * *', () => {
			this.executeCycle().catch((error) => {
				console.error('UpdateBooster executeCycle error:', error);
			});
		}, { timezone: 'UTC' });

		console.log('UpdateBooster scheduler started - runs daily at 23:50 UTC');
	}

	async executeCycle(forceDate = null) {
		if (this.isRunning) {
			console.warn('UpdateBooster cycle skipped because a previous run is still in progress.');
			return;
		}

		this.isRunning = true;

		try {
			await this.readyPromise;

			if (!this.discordToken) {
				console.warn('UpdateBooster cycle aborted: DISCORD_TOKEN not configured.');
				return;
			}

			const rewardDate = forceDate || this.getUtcDateString(new Date());
			const rows = await this.sql.getGuildsWithActiveSubscription();
			const guildIds = Array.isArray(rows)
				? rows.map((row) => row.guild_id || row.guildId).filter(Boolean)
				: [];

			if (!guildIds.length) {
				console.log('UpdateBooster: No guilds with active subscription found.');
				return;
			}

			for (const guildId of guildIds) {
				await this.processGuild(guildId, rewardDate);
			}
		} catch (error) {
			console.error('UpdateBooster cycle failed:', error);
		} finally {
			this.isRunning = false;
		}
	}

	getUtcDateString(date) {
		const pad = (value) => value.toString().padStart(2, '0');
		return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
	}

	async processGuild(guildId, rewardDate) {
		try {
			const rawBoosterPoints = await this.sql.getGuildBoosterPoint(guildId);
			const perBoosterPoints = Number(rawBoosterPoints);

			if (!Number.isFinite(perBoosterPoints) || perBoosterPoints <= 0) {
				await this.reportMissingPointValue(guildId, rewardDate);
				return;
			}

			const guild = await this.discordClient.guilds.fetch(guildId).catch((error) => {
				console.error(`UpdateBooster failed to fetch guild ${guildId}:`, error);
				return null;
			});

			if (!guild) {
				return;
			}

			const boosterInfo = await this.fetchBoosterInfo(guild);
			if (!boosterInfo) {
				console.warn(`UpdateBooster could not determine boosters for guild ${guildId}. Skipping distribution.`);
				return;
			}

			if (!boosterInfo.size) {
				await this.reportNoBoosters(guildId, rewardDate);
				return;
			}

			const results = [];
			let totalPoints = 0;

			for (const [discordId, data] of boosterInfo) {
				if (!discordId) {
					continue;
				}

				let hasLinkedKingdom = false;
				try {
					const kingdoms = await this.sql.checkVerifiedKingdoms(discordId, guildId);
					hasLinkedKingdom = Array.isArray(kingdoms)
						? kingdoms.length > 0
						: Boolean(kingdoms);
				} catch (error) {
					console.error(`UpdateBooster failed to verify kingdoms for user ${discordId} in guild ${guildId}:`, error);
				}

				if (!hasLinkedKingdom) {
					continue;
				}

				const points = perBoosterPoints;

				try {
					await this.sql.addUserPoints(
						discordId,
						guildId,
						points,
						`booster`
					);
				} catch (error) {
					console.error(`UpdateBooster failed to credit points for user ${discordId} in guild ${guildId}:`, error);
					continue;
				}

				results.push({
					discordId,
					points,
					displayName: data.member?.displayName,
					premiumSince: data.premiumSince || null,
				});

				totalPoints += points;
			}

			if (!results.length) {
				console.log(`UpdateBooster: No eligible boosters with linked kingdoms for guild ${guildId} on ${rewardDate}.`);
				return;
			}

			await this.sendLogMessage({
				guildId,
				rewardDate,
				perBoosterPoints,
				totalPoints,
				results,
			});
		} catch (error) {
			console.error(`UpdateBooster processGuild error for guild ${guildId}:`, error);
		}
	}

	async fetchBoosterInfo(guild) {
		const boosters = new Map();
		const boosterRoleId = guild.roles?.premiumSubscriberRole?.id || null;

		const recordMember = (memberOrId, premiumSince = null) => {
			const discordId = typeof memberOrId === 'string'
				? memberOrId
				: memberOrId?.id;
			if (!discordId) {
				return;
			}
			const resolvedMember = typeof memberOrId === 'string'
				? guild.members.cache.get(memberOrId) || null
				: memberOrId ?? null;
			if (!boosters.has(discordId)) {
				boosters.set(discordId, {
					member: resolvedMember,
					premiumSince: premiumSince ? new Date(premiumSince) : null,
				});
			} else {
				const record = boosters.get(discordId);
				record.member = record.member || resolvedMember;
				if (!record.premiumSince && premiumSince) {
					record.premiumSince = new Date(premiumSince);
				}
			}
		};

		// First, leverage cached members (gateway data).
		try {
			if (!guild.members.me || guild.members.cache.size < guild.memberCount) {
				await guild.members.fetch();
			}
		} catch (error) {
			console.warn(`UpdateBooster: guild.members.fetch() failed for ${guild.id}, continuing with cached members.`, error);
		}

		guild.members.cache.forEach((member) => {
			if (member?.premiumSince) {
				recordMember(member, member.premiumSince);
			} else if (boosterRoleId && member?.roles?.cache?.has(boosterRoleId)) {
				// Role presence implies at least one active boost.
				recordMember(member, member.premiumSince || null);
			}
		});

		// REST pagination fallback to ensure we capture boosters even when not cached.
		let after = '0';
		try {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const query = after === '0'
					? { limit: 1000 }
					: { limit: 1000, after };
				const batch = await this.discordClient.rest.get(Routes.guildMembers(guild.id), {
					query,
				});

				if (!Array.isArray(batch) || batch.length === 0) {
					break;
				}

				for (const rawMember of batch) {
					if (!rawMember?.user?.id || !rawMember.premium_since) {
						continue;
					}

					recordMember(rawMember.user.id, rawMember.premium_since);
				}

				if (batch.length < 1000) {
					break;
				}

				after = batch[batch.length - 1].user.id;
			}
		} catch (error) {
			console.error(`UpdateBooster REST member fetch failed for guild ${guild.id}:`, error);
		}

		if (!boosters.size) {
			const fallbackCollection = boosterRoleId
				? guild.members.cache.filter((member) => member.roles.cache.has(boosterRoleId))
				: guild.members.cache.filter((member) => Boolean(member.premiumSince));

			for (const member of fallbackCollection.values()) {
				recordMember(member, member.premiumSince || member.joinedTimestamp || new Date());
			}
		}

		return boosters;
	}

	async reportNoBoosters(guildId, rewardDate, alreadyProcessed = false) {
		try {
			const channels = await this.sql.getGuildLogChannels(guildId);
			if (!Array.isArray(channels) || !channels.length) {
				return;
			}

			const shopChannelId = channels[0]?.shop_log_channel;
			if (!shopChannelId) {
				return;
			}

			const channel = await this.discordClient.channels.fetch(shopChannelId).catch(() => null);
			if (!channel) {
				return;
			}

			const message = alreadyProcessed
				? `✅ Booster rewards for ${rewardDate} are already processed.`
				: `ℹ️ No active boosters detected for ${rewardDate}.`;

			await channel.send({ content: message });
		} catch (error) {
			console.error(`UpdateBooster reportNoBoosters error for guild ${guildId}:`, error);
		}
	}

	async reportMissingPointValue(guildId, rewardDate) {
		try {
			const channels = await this.sql.getGuildLogChannels(guildId);
			if (!Array.isArray(channels) || !channels.length) {
				return;
			}

			const shopChannelId = channels[0]?.shop_log_channel;
			if (!shopChannelId) {
				return;
			}

			const channel = await this.discordClient.channels.fetch(shopChannelId).catch(() => null);
			if (!channel) {
				return;
			}

			await channel.send({
				content: `⚠️ Booster rewards for ${rewardDate} skipped: configure a boost point value greater than 0. Set it with \`/guild booster-point\`. Or ignore this message to skip booster rewards entirely.`,
			});
		} catch (error) {
			console.error(`UpdateBooster reportMissingPointValue error for guild ${guildId}:`, error);
		}
	}

	async sendLogMessage({ guildId, rewardDate, perBoosterPoints, totalPoints, results }) {
		try {
			const channels = await this.sql.getGuildLogChannels(guildId);
			if (!Array.isArray(channels) || !channels.length) {
				console.log(`UpdateBooster: No log channel configuration for guild ${guildId}`);
				return;
			}

			const shopChannelId = channels[0]?.shop_log_channel;
			if (!shopChannelId) {
				console.log(`UpdateBooster: shop_log_channel not configured for guild ${guildId}`);
				return;
			}

			const channel = await this.discordClient.channels.fetch(shopChannelId).catch(() => null);
			if (!channel) {
				console.log(`UpdateBooster: Unable to fetch shop log channel ${shopChannelId} for guild ${guildId}`);
				return;
			}

			const currencyEmoji = await this.sql.getGuildCurrencyEmoji(guildId) || '🪙';
			const formatNumber = (value) => Number(value).toLocaleString(undefined, {
				minimumFractionDigits: 0,
				maximumFractionDigits: 2,
			});
			const perBoosterDisplay = formatNumber(perBoosterPoints);
			const totalPointsDisplay = formatNumber(totalPoints);
			const rewardedCount = Array.isArray(results) ? results.length : 0;

			const embed = new EmbedBuilder()
				.setTitle('✨ Daily Server Booster Rewards')
				.setColor(0xf47fff)
				.setDescription(`Rewards for ${rewardDate} UTC`)
				.addFields(
					{ name: 'Rewarded boosters', value: rewardedCount.toString(), inline: true },
					{ name: 'Points per booster', value: rewardedCount ? `${perBoosterDisplay} ${currencyEmoji}` : 'N/A', inline: true },
					{ name: 'Total points awarded', value: `${totalPointsDisplay} ${currencyEmoji}`, inline: true },
				)
				.setTimestamp(new Date());

			const appendChunkedFields = (lines, header) => {
				if (!Array.isArray(lines) || !lines.length) {
					return;
				}

				const maxFieldLength = 1024;
				const chunks = [];
				let currentChunk = '';

				for (const rawLine of lines) {
					const line = String(rawLine ?? '');
					const candidate = currentChunk ? `${currentChunk}\n${line}` : line;

					if (candidate.length > maxFieldLength) {
						if (currentChunk) {
							chunks.push(currentChunk);
						}

						if (line.length > maxFieldLength) {
							chunks.push(`${line.slice(0, maxFieldLength - 3)}...`);
							currentChunk = '';
						} else {
							currentChunk = line;
						}
					} else {
						currentChunk = candidate;
					}
				}

				if (currentChunk) {
					chunks.push(currentChunk);
				}

				chunks.forEach((chunk, index) => {
					embed.addFields({
						name: index === 0 ? header : '\u200b',
						value: chunk,
					});
				});
			};

			const rewardedLines = (Array.isArray(results) ? results : [])
				.sort((a, b) => b.points - a.points)
				.map((entry) => {
					const premiumDate = entry.premiumSince instanceof Date && !Number.isNaN(entry.premiumSince.getTime())
						? entry.premiumSince.toISOString().split('T')[0]
						: null;
					const premiumInfo = premiumDate ? ` • boosted since ${premiumDate}` : '';
					return `<@${entry.discordId}> · ${formatNumber(entry.points)} ${currencyEmoji}${premiumInfo}`;
				});

			appendChunkedFields(rewardedLines, 'Rewarded boosters');

			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error(`UpdateBooster sendLogMessage error for guild ${guildId}:`, error);
		}
	}
}

module.exports = UpdateBooster;
