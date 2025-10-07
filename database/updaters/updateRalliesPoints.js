const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
require('dotenv').config();

class UpdateRalliesPoints {
    constructor(sql, api) {
        this.sql = sql;
        this.api = api;
        this.isRunning = false; // Add a flag to prevent concurrent executions
        
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
                console.log('UpdateRalliesPoints Discord client is ready.');
                resolve();
            });
        });
        
        // this.distributePointsForAllGuilds();
    }

    // Start the daily points distribution scheduler
    runRalliesPointsDistribution() {
        // Schedule to run every day at 2:00 AM UTC
        cron.schedule('0 2 * * *', async () => {
            console.log('Starting daily rally participation points distribution...');
            try {
                await this.distributePointsForAllGuilds();
            } catch (error) {
                console.error('Error in daily rally points distribution:', error);
            }
        }, {
            timezone: 'UTC'
        });
        console.log('Rally points distribution scheduler started - runs daily at 2:00 AM UTC');
    }

    // Main function to distribute points for all guilds
    async distributePointsForAllGuilds() {
        console.log(`[${new Date().toISOString()}] Starting distributePointsForAllGuilds`);
        try {
            // Get all guild-continent links
            const guildLinks = await this.sql.getAllGuildContinentLinks();
            console.log(`[${new Date().toISOString()}] Found ${guildLinks.length} guild links to process`);
            
            for (const link of guildLinks) {
                const guildId = link.guild_id;
                console.log(`[${new Date().toISOString()}] Processing guild ${guildId}`);
                
                try {
                    await this.distributePointsForGuild(guildId);
                    console.log(`[${new Date().toISOString()}] Completed processing guild ${guildId}`);
                } catch (error) {
                    console.error(`Error distributing rally points for guild ${guildId}:`, error);
                }
            }
            console.log(`[${new Date().toISOString()}] Finished distributePointsForAllGuilds`);
        } catch (error) {
            console.error('Error in distributePointsForAllGuilds:', error);
        }
    }

    // Distribute points for a specific guild
    async distributePointsForGuild(guildId) {
        console.log(`[${new Date().toISOString()}] Starting distributePointsForGuild for guild ${guildId}`);
        try {
            // Check if guild has valid subscription for rally points distribution
            const subscriptionFlagInfo = await this.sql.checkSubscriptionValid(guildId, "5");
            if (!subscriptionFlagInfo) {
                console.log(`Guild ${guildId} does not have a valid subscription (type 5) for rally points distribution`);
                return;
            }

            // Get point value per rally started
            const pointsPerRally = await this.sql.getGuildRallyPoint(guildId);
            // Get point value per rally joined
            const pointsPerRallyJoin = await this.sql.getGuildRallyJoinPoint(guildId);

            if ((!pointsPerRally || pointsPerRally <= 0) && (!pointsPerRallyJoin || pointsPerRallyJoin <= 0)) {
                console.log(`No rally point value configured for guild ${guildId}`);
                return;
            }

            // Calculate date range (yesterday)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const startDate = yesterday.toISOString().slice(0, 19).replace('T', ' ');
            
            const today = new Date();
            const endDate = today.toISOString().slice(0, 19).replace('T', ' ');

            // Get rally participation for yesterday (starters)
            const rallyParticipation = await this.sql.getRallyParticipationByDate(guildId, startDate, endDate);
            
            // Get rally joiner participation for yesterday
            const rallyJoinerParticipation = await this.sql.getRallyJoinerParticipationByDate(guildId, startDate, endDate);
            
            if (rallyParticipation.length === 0 && rallyJoinerParticipation.length === 0) {
                console.log(`No rally activity found for guild ${guildId} on ${yesterday.toISOString().slice(0, 10)}`);
                return;
            }

            // Distribute points and track results
            const distributionResults = [];
            let totalPointsDistributed = 0;
            let totalRallies = 0;
            let totalJoins = 0;

            // Process rally starters
            for (const participant of rallyParticipation) {
                try {
                    // Get Discord ID for the kingdom
                    const verifiedRows = await this.sql.getVerifiedDiscordId(participant.by_kingdom_id, guildId);
                    
                    if (verifiedRows && verifiedRows.length > 0) {
                        const discordId = verifiedRows[0].discordId;
                        const shopPoints = Math.floor(participant.rally_count * pointsPerRally);
                        
                        if (shopPoints > 0) {
                            // Add shop points
                            await this.sql.addUserPoints(discordId, guildId, shopPoints, `Rally starting`);
                            
                            distributionResults.push({
                                kingdomId: participant.by_kingdom_id,
                                kingdomName: participant.name,
                                discordId: discordId,
                                rallyCount: participant.rally_count,
                                joinCount: 0,
                                shopPoints: shopPoints,
                                type: 'starter'
                            });
                            
                            totalPointsDistributed += shopPoints;
                            totalRallies += participant.rally_count;
                        }
                    }
                } catch (error) {
                    console.error(`Error processing rally starter kingdom ${participant.by_kingdom_id}:`, error);
                }
            }

            // Process rally joiners
            for (const joiner of rallyJoinerParticipation) {
                try {
                    // Get Discord ID for the kingdom
                    const verifiedRows = await this.sql.getVerifiedDiscordId(joiner.joiner_kingdom_id, guildId);
                    
                    if (verifiedRows && verifiedRows.length > 0) {
                        const discordId = verifiedRows[0].discordId;
                        const shopPoints = Math.floor(joiner.join_count * pointsPerRallyJoin);
                        
                        if (shopPoints > 0) {
                            // Check if this user already got points for starting rallies
                            const existingResult = distributionResults.find(r => r.discordId === discordId);
                            
                            if (existingResult) {
                                // Add joiner points to existing result
                                existingResult.joinCount = joiner.join_count;
                                existingResult.shopPoints += shopPoints;
                                existingResult.type = 'both';
                            } else {
                                // Create new result for joiner only
                                distributionResults.push({
                                    kingdomId: joiner.joiner_kingdom_id,
                                    kingdomName: joiner.name,
                                    discordId: discordId,
                                    rallyCount: 0,
                                    joinCount: joiner.join_count,
                                    shopPoints: shopPoints,
                                    type: 'joiner'
                                });
                            }
                            
                            // Add shop points
                            await this.sql.addUserPoints(discordId, guildId, shopPoints, `Rally joining`);
                            
                            totalPointsDistributed += shopPoints;
                            totalJoins += joiner.join_count;
                        }
                    }
                } catch (error) {
                    console.error(`Error processing rally joiner kingdom ${joiner.joiner_kingdom_id}:`, error);
                }
            }

            // Log the distribution results to Discord
            if (distributionResults.length > 0) {
                console.log(`[${new Date().toISOString()}] Logging results for guild ${guildId}: ${distributionResults.length} results`);
                await this.logDistributionResults(guildId, distributionResults, yesterday.toISOString().slice(0, 10), totalPointsDistributed, totalRallies, totalJoins);
            }

            console.log(`[${new Date().toISOString()}] Rally points distribution completed for guild ${guildId}: ${totalPointsDistributed} points distributed to ${distributionResults.length} players for ${totalRallies} rallies started and ${totalJoins} rally joins`);

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in distributePointsForGuild for guild ${guildId}:`, error);
        }
    }

    // Log distribution results to Discord
    async logDistributionResults(guildId, results, date, totalPointsDistributed, totalRallies, totalJoins = 0) {
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
                .setTitle('⚔️ Daily Rally Participation Points Distribution')
                .setColor(0xFF4500)
                .addFields(
                    { name: '📅 Date', value: date, inline: true },
                    { name: '👑 Players Rewarded', value: results.length.toString(), inline: true },
                    { name: `${emoji} Total Currency Distributed`, value: totalPointsDistributed.toString(), inline: true },
                    { name: '⚔️ Total Rallies Started', value: totalRallies.toString(), inline: true },
                    { name: '🤝 Total Rally Joins', value: totalJoins.toString(), inline: true },
                    { name: '📊 Total Rally Activity', value: (totalRallies + totalJoins).toString(), inline: true }
                )
                .setTimestamp();

            await channel.send({ embeds: [summaryEmbed] });

            // Send individual messages for each user
            for (const result of results) {
                let userDisplay;
                try {
                    // Try to get the user object to display username instead of pinging
                    const user = await this.discordClient.users.fetch(result.discordId);
                    userDisplay = user.username;
                } catch (error) {
                    // Fallback to Discord ID if user fetch fails
                    userDisplay = `User ${result.discordId}`;
                }
                
                let message = `${userDisplay} received **${result.shopPoints} shop points** for `;
                
                if (result.type === 'starter') {
                    message += `starting **${result.rallyCount} rally${result.rallyCount > 1 ? 's' : ''}**`;
                } else if (result.type === 'joiner') {
                    message += `joining **${result.joinCount} rally${result.joinCount > 1 ? 's' : ''}**`;
                } else if (result.type === 'both') {
                    message += `starting **${result.rallyCount} rally${result.rallyCount > 1 ? 's' : ''}** and joining **${result.joinCount} rally${result.joinCount > 1 ? 's' : ''}**`;
                }
                
                message += ` on ${date}`;
                
                try {
                    await channel.send(message);
                    // Add a small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`Error sending individual message for user ${result.discordId}:`, error);
                }
            }

            console.log(`Rally distribution results logged to Discord for guild ${guildId}: ${results.length} individual messages sent`);

        } catch (error) {
            console.error(`Error logging rally distribution results for guild ${guildId}:`, error);
        }
    }
}

module.exports = UpdateRalliesPoints;