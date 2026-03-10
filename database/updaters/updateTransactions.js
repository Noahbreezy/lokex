const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

function maskRpcUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
        const url = new URL(rawUrl);
        return `${url.protocol}//${url.host}${url.pathname || ''}`;
    } catch {
        return String(rawUrl).slice(0, 32);
    }
}

/**
 * UpdateTransactions - Multi-network DST transaction monitor
 * 
 * Monitors DST token transfers on multiple blockchain networks:
 * - Polygon: Original DST contract at 0x3b7e1ce09afe2bb3a23919afb65a38e627cfbe97
 * - Arena-Z: DST contract at 0x05F4B14B7CA9BA5888ABAEd26bAF2186e62D906e
 * 
 * When DST tokens are sent to guild wallets, automatically awards points
 * to verified Discord users and sends notifications to configured channels.
 */

class UpdateTransactions {
    constructor(sql, api) {
        this.sql = sql;
        this.api = api;
        
        // Network configurations
        this.networks = {
            polygon: {
                rpcUrl: 'https://polygon.drpc.org/',
                dstContractAddress: '0x3b7e1ce09afe2bb3a23919afb65a38e627cfbe97',
                lastCheckedBlock: null,
                explorerUrl: 'https://polygonscan.com/tx/'
            },
            arenaZ: {
                rpcUrl: 'https://rpc.arena-z.gg',
                dstContractAddress: '0x05F4B14B7CA9BA5888ABAEd26bAF2186e62D906e',
                lastCheckedBlock: null,
                explorerUrl: 'https://explorer.arena-z.gg/tx/'
            }
        };
        
        this.isRunning = false;
        this.checkInterval = 30000; // Check every 30 seconds
        this.blockLag = 1;          // Skip newest N blocks to avoid RPC head lag
        this.blockOverlap = 5;      // Re-query a few past blocks to avoid misses
        
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
                console.log('UpdateTransactions Discord client is ready.');
                resolve();
            });
        });
    }

    // Start the transaction monitoring
    start() {
        if (this.isRunning) {
            console.log('Transaction updater is already running');
            return;
        }
        
        console.log('Starting DST transaction monitoring on both Polygon and Arena-Z networks...');
        this.isRunning = true;
        this.initializeLastBlocks();
        this.scheduleNextCheck();
    }

    // Stop the monitoring
    stop() {
        if (this.checkTimeout) {
            clearTimeout(this.checkTimeout);
        }
        this.isRunning = false;
        console.log('DST transaction monitoring stopped');
    }

    // Initialize the last checked blocks for all networks
    async initializeLastBlocks() {
        for (const [networkName, network] of Object.entries(this.networks)) {
            try {
                // Get current block number if not set
                if (!network.lastCheckedBlock) {
                    const response = await this.callRpc(network, {
                        jsonrpc: "2.0",
                        method: "eth_blockNumber",
                        params: [],
                        id: 1
                    });
                    if (!response) {
                        continue;
                    }
                    
                    network.lastCheckedBlock = parseInt(response.data.result, 16) - 100; // Start from 100 blocks ago
                    console.log(`Starting DST monitoring on ${networkName} from block: ${network.lastCheckedBlock}`);
                }
            } catch (error) {
                console.error(`Error initializing last block for ${networkName}:`, error);
                network.lastCheckedBlock = null;
            }
        }
    }

    // Initialize the last checked block (legacy method for compatibility)
    async initializeLastBlock() {
        await this.initializeLastBlocks();
    }

    // Schedule the next check
    scheduleNextCheck() {
        if (!this.isRunning) return;
        
        this.checkTimeout = setTimeout(() => {
            this.checkForNewTransactions();
        }, this.checkInterval);
    }

    // Main function to check for new DST transactions
    async checkForNewTransactions() {
        try {
            console.log('Checking for new DST transactions on all networks...');
            
            // Get all guild wallets
            const guildWallets = await this.getGuildWallets();
            if (guildWallets.length === 0) {
                console.log('No guild wallets configured');
                this.scheduleNextCheck();
                return;
            }

            // Check each network
            for (const [networkName, network] of Object.entries(this.networks)) {
                await this.checkNetworkTransactions(networkName, network, guildWallets);
            }
            
        } catch (error) {
            console.error('Error checking for transactions:', error);
        }
        
        this.scheduleNextCheck();
    }

    // Check transactions for a specific network
    async checkNetworkTransactions(networkName, network, guildWallets) {
        try {
            // Get current block number
            const currentBlock = await this.getCurrentBlock(network);
            if (!currentBlock || !network.lastCheckedBlock) {
                console.log(`Unable to get block numbers for ${networkName}`);
                return;
            }

            // Add overlap and confirmation lag to avoid missing recent blocks that are not yet indexed
            const safeToBlock = Math.max(currentBlock - this.blockLag, 0);
            const fromBlock = Math.max(network.lastCheckedBlock - this.blockOverlap, 0);

            // Get DST transfer events since last check
            const transfers = await this.getDSTTransfers(network, fromBlock, safeToBlock);
            
            if (transfers.length > 0) {
                console.log(`Found ${transfers.length} DST transfer events on ${networkName}`);
                await this.processTransfers(transfers, guildWallets, networkName, network.explorerUrl);
            } else {
                // console.log(`No new DST transfers found on ${networkName}`);
            }

            // Advance the cursor to the last block we actually scanned
            network.lastCheckedBlock = safeToBlock;
            
        } catch (error) {
            console.error(`Error checking transactions for ${networkName}:`, error);
        }
    }

    // Get all guild wallets from database
    async getGuildWallets() {
        try {
            const results = await this.sql.getGuildWallets();
            return results || [];
        } catch (error) {
            console.error('Error fetching guild wallets:', error);
            return [];
        }
    }

    // Get current block number
    async getCurrentBlock(network = this.networks.polygon) {
        try {
            const response = await this.callRpc(network, {
                jsonrpc: "2.0",
                method: "eth_blockNumber",
                params: [],
                id: 1
            });
            if (!response) {
                return null;
            }
            
            return parseInt(response.data.result, 16);
        } catch (error) {
            console.error('Error getting current block:', error);
            return null;
        }
    }

    // Get DST transfer events from blockchain
    async getDSTTransfers(network, fromBlock, toBlock) {
        // Some RPCs reject wide ranges; fetch in chunks and adapt on -32062 errors.
        let maxRange = network.maxBlockRange || 2000;
        const minRange = network.minBlockRange || 10;
        const transfers = [];
        let start = fromBlock;

        while (start <= toBlock) {
            let end = Math.min(start + maxRange - 1, toBlock);
            let currentRange = end - start + 1;

            // Retry with shrinking ranges when providers complain about large spans.
            while (true) {
                try {
                    const chunk = await this.fetchDSTLogs(network, start, end);
                    if (chunk) {
                        transfers.push(...chunk);
                    }
                    break; // Success or handled gracefully
                } catch (error) {
                    const message = error?.message?.toLowerCase?.() || '';
                    const code = error?.code;
                    const tooLarge = code === -32062 || message.includes('block range is too large');

                    if (tooLarge) {
                        if (currentRange > minRange) {
                            currentRange = Math.max(minRange, Math.floor(currentRange / 2));
                            maxRange = Math.min(maxRange, currentRange);
                            network.maxBlockRange = maxRange;
                            end = start + currentRange - 1;
                            console.warn(`Block range too large on ${network.rpcUrl}; retrying with range ${currentRange} blocks (${start}-${end}).`);
                            continue;
                        }
                        const rangeError = new Error(`Block range too large even at min range ${minRange} (${start}-${end})`);
                        rangeError.code = code || -32062;
                        throw rangeError;
                    }

                    console.error('Error getting DST transfers:', error);
                    break;
                }
            }

            start = end + 1;
        }

        return transfers;
    }

    async fetchDSTLogs(network, fromBlock, toBlock) {
        // ERC20 Transfer event signature: Transfer(address,address,uint256)
        const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

        const response = await this.callRpc(network, {
            jsonrpc: "2.0",
            method: "eth_getLogs",
            params: [{
                fromBlock: `0x${fromBlock.toString(16)}`,
                toBlock: `0x${toBlock.toString(16)}`,
                address: network.dstContractAddress,
                topics: [transferTopic]
            }],
            id: 1
        });

        const result = response?.data?.result;
        if (!Array.isArray(result)) {
            const err = response?.data?.error || { message: 'Unknown eth_getLogs response shape' };
            const error = new Error(err.message || 'eth_getLogs failed');
            error.code = err.code;
            throw error;
        }

        // console.log(`Fetched ${result.length} DST transfer logs from block ${fromBlock} to ${toBlock} on network ${network.rpcUrl}`);
        // if (result.length) {
        //     console.log('Most recent DST log:', result.at(-1));
        // }

        return result;
    }

    // Process transfer events and award points
    async processTransfers(transfers, guildWallets, networkName, explorerUrl) {
        for (const transfer of transfers) {
            try {
                const decodedTransfer = this.decodeTransferEvent(transfer);
                if (!decodedTransfer) continue;

                // Check if this transfer is to any guild wallet
                const targetGuild = guildWallets.find(guild => 
                    guild.guild_wallet.toLowerCase() === decodedTransfer.to.toLowerCase()
                );

                if (targetGuild) {
                    await this.processGuildTransfer(decodedTransfer, targetGuild.guild_id, transfer.transactionHash, networkName, explorerUrl);
                }
            } catch (error) {
                console.error('Error processing transfer:', error);
            }
        }
    }

    // Decode transfer event data
    decodeTransferEvent(transferLog) {
        try {
            if (transferLog.topics.length !== 3) return null;

            // Decode from and to addresses from topics
            const from = '0x' + transferLog.topics[1].slice(26); // Remove padding
            const to = '0x' + transferLog.topics[2].slice(26); // Remove padding
            
            // Decode amount from data (hex to decimal, considering 18 decimals)
            const amountHex = transferLog.data;
            const amountWei = BigInt(amountHex);
            const amountDST = Number(amountWei) / Math.pow(10, 18);

            return {
                from: from.toLowerCase(),
                to: to.toLowerCase(),
                amount: amountDST,
                blockNumber: parseInt(transferLog.blockNumber, 16),
                transactionHash: transferLog.transactionHash
            };
        } catch (error) {
            console.error('Error decoding transfer event:', error);
            return null;
        }
    }

    // Process a transfer to a guild wallet
    async processGuildTransfer(transfer, guildId, txHash, networkName = 'polygon', explorerUrl = 'https://polygonscan.com/tx/') {
        try {
            console.log(`Processing DST transfer to guild ${guildId}: ${transfer.amount} DST from ${transfer.from} on ${networkName}`);

            // Check if we already processed this transaction
            if (await this.isTransactionProcessed(txHash, guildId)) {
                console.log(`Transaction ${txHash} already processed for guild ${guildId}`);
                return;
            }

            // Get guild point price
            const pointPrice = await this.sql.getGuildPointPrice(guildId);
            if (!pointPrice || pointPrice <= 0) {
                console.log(`No valid point price set for guild ${guildId}`);
                await this.logTransaction(txHash, guildId, transfer.from, transfer.amount, 0, `No point price set (${networkName})`);
                return;
            }

            // Calculate points to award (DST amount / price per point)
            const pointsToAward = Math.floor(transfer.amount / pointPrice);
            if (pointsToAward <= 0) {
                console.log(`Transfer amount too small to award points: ${transfer.amount} DST, price: ${pointPrice}`);
                await this.logTransaction(txHash, guildId, transfer.from, transfer.amount, 0, `Amount too small (${networkName})`);
                return;
            }

            // Check if sender has a verified Discord account
            const userInfo = await this.sql.checkDiscordUserByWallet(transfer.from, guildId);
            if (userInfo) {
                // Award points to the Discord user
                await this.sql.addUserPoints(
                    userInfo.discordId, 
                    guildId, 
                    pointsToAward, 
                    `DST payment`
                );
                
                console.log(`Awarded ${pointsToAward} points to Discord user ${userInfo.discordId} (${userInfo.name}) for ${transfer.amount} DST on ${networkName}`);
                await this.logTransaction(txHash, guildId, transfer.from, transfer.amount, pointsToAward, `Awarded to ${userInfo.discordId} (${networkName})`);
                
                // Send Discord notification
                await this.sendDiscordNotification(guildId, userInfo, pointsToAward, transfer.amount, txHash, networkName, explorerUrl);
            } else {
                console.log(`No verified Discord account found for wallet ${transfer.from} in guild ${guildId}`);
                await this.logTransaction(txHash, guildId, transfer.from, transfer.amount, 0, `No verified Discord account (${networkName})`);
            }

        } catch (error) {
            console.error('Error processing guild transfer:', error);
            await this.logTransaction(txHash, guildId, transfer.from, transfer.amount, 0, `Error: ${error.message} (${networkName})`);
        }
    }

    // Check if transaction was already processed
    async isTransactionProcessed(txHash, guildId) {
        try {
            return await this.sql.isDSTTransactionProcessed(txHash, guildId);
        } catch (error) {
            console.error('Error checking if transaction processed:', error);
            return false;
        }
    }

    // Log transaction for audit purposes
    async logTransaction(txHash, guildId, fromWallet, dstAmount, pointsAwarded, notes) {
        try {
            await this.sql.logDSTTransaction(txHash, guildId, fromWallet, dstAmount, pointsAwarded, notes);
        } catch (error) {
            console.error('Error logging transaction:', error);
        }
    }

    // Method to manually check a specific transaction hash
    async checkSpecificTransaction(txHash, networkName = 'polygon') {
        const network = this.networks[networkName];
        if (!network) {
            console.log(`Unknown network: ${networkName}`);
            return;
        }

        try {

            const response = await this.callRpc(network, {
                jsonrpc: "2.0",
                method: "eth_getTransactionReceipt",
                params: [txHash],
                id: 1
            });
            if (!response) {
                return;
            }

            const receipt = response.data.result;
            if (!receipt) {
                console.warn('[UpdateTransactions] Transaction receipt not found', {
                    ts: new Date().toISOString(),
                    txHash,
                    networkName,
                    rpcHint: maskRpcUrl(network.rpcUrl),
                });
                return;
            }

            // Filter for DST transfer events
            const dstTransfers = receipt.logs.filter(log => 
                log.address.toLowerCase() === network.dstContractAddress.toLowerCase() &&
                log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            );

            const guildWallets = await this.getGuildWallets();
            await this.processTransfers(dstTransfers, guildWallets, networkName, network.explorerUrl);
            
        } catch (error) {
            console.error('Error checking specific transaction:', error);
        }
    }

    // Method to check a transaction hash on all networks
    async checkTransactionOnAllNetworks(txHash) {
        console.log(`Checking transaction ${txHash} on all networks...`);
        for (const networkName of Object.keys(this.networks)) {
            console.log(`Checking on ${networkName}...`);
            await this.checkSpecificTransaction(txHash, networkName);
        }
    }

    // Get network information
    getNetworkInfo() {
        return this.networks;
    }

    // Set custom network configuration (for testing or additional networks)
    addNetwork(name, config) {
        this.networks[name] = {
            rpcUrl: config.rpcUrl,
            dstContractAddress: config.dstContractAddress,
            lastCheckedBlock: null,
            explorerUrl: config.explorerUrl || 'https://etherscan.io/tx/'
        };
    }

    // Get monitoring status for all networks
    async getNetworkStatus() {
        const status = {};
        for (const [networkName, network] of Object.entries(this.networks)) {
            try {
                const currentBlock = await this.getCurrentBlock(network);
                status[networkName] = {
                    rpcUrl: network.rpcUrl,
                    dstContract: network.dstContractAddress,
                    lastCheckedBlock: network.lastCheckedBlock,
                    currentBlock: currentBlock,
                    isConnected: currentBlock !== null,
                    explorerUrl: network.explorerUrl
                };
            } catch (error) {
                status[networkName] = {
                    rpcUrl: network.rpcUrl,
                    dstContract: network.dstContractAddress,
                    lastCheckedBlock: network.lastCheckedBlock,
                    currentBlock: null,
                    isConnected: false,
                    error: error.message,
                    explorerUrl: network.explorerUrl
                };
            }
        }
        return status;
    }

    // Send Discord notification about points distribution
    async sendDiscordNotification(guildId, userInfo, pointsAwarded, dstAmount, txHash, networkName = 'polygon', explorerUrl = 'https://polygonscan.com/tx/') {
        try {
            // Wait for Discord client to be ready
            await this.readyPromise;

            // Get notification channel (shop_log_channel or accept_log_channel as fallback)
            const channelId = await this.sql.getGuildDSTNotificationChannel(guildId);
            if (!channelId) {
                console.log(`No notification channel configured for guild ${guildId}`);
                return;
            }

            // Get guild currency emoji
            const currencyEmoji = await this.sql.getGuildCurrencyEmoji(guildId);
            const emoji = currencyEmoji || '🪙'; // Default coin emoji if no custom emoji is set

            // Get the Discord channel
            const channel = await this.discordClient.channels.fetch(channelId);
            if (!channel) {
                console.log(`Could not find channel ${channelId} for guild ${guildId}`);
                return;
            }

            // Network-specific styling
            const networkEmoji = networkName === 'arenaZ' ? '🏟️' : '🔷';
            const networkDisplay = networkName === 'arenaZ' ? 'Arena-Z' : 'Polygon';

            // Create embed message using EmbedBuilder
            const embed = new EmbedBuilder()
                .setTitle(`💰 DST Payment Processed (${networkDisplay})`)
                .setColor(networkName === 'arenaZ' ? 0xff6b35 : 0x00ff00) // Orange for Arena-Z, Green for Polygon
                .addFields(
                    {
                        name: '👤 User',
                        value: `<@${userInfo.discordId}> (${userInfo.name})`,
                        inline: true
                    },
                    {
                        name: '💎 DST Amount',
                        value: `${dstAmount} DST`,
                        inline: true
                    },
                    {
                        name: '⭐ Points Awarded',
                        value: `${pointsAwarded} ${emoji}`,
                        inline: true
                    },
                    {
                        name: `${networkEmoji} Network`,
                        value: networkDisplay,
                        inline: true
                    },
                    {
                        name: '🔗 Transaction Hash',
                        value: `[${txHash.slice(0, 10)}...${txHash.slice(-8)}](${explorerUrl}${txHash})`,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'DST Payment System' });

            // Send the message
            await channel.send({ embeds: [embed] });

            console.log(`Discord notification sent to channel ${channelId} for guild ${guildId} (${networkName})`);
            
        } catch (error) {
            console.error('Error sending Discord notification:', error);
        }
    }

    isArenaZNetwork(networkOrUrl) {
        const rpcUrl = typeof networkOrUrl === 'string' ? networkOrUrl : networkOrUrl && networkOrUrl.rpcUrl;
        return typeof rpcUrl === 'string' && rpcUrl.includes('arena-z');
    }

    resolveNetwork(networkOrUrl) {
        if (!networkOrUrl) {
            return this.networks.polygon;
        }
        if (typeof networkOrUrl === 'string') {
            return { rpcUrl: networkOrUrl };
        }
        return networkOrUrl;
    }

    async callRpc(networkOrUrl, body) {
        const network = this.resolveNetwork(networkOrUrl);
        const headers = { 'Content-Type': 'application/json' };
        const useIgnore = this.isArenaZNetwork(network);
        const requester = useIgnore && typeof this.api.requestIgnore403 === 'function'
            ? this.api.requestIgnore403.bind(this.api)
            : this.api.request.bind(this.api);
        return requester(network.rpcUrl, body, headers);
    }
}

module.exports = UpdateTransactions;