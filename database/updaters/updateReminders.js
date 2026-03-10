const sqlFunctions = require('../sql.js');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
require('dotenv').config();

class UpdateReminders {
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
                console.log('updateReminders Discord client is ready.');
                resolve();
            });
        });
    }

    // Run subscription expiration checks every day at 8am UTC
    async runSubscriptionReminder() {
        await this.readyPromise; // Wait for Discord client to be ready

        // Run the check immediately on startup
        await this.checkExpiringSubscriptions();

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

        console.log(`Next subscription reminder check scheduled for ${nextRun.toUTCString()}`);

        // Set a timeout for the next run
        setTimeout(async () => {
            await this.checkExpiringSubscriptions();
            // Schedule the next run (24 hours later)
            this.scheduleNextRun();
        }, timeUntilNextRun);
    }

    // Check for subscriptions expiring within 7 days
    async checkExpiringSubscriptions() {
        // Get current timestamp and 7-day threshold
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const sevenDaysInSeconds = 7 * 24 * 60 * 60;
        const thresholdTimestamp = currentTimestamp + sevenDaysInSeconds;

        // Query all guilds with their valid_until dates
        const query = "SELECT guild_id, valid_until FROM guild_continent_link WHERE valid_until IS NOT NULL;";
        const subscriptions = await this.sql.query(query);

        for (const sub of subscriptions) {
            const guildId = sub.guild_id;
            const validUntil = new Date(sub.valid_until).getTime() / 1000; // Convert to epoch seconds

            // Check if the subscription expires within 7 days
            if (validUntil <= thresholdTimestamp && validUntil >= currentTimestamp) {
                await this.notifyGuild(guildId, validUntil);
            }
        }
    }

    // Notify the guild about an upcoming subscription expiration
    async notifyGuild(guildId, validUntil) {
        // Fetch the guild's log channels
        const guildSettings = await this.sql.getGuildLogChannels(guildId);
        if (!guildSettings || guildSettings.length === 0) {
            console.error(`Guild settings not found for guild ${guildId}`);
            return;
        }

        const channelId = guildSettings[0].accept_log_channel;
        if (!channelId) {
            console.error(`Accept log channel not set for guild ${guildId}`);
            return;
        }

        try {
            const channel = await this.discordClient.channels.fetch(channelId);
            if (!channel) {
                console.error(`Channel ${channelId} not found in guild ${guildId}`);
                return;
            }

            // Fetch the guild to get the highest admin role
            const guild = await this.discordClient.guilds.fetch(guildId);
            const roles = guild.roles.cache
                .filter(role => role.permissions.has(PermissionsBitField.Flags.Administrator))
                .sort((a, b) => b.position - a.position); // Sort by position, highest first

            const adminRole = roles.first();
            if (!adminRole) {
                console.error(`No admin role found in guild ${guildId}`);
                return;
            }

            // Create the reminder message
            const message = `<@&${adminRole.id}> :warning: **Subscription Reminder** :warning:\nYour subscription will expire <t:${validUntil}:R> (<t:${validUntil}:F>). Please renew your subscription using \`/subscription renew\` to avoid interruption of services. Contact support if you have any issues.`;

            // Send the message
            await channel.send(message);
            console.log(`Notified guild ${guildId} about subscription expiring on <t:${validUntil}:F>`);
        } catch (err) {
            console.error(`Error notifying guild ${guildId} in channel ${channelId}:`, err);
        }
    }
}

// Test function to run the reminder checker
async function test() {
    const sql = new sqlFunctions();
    const updateReminders = new UpdateReminders(sql);

    await updateReminders.runSubscriptionReminder();
    sql.closeConnection();
}

module.exports = UpdateReminders;