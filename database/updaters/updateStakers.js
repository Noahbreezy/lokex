const sqlFunctions = require('../sql.js');
const Api = require('../../general/api.js');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

class UpdateStakers {
    constructor(sqlInstance, api) {
        this.sql = sqlInstance;
        this.api = api;
        // Updated Sept 1 2025: new staking contract address
        this.stakingAddress = '0x32c245E8aD0396d570ae4c6e93e97F5CB20B33F5';
        this.discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
            ],
        });
        this.discordToken = process.env.DISCORD_TOKEN; // Discord bot token
        this.discordClient.login(this.discordToken);

        // Ensure the client is ready before proceeding
        this.readyPromise = new Promise((resolve) => {
            this.discordClient.once('ready', () => {
                console.log('updateStakers Discord client is ready.');
                resolve();
            });
        });
    }

    // Run staking transaction updates every minute
    async runStakeUpdate() {
        while (true) {
            // Wait for the Discord client to be ready
            await this.readyPromise;

            try {
                await this.checkForNewTransactions();
            } catch (err) {
                console.error('Error in runStakeUpdate:', err);
            }

            // Calculate milliseconds until the next minute
            const now = new Date();
            const nextMinute = new Date(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                now.getUTCHours(),
                now.getUTCMinutes() + 5,
                0, // Seconds
                0  // Milliseconds
            );
            const millisTillNextMinute = nextMinute - now;

            // console.log(`Stake Update: Waiting ${millisTillNextMinute} ms until the next minute...`);
            await new Promise(resolve => setTimeout(resolve, millisTillNextMinute));
        }
    }

    // Run comment updates every day at midnight UTC
    async runCommentsUpdate() {
        while (true) {
            // Wait for the Discord client to be ready
            await this.readyPromise;

            try {
                await this.updateComments();
            } catch (err) {
                console.error('Error in runCommentsUpdate:', err);
            }

            // Calculate milliseconds until 2 AM UTC two days from now
            const now = new Date();
            const nextUpdate = new Date(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + (now.getUTCHours() >= 2 ? 2 : 1), // Skip to the next 2 AM if past 2 AM
                2, 0, 0, 0 // 2 AM UTC
            );
            const millisTillNextUpdate = nextUpdate - now;

            // console.log(`Comments Update: Waiting ${millisTillNextUpdate} ms until next update at 2 AM UTC...`);
            await new Promise(resolve => setTimeout(resolve, millisTillNextUpdate));
        }
    }

    // Fetch transactions from Etherscan API
    async fetchTransactions() {
        try {
            const response = await axios.get('https://api.etherscan.io/v2/api', {
                params: {
                    chainid: 1,
                    module: 'account',
                    action: 'txlist',
                    address: this.stakingAddress,
                    sort: 'asc',
                    apikey: 'ZR183PKEH4217SU7AJYAWR7DZ7C4ZIBTD7', // Replace with your Etherscan API key
                },
            });
            return response.data.result || [];
        } catch (error) {
            console.error('Error fetching transactions from Etherscan:', error);
            return [];
        }
    }

    // Fetch comment (staker's name) from League of Kingdoms API
    async getComment(address) {
        try {
            const url = 'https://api-lok-beta.leagueofkingdoms.com/api/staking/mystaking';
            const body = { address };
            const headers = { 'Content-Type': 'application/json' };

            // Use the request function from the Api class
            const response = await this.api.request(url, body, headers);

            const data = response.data;
            if (data.result && data.my?.staking?.comment) {
                return data.my.staking.comment;
            }
            return '';
        } catch (error) {
            console.error(`Error fetching comment for address ${address}:`, error);
            return '';
        }
    }

    // Update comments for all addresses in the database
    async updateComments() {
        console.log('Updating staking comments...');
        const addresses = await this.sql.getDistinctStakingAddresses();
        for (const row of addresses) {
            const address = row.from_address;
            const comment = await this.getComment(address);
            if (comment) {
                await this.sql.updateStakingComment(address, comment);
                // console.log(`Updated comment for ${address}: ${comment}`);
            }
        }
    }

    // Check for new staking/unstaking transactions
    async checkForNewTransactions() {
        const latestTimestamp = await this.sql.getLatestStakingTimestamp();
        const transactions = await this.fetchTransactions();
        if (!transactions || transactions.length === 0) {
            console.log('No transactions fetched.');
            return;
        }

        let newTransactionsFound = false;

        console.log(`Fetched ${transactions.length} transactions. Latest stored timestamp: ${latestTimestamp}`);

        for (const tx of transactions) {
            if (tx.isError === '1') continue; // Skip failed transactions
            if (tx.timeStamp <= latestTimestamp) continue; // Skip old transactions

            let isStaking = false;
            let continent = 0;
            let amount = 0;

            // Updated Sept 1 2025: Method IDs & param mapping changed.
            // stake(uint256 _submissionId, uint256 _amount) => methodID 0x7b0472f0
            // unstake(uint256 _tokens, uint256 dayType) BUT first param represents submissionId (continent) per new spec
            // methodID 0x9e2c8a5b
            const input = tx.input || '';
            if (!input || input.length < 10 + 64 * 2) {
                continue; // malformed input
            }
            const methodId = input.slice(0, 10);
            if (methodId === '0x7b0472f0') {
                isStaking = true;
            } else if (methodId === '0x9e2c8a5b') {
                isStaking = false;
            } else {
                continue; // Not a staking/unstaking tx we care about
            }

            // Parameter extraction remains positional: first 32 bytes = continent (submissionId), second 32 bytes = amount
            const continentHex = input.substring(10, 74); // _submissionId (continent)
            const amountHex = input.substring(74, 138); // _amount (stake) or tokens (unstake) per new mapping

            continent = parseInt(continentHex, 16);

            // Validate continent value
            if (isNaN(continent) || continent < 0 || continent > 99999999999) {
                console.error(`Invalid continent value: ${continent} from transaction ${tx.hash}`);
                continue; // Skip this transaction
            }

            amount = parseInt(amountHex, 16) / 1000000000000000000; // Convert from wei to A2Z
            amount = isStaking ? amount : -amount; // Negative for unstaking

            newTransactionsFound = true;

            // Normalize continent for storage according to Sept 1 merge rules.
            // Post-Sept 1 (timestamp >= cutoff) continents arrive as 1..8 -> store 101..108
            // Pre-Sept 1 keep original legacy continent (will be mapped during aggregation)
            const cutoff = Math.floor(Date.UTC(2025, 8, 1) / 1000); // 2025-09-01 UTC
            let storedContinent = continent;
            if (Number(tx.timeStamp) >= cutoff && continent >= 1 && continent <= 8) {
                storedContinent = continent + 100; // 1->101 etc
            }

            // Fetch comment (staker's name)
            const comment = await this.getComment(tx.from);

            await this.sql.insertStakingTransaction(
                tx.hash,
                tx.from,
                storedContinent,
                amount,
                tx.timeStamp,
                comment,
                isStaking
            );

            // Log to Discord
            await this.logToDiscord(tx, storedContinent, amount, comment, isStaking);

            // Update channel name
            await this.updateChannelName();
        }

        // if (!newTransactionsFound) {
        //     console.log('No new staking transactions found.');
        // }
    }

    // Log the transaction to the Discord pledgers channel
    async logToDiscord(tx, continent, amount, comment, isStaking) {
        // Fetch all guilds and their pledgers channels
        const guilds = await this.sql.getAllContinentPledgeChannels();
        for (const guild of guilds) {
            const guildId = guild.guild_id;
            const channelId = guild.pledgers_channel;
            const guildContinent = Number(guild.continent);

            try {
                const channel = await this.discordClient.channels.fetch(channelId);
                if (!channel) {
                    console.error(`Pledgers channel ${channelId} not found in guild ${guildId}`);
                    continue;
                }
                // console.log(continent, guildContinent, isStaking);
                // console.log(typeof continent, typeof guildContinent, typeof isStaking);

                const subscriptionFlagInfo = await this.sql.checkSubscriptionValid(guildId, "2");
                if (!subscriptionFlagInfo) {
                    await channel.send("A pledge was made to a continent, but you have no valid subscription for this service.  Use `/subscription renew` to get a new subscription.");
                    continue;
                }

                // Emoji decision should use mapped continents for 101..108
                const mappedEventCont = this.mapContinentForEmoji(Number(continent));
                const mappedGuildCont = this.mapContinentForEmoji(Number(guildContinent));

                // Format the message
                let emoji = (mappedEventCont === mappedGuildCont && isStaking) || (mappedEventCont !== mappedGuildCont && !isStaking)
                    ? '<a:8697pepehyped:1352775694287110185>'
                    : '<a:1314kekwholup:1352775612389003396>';

                const action = isStaking ? 'New staking' : 'New unstaking';
                const formattedAmount = this.formatNumberWithSuffix(Math.abs(amount));
                const message = comment
                    ? `${emoji} **${action}** on **C${continent}** from **${this.cleanAndEscapeDiscordString(comment)}** Amount: **${formattedAmount}** A2Z`
                    : `${emoji} **${action}** on **C${continent}** Amount: **${formattedAmount}** A2Z`;

                await channel.send(message);
            } catch (err) {
                console.error(`Error sending message to channel ${channelId} in guild ${guildId}:`, err);
            }
        }
    }

    // Map new continents (101-108) to legacy equivalents for emoji decision logic only
    mapContinentForEmoji(cont) {
        const mapping = {
            101: 19,
            102: 20,
            103: 60,
            104: 24,
            105: 59,
            106: 17,
            107: 25,
            108: 2,
        };
        return mapping[cont] || cont;
    }

    // Update the pledgers channel name based on net staking for continent guildContinent
    async updateChannelName() {
        // Use merged aggregation which applies legacy mapping and multiplier
        const netStaking = await this.sql.getMergedNetStaking();
        const guilds = await this.sql.getAllContinentPledgeChannels();

        for (const guild of guilds) {
            const guildId = guild.guild_id;
            const channelId = guild.pledgers_channel;
            const mappedGuildContinent = this.normalizeContinentForNet(guild.continent);

            if (mappedGuildContinent === null) {
                console.error(`Unable to normalize continent value '${guild.continent}' for guild ${guildId}`);
                continue;
            }

            try {
                const channel = await this.discordClient.channels.fetch(channelId);
                if (!channel) continue;

                // Find continentStake ensuring type consistency
                const continentStake = netStaking.find(row => Number(row.continent) === mappedGuildContinent);
                const difference = continentStake ? Number(continentStake.total_amount) : 0;

                // console.log(`NetStaking:`, netStaking);
                // console.log(`Matching ContinentStake:`, continentStake);
                // console.log(`Computed Difference:`, difference);

                // Determine new channel name
                let channelName = `📈┃pledging ${this.formatNumberWithSuffix2(Math.abs(difference))}`;

                await channel.setName(channelName);
                // console.log(`Updated channel name for ${channelId} to ${channelName}`);
            } catch (err) {
                console.error(`Error updating channel name for ${channelId} in guild ${guildId}:`, err);
            }
        }
    }


    // Utility to format numbers with suffixes (e.g., 1.57K, 2.00M)
    formatNumberWithSuffix(number) {
        if (number >= 1e6) {
            return (number / 1e6).toFixed(2) + 'M';
        } else if (number >= 1e3) {
            return (number / 1e3).toFixed(2) + 'K';
        }
        return number.toFixed(2).toString();
    }

    formatNumberWithSuffix2(number) {
        if (number >= 1e6) {
            return (number / 1e6).toFixed(0) + 'M';
        } else if (number >= 1e3) {
            return (number / 1e3).toFixed(0) + 'K';
        }
        return number.toFixed(0).toString();
    }

    // Utility to escape Discord special characters
    cleanAndEscapeDiscordString(input) {
        // Strip Discord mentions and tags to avoid accidental pings
        let sanitized = input
            .replace(/<@!?\d+>/g, '') // user mentions like <@123> or <@!123>
            .replace(/<@&\d+>/g, '') // role mentions
            .replace(/@everyone/gi, '')
            .replace(/@here/gi, '')
            .replace(/@\d+/g, ' ') // fallback for raw @123 cases
            .replace(/\s+/g, ' ')
            .trim();

        const escapeChars = ['*', '_', '|', '~', '`', '\\'];
        let escapedString = '';
        for (let char of sanitized) {
            if (escapeChars.includes(char)) {
                escapedString += '\\' + char;
            } else {
                escapedString += char;
            }
        }
        return escapedString;
    }

    // Normalize various continent representations to merged indices (101-108)
    normalizeContinentForNet(continentValue) {
        if (continentValue === undefined || continentValue === null) {
            return null;
        }

        const match = String(continentValue).match(/\d+/);
        if (!match) {
            return null;
        }

        const numeric = Number(match[0]);

        if (numeric >= 101 && numeric <= 108) {
            return numeric;
        }

        if (numeric >= 1 && numeric <= 8) {
            return numeric + 100;
        }

        const legacyToMerged = {
            19: 101,
            20: 102,
            60: 103,
            24: 104,
            59: 105,
            17: 106,
            25: 107,
            2: 108,
        };

        if (legacyToMerged[numeric]) {
            return legacyToMerged[numeric];
        }

        return numeric;
    }
}

// Test function to run the logger
async function test() {
    const sql = new sqlFunctions();
    const api = new Api(sql);
    const updateStakers = new UpdateStakers(sql, api);

    // Start both update loops concurrently
    const stakePromise = updateStakers.runStakeUpdate();
    // const commentsPromise = updateStakers.runCommentsUpdate();

    // Wait for both promises (they won't resolve since they're infinite loops)
    await Promise.all([stakePromise]);

    // Close the SQL connection (this won't be reached due to the infinite loops)
    sql.closeConnection();
}

// if (require.main === module) {
//     test().catch(err => {
//         console.error('Error in test:', err);
//         process.exit(1);
//     });
// }

module.exports = UpdateStakers;