const sqlFunctions = require('../sql.js');
const Api = require('../../general/api.js');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

class UpdateBuffs {
    constructor(sqlInstance, api) {
        this.sql = sqlInstance;
        this.api = api;
        this.discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
            ],
        });
        this.discordToken = "MTI5ODk2ODI5MzI2NDMzMDgxMg.GDcLFk.aJTF1L1xQnV5unkUx2jYddUdmNLwmjjKHsebCE"; // Replace with your bot token
        this.discordClient.login(this.discordToken);

        this.padding = `||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​|| _ _ _ _ _ _`


        // Ensure the client is ready before proceeding
        this.readyPromise = new Promise((resolve) => {
            this.discordClient.once('ready', () => {
                console.log('updateBuffs Discord client is ready.');
                resolve();
            });
        });
    }

    // Run buff checks for all guilds every 5 minutes
    async runBuffCheck() {
        await this.readyPromise; // Wait for Discord client to be ready

        const interval = 60 * 1000; // 5 minutes in milliseconds
        while (true) {
            try {
                const guilds = await this.sql.getAllContinentBuffChannels(); // Fetch all guilds
                // console.log(guilds);
                for (const guild of guilds) {
                    await this.checkActiveBuffs(guild.guild_id); // Check buffs for each guild
                }
            } catch (err) {
                console.error('Error in runBuffCheck:', err);
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }

    // Fetch buff data from League of Kingdoms API for a specific guild
    async fetchBuffData(guildId) {
        try {
            const url = 'https://api-lok-live.leagueofkingdoms.com/api/shrine/skill';
            const body = {};
            const headers = {
                'x-access-token': await this.getLatestToken(guildId), // Fetch the latest token for this guild
                'Content-Type': 'application/json',
            };

            const response = await this.api.request(url, body, headers);
            // console.log(response.data.skills);
            return response.data.skills || {};
        } catch (error) {
            console.error(`Error fetching buff data for guild ${guildId} from League of Kingdoms API:`, error);
            return {};
        }
    }

    // Get the latest queen token from the database for a specific guild
    async getLatestToken(guildId) {
        try {
            const tokens = await this.sql.getQueenToken(guildId); 
            if (!tokens || !tokens[0]?.token) {
                throw new Error(`No queen token found for guild ${guildId}`);
            }
            return tokens[0].token;
        } catch (error) {
            console.error(`Error fetching queen token for guild ${guildId} from database:`, error);
            return null; // Return null if token fetch fails
        }
    }

    // Convert ISO date string to epoch time (seconds)
    async convertToEpoch(isoDateString) {
        return Math.floor(new Date(isoDateString).getTime() / 1000);
    }

    // Check for active buffs and notify the specific guild
    async checkActiveBuffs(guildId) {
        const token = await this.getLatestToken(guildId);
        if (!token) {
            console.error(`Skipping buff check for guild ${guildId} due to missing token`);
            return;
        }

        const skills = await this.fetchBuffData(guildId);
        if (Object.keys(skills).length === 0) {
            console.log(`No buff data returned for guild ${guildId}`);
            return;
        }

        const currentTime = Math.floor(Date.now() / 1000); // Current time in epoch seconds
        const interval = 60; // 1 minute in seconds for active check

        for (const skill in skills) {
            const skillData = skills[skill];
            const skillCode = String(skillData.skillCode);
            const startTime = await this.convertToEpoch(skillData.endTime) - (8 * 60 * 60); // Adjust as per game logic
            const activeUntil = await this.convertToEpoch(skillData.endTime);
            const availableNext = await this.convertToEpoch(skillData.nextSkillTime);

            // Determine if the buff is active
            let isActive = startTime < currentTime && currentTime <= startTime + interval;
            // console.log(`Checking buff ${skillCode} for guild ${guildId}:`, isActive, startTime, currentTime, activeUntil, availableNext);
            if (skillCode === '104') { // Special case for Global Crystal
                isActive = activeUntil > currentTime - interval;
            }

            if (isActive) {
                await this.notifyGuild(guildId, skillCode, activeUntil, availableNext);
            }
        }
    }

    // Notify a specific guild about an active buff
    async notifyGuild(guildId, skillCode, activeUntil, availableNext) {
        // console.log(`Notifying guild ${guildId} about buff ${skillCode}`);
        // console.log(typeof skillCode);
        let message = '';
        let emoji = '';


        switch (skillCode) {
            case '101':
                emoji = ':farmer:';
                message = `${emoji} **Global Gathering** is now ON :tractor: and ends <t:${activeUntil}:R> (<t:${activeUntil}:F>)\n:hourglass_flowing_sand: Usable again <t:${availableNext}:R> (<t:${availableNext}:F>)`;
                break;
            case '102':
                emoji = ':woman_health_worker:';
                message = `${emoji} **Global Healing** is now ON :ambulance: and ends <t:${activeUntil}:R> (<t:${activeUntil}:F>)\n:hourglass_flowing_sand: Usable again <t:${availableNext}:R> (<t:${availableNext}:F>)`;
                break;
            case '103':
                emoji = ':zap:';
                message = `${emoji} **Global Training** is now ON :muscle: and ends <t:${activeUntil}:R> (<t:${activeUntil}:F>)\n:hourglass_flowing_sand: Usable again <t:${availableNext}:R> (<t:${availableNext}:F>)`;
                break;
            case '104':
                emoji = ':gem:';
                message = `${emoji} **Global Crystal** is now ON :rocket:\n:hourglass_flowing_sand: Usable again <t:${availableNext}:R> (<t:${availableNext}:F>)`;
                break;
            default:
                return; // Unknown skill code
        }

        // console.log(message);

        const guildInfo = (await this.sql.getAllContinentBuffChannels()).find(g => g.guild_id === guildId);
        if (!guildInfo) {
            console.error(`Guild info not found for guild ${guildId}`);
            return;
        }

        const channelId = guildInfo.buff_channel;
        const continent = Number(guildInfo.continent);

        try {
            const channel = await this.discordClient.channels.fetch(channelId);
            if (!channel) {
                console.error(`Channel ${channelId} not found in guild ${guildId}`);
                return;
            }

            // Check if this guild has seen this buff activation (deduplication)
            const latestBuff = await this.sql.getLatestBuffMessage(skillCode, guildId);
            if (latestBuff && latestBuff.timestamp >= activeUntil - 60) return; // Skip if already notified recently

            const role = (await this.sql.getGuildVerificationRole(guildId))[0]?.verified_role;
            const gif = (await this.sql.getRandomGif(skillCode, guildId))[0]?.gif_link;
            
            // Send the message with role ping and gif
            const roleMention = `<@&${role}>`; // Adjust to continent-specific role if available
            const fullMessage = `${message}\n${roleMention} ${this.padding} ${gif}`;
            const sentMessage = await channel.send(fullMessage);

            // Store the message ID in the database for deduplication
            await this.sql.insertBuffMessage(sentMessage.id, skillCode, guildId, activeUntil);

            console.log(`Notified guild ${guildId} (C${continent}) about buff ${skillCode}`);
        } catch (err) {
            console.error(`Error notifying guild ${guildId} in channel ${channelId}:`, err);
        }
    }
}

// Test function to run the buff checker
async function test() {
    const sql = new sqlFunctions();
    const api = new Api(sql);
    const updateBuffs = new UpdateBuffs(sql, api);

    await updateBuffs.runBuffCheck();
    // Note: This is an infinite loop, so the following line won't be reached
    sql.closeConnection();
}

// if (require.main === module) {
//     test().catch(err => {
//         console.error('Error in test:', err);
//         process.exit(1);
//     });
// }

module.exports = UpdateBuffs;