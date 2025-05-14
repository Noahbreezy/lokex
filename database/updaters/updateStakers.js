const sqlFunctions = require('../sql.js');
const Api = require('../../general/api.js');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

class UpdateStakers {
    constructor(sqlInstance, api) {
        this.sql = sqlInstance;
        this.api = api;
        this.stakingAddress = '0x196a26eF25Beea61f9199e3F9d4C5C03377DF786'; // Default staking address
        this.discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
            ],
        });
        this.discordToken = "MTI5ODk2ODI5MzI2NDMzMDgxMg.GDcLFk.aJTF1L1xQnV5unkUx2jYddUdmNLwmjjKHsebCE"; // Replace with your bot token
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
            const response = await axios.get('https://api.etherscan.io/api', {
                params: {
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

        for (const tx of transactions) {
            if (tx.isError === '1') continue; // Skip failed transactions
            if (tx.timeStamp <= latestTimestamp) continue; // Skip old transactions

            let isStaking = false;
            let continent = 0;
            let amount = 0;

            // Determine if it's a staking or unstaking transaction
            if (tx.functionName === 'stake(uint256 caveId, uint256 tokenId)') {
                isStaking = true;
            } else if (tx.functionName === 'unstake(uint256 caveId, uint256 tokenId)') {
                isStaking = false;
            } else {
                continue; // Skip irrelevant transactions
            }

            // Parse transaction input
            const input = tx.input;
            const continentHex = input.substring(10, 74); // caveId (continent)
            const tokenIdHex = input.substring(74, 138); // tokenId (amount)

            continent = parseInt(continentHex, 16);

            // Validate continent value
            if (isNaN(continent) || continent < 0 || continent > 99999999999) {
                console.error(`Invalid continent value: ${continent} from transaction ${tx.hash}`);
                continue; // Skip this transaction
            }

            amount = parseInt(tokenIdHex, 16) / 1000000000000000000; // Convert from wei to LOKA
            amount = isStaking ? amount : -amount; // Negative for unstaking

            newTransactionsFound = true;

            // Fetch comment (staker's name)
            const comment = await this.getComment(tx.from);

            // Insert into database
            await this.sql.insertStakingTransaction(
                tx.hash,
                tx.from,
                continent,
                amount,
                tx.timeStamp,
                comment,
                isStaking
            );

            // Log to Discord
            await this.logToDiscord(tx, continent, amount, comment, isStaking);

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
                    await channel.send("A pledge was made to a continent, but you have no valid subscription for this service.");
                    continue;
                }

                // Format the message
                let emoji = (continent === guildContinent && isStaking) || (continent !== guildContinent && !isStaking)
                    ? '<a:8697pepehyped:1352775694287110185>'
                    : '<a:1314kekwholup:1352775612389003396>';

                const action = isStaking ? 'New staking' : 'New unstaking';
                const formattedAmount = this.formatNumberWithSuffix(Math.abs(amount));
                const message = comment
                    ? `${emoji} **${action}** on **C${continent}** from **${this.cleanAndEscapeDiscordString(comment)}** Amount: **${formattedAmount}** LOKA`
                    : `${emoji} **${action}** on **C${continent}** Amount: **${formattedAmount}** LOKA`;

                await channel.send(message);
            } catch (err) {
                console.error(`Error sending message to channel ${channelId} in guild ${guildId}:`, err);
            }
        }
    }

    // Update the pledgers channel name based on net staking for continent guildContinent
    async updateChannelName() {
        const netStaking = await this.sql.getNetStakingByContinent();
        const guilds = await this.sql.getAllContinentPledgeChannels();

        for (const guild of guilds) {
            const guildId = guild.guild_id;
            const channelId = guild.pledgers_channel;
            const guildContinent = Number(guild.continent); // Ensure it's a number

            try {
                const channel = await this.discordClient.channels.fetch(channelId);
                if (!channel) continue;

                // Find continentStake ensuring type consistency
                const continentStake = netStaking.find(row => Number(row.continent) === guildContinent);
                const difference = continentStake ? Number(continentStake.total_amount) : 0;

                // console.log(`NetStaking:`, netStaking);
                // console.log(`Matching ContinentStake:`, continentStake);
                // console.log(`Computed Difference:`, difference);

                // Determine new channel name
                let channelName = `📈 ┃ pledging ${this.formatNumberWithSuffix2(Math.abs(difference))}`;

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
        let trimmedString = input.trim();
        const escapeChars = ['*', '_', '|', '~', '`', '\\'];
        let escapedString = '';
        for (let char of trimmedString) {
            if (escapeChars.includes(char)) {
                escapedString += '\\' + char;
            } else {
                escapedString += char;
            }
        }
        return escapedString;
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