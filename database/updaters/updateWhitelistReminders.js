const sqlFunctions = require('../sql.js');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

class UpdateWhitelistReminders {
    constructor(sqlInstance) {
        this.sql = sqlInstance;
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
                console.log('UpdateWhitelistReminders Discord client is ready.');
                resolve();
            });
        });
    }

    // Run whitelist expiration checks every day at 8am UTC
    async runWhitelistReminder() {
        await this.readyPromise; // Wait for Discord client to be ready

        // Run the check immediately on startup
        await this.checkExpiringWhitelists();

        // Schedule the next run at 8am UTC
        this.scheduleNextRun();
    }

    // Schedule the next run at 8am UTC
    scheduleNextRun() {
        const now = new Date();
        const nextRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0));

        // If it's already past 8am UTC today, schedule for tomorrow
        if (now.getUTCHours() >= 8) {
            nextRun.setUTCDate(nextRun.getUTCDate() + 1);
        }

        const timeUntilNextRun = nextRun.getTime() - now.getTime();

        console.log(`Next whitelist reminder check scheduled for ${nextRun.toUTCString()}`);

        // Set a timeout for the next run
        setTimeout(async () => {
            await this.checkExpiringWhitelists();
            // Schedule the next run (24 hours later)
            this.scheduleNextRun();
        }, timeUntilNextRun);
    }

    // Check for whitelist licenses expiring within 24 hours
    async checkExpiringWhitelists() {
        try {
            console.log('Checking for expiring whitelist licenses...');
            
            const expiringLicenses = await this.sql.getExpiringWhitelistLicenses();
            
            if (!expiringLicenses || expiringLicenses.length === 0) {
                console.log('No expiring whitelist licenses found.');
                return;
            }

            console.log(`Found ${expiringLicenses.length} expiring whitelist licenses.`);

            // Group licenses by guild for channel notifications
            const licensesByGuild = {};
            const userNotifications = [];

            for (const license of expiringLicenses) {
                const { guild, discordId, kingdomid, kingdomName, dsa, cmine, expiry, continent } = license;
                
                // Group by guild for channel notifications
                if (!licensesByGuild[guild]) {
                    licensesByGuild[guild] = [];
                }
                licensesByGuild[guild].push(license);

                // Collect user notifications if user is verified
                if (discordId) {
                    userNotifications.push({
                        discordId,
                        kingdomid,
                        kingdomName: kingdomName || kingdomid,
                        dsa,
                        cmine,
                        expiry,
                        guild,
                        continent
                    });
                }
            }

            // Send private messages to users
            await this.sendUserNotifications(userNotifications);

            // Send channel notifications to guilds
            await this.sendGuildChannelNotifications(licensesByGuild);

        } catch (error) {
            console.error('Error checking expiring whitelist licenses:', error);
        }
    }

    // Send private messages to discord users
    async sendUserNotifications(userNotifications) {
        for (const notification of userNotifications) {
            try {
                const { discordId, kingdomName, dsa, cmine, expiry } = notification;
                
                const user = await this.discordClient.users.fetch(discordId);
                if (!user) {
                    console.log(`User ${discordId} not found.`);
                    continue;
                }

                const expiryTimestamp = Math.floor(new Date(expiry).getTime() / 1000);
                
                // Create license list for the message
                const licenses = [];
                if (parseInt(dsa) > 0) {
                    licenses.push(`🐉 DSA Level ${dsa}`);
                }
                if (parseInt(cmine) > 0) {
                    licenses.push(`💎 CMine Level ${cmine}`);
                }

                const embed = new EmbedBuilder()
                    .setColor(0xFFAA00) // Orange color for warning
                    .setTitle('⚠️ Whitelist License Expiring Soon')
                    .setDescription(`Your whitelist license(s) for **${kingdomName}** will expire soon!`)
                    .addFields(
                        {
                            name: 'Expiring Licenses',
                            value: licenses.join('\n'),
                            inline: false
                        },
                        {
                            name: 'Expiration Time',
                            value: `<t:${expiryTimestamp}:F> (<t:${expiryTimestamp}:R>)`,
                            inline: false
                        },
                        {
                            name: 'Action Required',
                            value: 'Buy a new license from the shop to renew your whitelist license before it expires.',
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Lokex Whitelist Reminder System' })
                    .setTimestamp();

                await user.send({ embeds: [embed] });
                console.log(`Sent expiry reminder to user ${discordId} for kingdom ${kingdomName}`);

            } catch (error) {
                console.error(`Error sending DM to user ${notification.discordId}:`, error);
            }
        }
    }

    // Send notifications to guild channels
    async sendGuildChannelNotifications(licensesByGuild) {
        for (const [guildId, licenses] of Object.entries(licensesByGuild)) {
            try {
                // Get guild log channels
                const guildSettings = await this.sql.getGuildLogChannels(guildId);
                if (!guildSettings || guildSettings.length === 0) {
                    console.log(`Guild settings not found for guild ${guildId}`);
                    continue;
                }

                // Group licenses by type (DSA and CMine)
                const dsaLicenses = licenses.filter(l => parseInt(l.dsa) > 0);
                const cmineLicenses = licenses.filter(l => parseInt(l.cmine) > 0);

                // Send DSA notifications
                if (dsaLicenses.length > 0) {
                    const channelId = guildSettings[0].dsa_whitelist_channel;
                    if (channelId) {
                        await this.sendChannelNotification(channelId, dsaLicenses, 'DSA', '🐉');
                    }
                }

                // Send CMine notifications
                if (cmineLicenses.length > 0) {
                    const channelId = guildSettings[0].cmine_whitelist_channel;
                    if (channelId) {
                        await this.sendChannelNotification(channelId, cmineLicenses, 'CMine', '💎');
                    }
                }

            } catch (error) {
                console.error(`Error processing guild ${guildId}:`, error);
            }
        }
    }

    // Send notification to a specific channel
    async sendChannelNotification(channelId, licenses, licenseType, emoji) {
        try {
            const channel = await this.discordClient.channels.fetch(channelId);
            if (!channel) {
                console.log(`Channel ${channelId} not found.`);
                return;
            }

            // Create embed for channel notification
            const embed = new EmbedBuilder()
                .setColor(0xFFAA00) // Orange color for warning
                .setTitle(`${emoji} ${licenseType} Licenses Expiring Soon`)
                .setDescription(`The following ${licenseType} licenses will expire within 24 hours:`)
                .setTimestamp()
                .setFooter({ text: 'Lokex Whitelist Reminder System' });

            // Add license information
            const licenseList = licenses.map(license => {
                const kingdomName = license.kingdomName || license.kingdomid;
                const expiryTimestamp = Math.floor(new Date(license.expiry).getTime() / 1000);
                const level = licenseType === 'DSA' ? license.dsa : license.cmine;
                const discordTag = license.discordId ? ` (<@${license.discordId}>)` : '';
                
                return `**${kingdomName}** - Level ${level}${discordTag}\nExpires: <t:${expiryTimestamp}:R>`;
            }).join('\n\n');

            embed.addFields({
                name: 'Expiring Licenses',
                value: licenseList.length > 1024 ? licenseList.substring(0, 1021) + '...' : licenseList,
                inline: false
            });

            await channel.send({ embeds: [embed] });
            console.log(`Sent ${licenseType} expiry notification to channel ${channelId} for ${licenses.length} licenses`);

        } catch (error) {
            console.error(`Error sending notification to channel ${channelId}:`, error);
        }
    }

    // Stop the service
    async stop() {
        if (this.discordClient) {
            await this.discordClient.destroy();
            console.log('UpdateWhitelistReminders Discord client disconnected.');
        }
    }
}

// Test function to run the whitelist reminder checker
async function test() {
    const sql = new sqlFunctions();
    const updateWhitelistReminders = new UpdateWhitelistReminders(sql);
    
    // Run once for testing
    await updateWhitelistReminders.checkExpiringWhitelists();
    
    sql.closeConnection();
    await updateWhitelistReminders.stop();
    console.log('Test completed.');
}

// Uncomment the line below to test
// if (require.main === module) {
//     test().catch(err => {
//         console.error('Error in test:', err);
//         process.exit(1);
//     });
// }

module.exports = UpdateWhitelistReminders;
