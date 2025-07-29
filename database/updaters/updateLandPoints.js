const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

class UpdateLandPoints {
    constructor(sql, api) {
        this.sql = sql;
        this.api = api;
        
        // Initialize Discord client
        this.discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
            ],
        });
        this.discordToken = process.env.DISCORD_TOKEN;
        this.discordClient.login(this.discordToken);

        // Ensure the client is ready before proceeding
        this.readyPromise = new Promise((resolve) => {
            this.discordClient.once('ready', () => {
                console.log('UpdateLandPoints Discord client is ready.');
                resolve();
            });
        });
        
        // this.distributePointsForAllGuilds();
    }

    // Start the daily points distribution scheduler
    runLandPointsDistribution() {
        // Schedule to run every day at 1:00 AM UTC
        cron.schedule('0 1 * * *', async () => {
            console.log('Starting daily land contribution points distribution...');
            try {
                await this.distributePointsForAllGuilds();
            } catch (error) {
                console.error('Error in daily points distribution:', error);
            }
        }, {
            timezone: 'UTC'
        });
        console.log('Points distribution scheduler started - runs daily at 1:00 AM UTC');
    }

    // Main function to distribute points for all guilds
    async distributePointsForAllGuilds() {
        try {
            // Get all guild-continent links
            const guildLinks = await this.sql.getAllGuildContinentLinks();
            
            for (const link of guildLinks) {
                const guildId = link.guild_id;
                
                try {
                    await this.distributePointsForGuild(guildId);
                } catch (error) {
                    console.error(`Error distributing points for guild ${guildId}:`, error);
                }
            }
        } catch (error) {
            console.error('Error in distributePointsForAllGuilds:', error);
        }
    }

    // Distribute points for a specific guild
    async distributePointsForGuild(guildId) {
        try {
            // Get guild lands
            const landRows = await this.sql.getGuildLands(guildId);
            if (!landRows || landRows.length === 0) {
                console.log(`No lands configured for guild ${guildId}`);
                return;
            }

            const landIds = landRows.map(row => row.land_id.toString());
            
            // Get point value per contribution point
            const pointsPerContribution = await this.sql.getGuildLandPoint(guildId);
            if (!pointsPerContribution || pointsPerContribution <= 0) {
                console.log(`No point value configured for guild ${guildId}`);
                return;
            }

            // Calculate date range (yesterday)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const fromDate = yesterday.toISOString().slice(0, 10);
            const toDate = fromDate; // Same day

            // Fetch contribution data for all lands
            const allContributions = await this.fetchContributionData(landIds, fromDate, toDate);
            
            if (allContributions.length === 0) {
                console.log(`No contribution data found for guild ${guildId} on ${fromDate}`);
                return;
            }

            // Aggregate contributions by kingdom ID
            const kingdomContributions = this.aggregateContributions(allContributions);
            
            // Distribute points and track results
            const distributionResults = [];
            let totalPointsDistributed = 0;
            let totalContributionPoints = 0;

            for (const contrib of kingdomContributions) {
                try {
                    // Get Discord ID for the kingdom
                    const verifiedRows = await this.sql.getVerifiedDiscordId(contrib.kingdomId, guildId);
                    
                    if (verifiedRows && verifiedRows.length > 0) {
                        const discordId = verifiedRows[0].discordId;
                        const shopPoints = Math.floor(contrib.contribution * pointsPerContribution);
                        
                        if (shopPoints > 0) {
                            // Add shop points
                            await this.sql.addUserPoints(discordId, guildId, shopPoints, `Land contribution`);
                            
                            distributionResults.push({
                                kingdomId: contrib.kingdomId,
                                kingdomName: contrib.kingdomName,
                                discordId: discordId,
                                contributionPoints: contrib.contribution,
                                shopPoints: shopPoints,
                                landIds: contrib.landIds
                            });
                            
                            totalPointsDistributed += shopPoints;
                            totalContributionPoints += contrib.contribution;
                        }
                    } else {
                        // console.log(`Kingdom ${contrib.kingdomId} not verified in guild ${guildId}`);
                    }
                } catch (error) {
                    console.error(`Error processing kingdom ${contrib.kingdomId}:`, error);
                }
            }

            // Log the distribution results to Discord
            if (distributionResults.length > 0) {
                await this.logDistributionResults(guildId, distributionResults, fromDate, totalPointsDistributed, totalContributionPoints);
            }

            console.log(`Points distribution completed for guild ${guildId}: ${totalPointsDistributed} points distributed to ${distributionResults.length} players`);

        } catch (error) {
            console.error(`Error in distributePointsForGuild for guild ${guildId}:`, error);
        }
    }

    // Fetch contribution data for multiple lands
    async fetchContributionData(landIds, fromDate, toDate) {
        const allContributions = [];
        const errors = [];

        // Create requests for all land IDs
        const allRequests = landIds.map(landId => ({
            landId,
            from: fromDate,
            to: toDate
        }));

        // Make parallel requests for all lands
        const chunkResults = await Promise.all(allRequests.map(async ({ landId, from, to }) => {
            try {
                const url = `https://api-lok-live.leagueofkingdoms.com/api/stat/land/contribution?from=${from}&to=${to}&landId=${landId}`;
                const headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                };
                
                const response = await this.api.get(url, headers);
                
                if (response.data && response.data.result && response.data.contribution) {
                    const contributions = response.data.contribution.map(contrib => ({
                        landId: landId,
                        owner: response.data.owner,
                        kingdomId: contrib.kingdomId,
                        kingdomName: contrib.name,
                        continent: contrib.continent,
                        contribution: contrib.total,
                        dateRange: `${from} to ${to}`
                    }));
                    return contributions;
                } else {
                    errors.push(`Land ID ${landId}: No contribution data found`);
                    return [];
                }
            } catch (error) {
                console.error(`Error fetching data for land ID ${landId}:`, error);
                errors.push(`Land ID ${landId}: ${error.message || 'Unknown error'}`);
                return [];
            }
        }));

        // Flatten all contributions into a single array
        chunkResults.forEach(contributions => {
            allContributions.push(...contributions);
        });

        if (errors.length > 0) {
            console.log('Errors during data fetch:', errors);
        }

        return allContributions;
    }

    // Aggregate contributions by kingdom ID to avoid duplicates
    aggregateContributions(allContributions) {
        const kingdomContributions = new Map();
        
        for (const contrib of allContributions) {
            const key = contrib.kingdomId;
            
            if (kingdomContributions.has(key)) {
                // Add to existing entry
                const existing = kingdomContributions.get(key);
                existing.contribution += contrib.contribution;
                existing.landIds.add(contrib.landId);
            } else {
                // Create new entry
                kingdomContributions.set(key, {
                    kingdomId: contrib.kingdomId,
                    kingdomName: contrib.kingdomName,
                    continent: contrib.continent,
                    contribution: contrib.contribution,
                    landIds: new Set([contrib.landId])
                });
            }
        }

        // Convert landIds Set to Array for easier handling
        const result = Array.from(kingdomContributions.values()).map(contrib => ({
            ...contrib,
            landIds: Array.from(contrib.landIds)
        }));

        // Sort by contribution amount (highest first)
        result.sort((a, b) => b.contribution - a.contribution);

        return result;
    }

    // Log distribution results to Discord
    async logDistributionResults(guildId, results, date, totalPointsDistributed, totalContributionPoints) {
        try {
            await this.readyPromise; // Ensure Discord client is ready

            // Get the notification channel
            const channelId = await this.sql.getGuildDSTNotificationChannel(guildId);
            if (!channelId) {
                console.log(`No notification channel configured for guild ${guildId}`);
                return;
            }

            const channel = await this.discordClient.channels.fetch(channelId);
            if (!channel) {
                console.log(`Could not find channel ${channelId} for guild ${guildId}`);
                return;
            }

            let emoji = await this.sql.getGuildCurrencyEmoji(guildId);
            if (!emoji) {
                console.log(`No emoji configured for guild ${guildId}`);
                emoji = '💰';
            }

            // Send a summary message first
            const summaryEmbed = new EmbedBuilder()
                .setTitle('🏰 Daily Land Contribution Points Distribution')
                .setColor(0x00AE86)
                .addFields(
                    { name: '📅 Date', value: date, inline: true },
                    { name: '👑 Players Rewarded', value: results.length.toString(), inline: true },
                    { name: `${emoji} Total currency Distributed`, value: totalPointsDistributed.toString(), inline: true },
                    { name: '🎯 Total Contribution Points', value: totalContributionPoints.toFixed(2), inline: true }
                )
                .setTimestamp();

            await channel.send({ embeds: [summaryEmbed] });

            // Send individual messages for each user
            for (const result of results) {
                const message = `<@${result.discordId}> received **${result.shopPoints} shop points** for contributing **${result.contributionPoints.toFixed(2)} points** to land(s) on ${date}`;
                
                try {
                    await channel.send(message);
                    // Add a small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`Error sending individual message for user ${result.discordId}:`, error);
                }
            }

            console.log(`Distribution results logged to Discord for guild ${guildId}: ${results.length} individual messages sent`);

        } catch (error) {
            console.error(`Error logging distribution results for guild ${guildId}:`, error);
        }
    }
}

module.exports = UpdateLandPoints;