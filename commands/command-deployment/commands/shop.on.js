const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");

// Helper function to format numbers with K, M, B suffixes
function formatNumber(num) {
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    if (absNum >= 1_000_000_000) {
        return sign + (absNum / 1_000_000_000).toFixed(1) + 'B';
    } else if (absNum >= 1_000_000) {
        return sign + (absNum / 1_000_000).toFixed(1) + 'M';
    } else if (absNum >= 1_000) {
        return sign + (absNum / 1_000).toFixed(1) + 'K';
    } else {
        return sign + Math.floor(absNum).toString();
    }
}



module.exports = {
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("Manage guild shop items")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add a new item to the shop")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("Name of the item")
                        .setRequired(true)
                        .setMaxLength(50)
                )
                .addNumberOption((option) =>
                    option
                        .setName("price")
                        .setDescription("Price of the item")
                        .setRequired(true)
                        .setMinValue(0.01)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("stock")
                        .setDescription("Stock amount")
                        .setRequired(true)
                        .setMinValue(0)
                )
                .addStringOption((option) =>
                    option
                        .setName("description")
                        .setDescription("Description of the item")
                        .setRequired(false)
                        .setMaxLength(200)
                )
                .addStringOption((option) =>
                    option
                        .setName("type")
                        .setDescription("Type of the item")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("level")
                        .setDescription("Level of the item")
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("duration")
                        .setDescription("Duration in weeks")
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("mincastle")
                        .setDescription("Minimum castle level required to purchase")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(50)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("edit")
                .setDescription("Edit an existing shop item")
                .addStringOption((option) =>
                    option
                        .setName("item")
                        .setDescription("Select the item to edit")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("New name of the item")
                        .setRequired(false)
                        .setMaxLength(50)
                )
                .addNumberOption((option) =>
                    option
                        .setName("price")
                        .setDescription("New price of the item")
                        .setRequired(false)
                        .setMinValue(0.01)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("stock")
                        .setDescription("New stock amount")
                        .setRequired(false)
                        .setMinValue(0)
                )
                .addStringOption((option) =>
                    option
                        .setName("description")
                        .setDescription("New description of the item (use 'CLEAR' to remove description)")
                        .setRequired(false)
                        .setMaxLength(200)
                )
                .addStringOption((option) =>
                    option
                        .setName("type")
                        .setDescription("New type of the item")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("level")
                        .setDescription("New level of the item")
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("duration")
                        .setDescription("New duration in weeks")
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("mincastle")
                        .setDescription("New minimum castle level required to purchase (use 0 to clear)")
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(50)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove an item from the shop")
                .addStringOption((option) =>
                    option
                        .setName("item")
                        .setDescription("Select the item to remove")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("List all shop items")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("refresh")
                .setDescription("Refresh the shop channel display")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("history")
                .setDescription("View shop purchase history")
                .addIntegerOption((option) =>
                    option
                        .setName("limit")
                        .setDescription("Number of recent purchases to show")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("balance")
                .setDescription("Check your points balance")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("Check another user's balance (admin only)")
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("addpoints")
                .setDescription("Add or remove points from a user (admin only)")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The user to add/remove points from")
                        .setRequired(true)
                )
                .addNumberOption((option) =>
                    option
                        .setName("amount")
                        .setDescription("Amount of points to add (positive) or remove (negative)")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("reason")
                        .setDescription("Reason for adding/removing points")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("purchase-points")
                .setDescription("Claim points from a DST payment using transaction hash")
                .addStringOption((option) =>
                    option
                        .setName("txhash")
                        .setDescription("Transaction hash of your DST payment")
                        .setRequired(true)
                        .setMinLength(66)
                        .setMaxLength(66)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("licenses")
                .setDescription("View your available whitelist licenses")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("Check another user's licenses (admin only)")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("kingdom")
                        .setDescription("Specify a kingdom (name or ID) to view its owner's licenses")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const { commandName, options, guildId, user } = interaction;
        const guild = interaction.guild;
        const guildName = interaction.guild.name;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        try {
            // Ensure guild exists in database
            const guildExistsFlag = await sql.guildExists(guildId);
            if (!guildExistsFlag) {
                await sql.addGuild(guildId, guildName);
            }

            // Get currency emoji for this guild
            const currencyEmoji = await getCurrencyEmoji(guildId, sql);

            // Check admin permissions for admin-only commands
            const adminOnlyCommands = ['add', 'edit', 'remove', 'refresh', 'history', 'addpoints'];
            const subcommand = options.getSubcommand();
            
            if (adminOnlyCommands.includes(subcommand)) {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    await interaction.reply({ content: "❌ You need administrator permissions to use this command.", flags: 64 });
                    return;
                }
            }

            switch (subcommand) {
                case "add":
                    {
                        const name = options.getString("name");
                        const price = options.getNumber("price");
                        const stock = options.getInteger("stock");
                        const description = options.getString("description") || null;
                        const type = options.getString("type") || null;
                        const level = options.getInteger("level") || null;
                        const duration = options.getInteger("duration") || null;
                        const mincastle = options.getInteger("mincastle") || null;

                        // Validate that dsa and cmine items have required level and duration
                        if (type && (type.toLowerCase() === 'dsa' || type.toLowerCase() === 'cmine')) {
                            if (!level) {
                                await interaction.reply({ content: `❌ Items with type "${type.toUpperCase()}" must have a level specified.`, flags: 64 });
                                return;
                            }
                            if (!duration) {
                                await interaction.reply({ content: `❌ Items with type "${type.toUpperCase()}" must have a duration specified.`, flags: 64 });
                                return;
                            }
                        }

                        await sql.addShopItem(guildId, name, price, stock, description, type, level, duration, mincastle);
                        const items = await sql.getShopItems(guildId);
                        const addedItem = items.find(i => i.name === name && i.price === price && i.stock === stock);
                        const itemIdMsg = addedItem ? ` (ID: ${addedItem.id})` : '';
                        await interaction.reply({ content: `✅ Item "${name}"${itemIdMsg} added to shop with price ${formatNumber(price)} ${currencyEmoji} and stock ${stock}.`, ...ephemeral });
                        
                        // Log the action
                        if (addedItem) {
                            await logShopAction(guildId, sql, guild, 'item_added', user, {
                                id: addedItem.id,
                                name,
                                price,
                                stock,
                                description,
                                type,
                                level,
                                duration,
                                mincastle
                            });
                        }
                        
                        // Refresh shop channel if it exists
                        await refreshShopChannel(guildId, sql, guild);
                        break;
                    }
                case "edit":
                    {
                        const itemSelection = options.getString("item");
                        const itemId = parseInt(itemSelection);
                        
                        // Validate that itemId is a valid number
                        if (isNaN(itemId) || itemId <= 0) {
                            await interaction.reply({ content: "❌ Invalid item selection. Please select an item from the dropdown list.", flags: 64 });
                            return;
                        }
                        
                        const name = options.getString("name");
                        const price = options.getNumber("price");
                        const stock = options.getInteger("stock");
                        const description = options.getString("description");
                        const type = options.getString("type");
                        const level = options.getInteger("level");
                        const duration = options.getInteger("duration");
                        const mincastle = options.getInteger("mincastle");

                        // Get current item data
                        const currentItem = await sql.getShopItem(itemId, guildId);
                        if (!currentItem) {
                            await interaction.reply({ content: "❌ Item not found.", flags: 64 });
                            return;
                        }

                        // Update with new values or keep current ones
                        const updatedName = name || currentItem.name;
                        const updatedPrice = price !== null ? price : currentItem.price;
                        const updatedStock = stock !== null ? stock : currentItem.stock;
                        // Allow clearing description with special "CLEAR" value
                        const updatedDescription = description !== null ? (description === "CLEAR" ? null : description) : currentItem.description;
                        const updatedType = type !== null ? type : currentItem.type;
                        const updatedLevel = level !== null ? level : currentItem.level;
                        const updatedDuration = duration !== null ? duration : currentItem.duration;
                        // mincastle: allow explicit 0 to clear
                        let updatedMincastle;
                        if (mincastle !== null) {
                            updatedMincastle = mincastle === 0 ? null : mincastle; // store NULL when clearing
                        } else {
                            updatedMincastle = currentItem.mincastle;
                        }

                        // Validate that dsa and cmine items have required level and duration
                        if (updatedType && (updatedType.toLowerCase() === 'dsa' || updatedType.toLowerCase() === 'cmine')) {
                            if (!updatedLevel) {
                                await interaction.reply({ content: `❌ Items with type "${updatedType.toUpperCase()}" must have a level specified.`, flags: 64 });
                                return;
                            }
                            if (!updatedDuration) {
                                await interaction.reply({ content: `❌ Items with type "${updatedType.toUpperCase()}" must have a duration specified.`, flags: 64 });
                                return;
                            }
                        }

                        await sql.updateShopItem(itemId, guildId, updatedName, updatedPrice, updatedStock, updatedDescription, updatedType, updatedLevel, updatedDuration, updatedMincastle);
                        
                        let responseMessage = `✅ Item "${updatedName}" (ID: ${itemId}) updated successfully.`;
                        if (description === "CLEAR") {
                            responseMessage += " Description has been removed.";
                        }
                        
                        await interaction.reply({ content: responseMessage, ...ephemeral });
                        
                        // Log the action
                        await logShopAction(guildId, sql, guild, 'item_edited', user, {
                            id: itemId,
                            name: updatedName,
                            price: updatedPrice,
                            stock: updatedStock,
                            description: updatedDescription,
                            type: updatedType,
                            level: updatedLevel,
                            duration: updatedDuration,
                            mincastle: updatedMincastle
                        });
                        
                        // Refresh shop channel if it exists
                        await refreshShopChannel(guildId, sql, guild);
                        break;
                    }
                case "remove":
                    {
                        const itemSelection = options.getString("item");
                        const itemId = parseInt(itemSelection);
                        
                        // Validate that itemId is a valid number
                        if (isNaN(itemId) || itemId <= 0) {
                            await interaction.reply({ content: "❌ Invalid item selection. Please select an item from the dropdown list.", flags: 64 });
                            return;
                        }
                        
                        // Check if item exists
                        const item = await sql.getShopItem(itemId, guildId);
                        if (!item) {
                            await interaction.reply({ content: "❌ Item not found.", flags: 64 });
                            return;
                        }

                        await sql.deleteShopItem(itemId, guildId);
                        await interaction.reply({ content: `✅ Item "${item.name}" (ID: ${itemId}) removed from shop.`, ...ephemeral });
                        
                        // Log the action
                        await logShopAction(guildId, sql, guild, 'item_removed', user, {
                            id: itemId,
                            name: item.name,
                            price: item.price,
                            stock: item.stock
                        });
                        
                        // Refresh shop channel if it exists
                        await refreshShopChannel(guildId, sql, guild);
                        break;
                    }
                case "list":
                    {
                        const items = await sql.getShopItems(guildId);
                        
                        if (!items || items.length === 0) {
                            await interaction.reply({ content: "❌ No items in the shop.", ...ephemeral });
                            return;
                        }

                        // Get conversion rates
                        const pointPrice = await sql.getGuildPointPrice(guildId);
                        const landPoint = await sql.getGuildLandPoint(guildId);
                        const rallyPoint = await sql.getGuildRallyPoint(guildId);

                        // Create conversion rates embed
                        const ratesEmbed = new EmbedBuilder()
                            .setColor(0x00AE86)
                            .setTitle("💱 Point Conversion Rates")
                            .setTimestamp();

                        let ratesDescription = "";
                        
                        // DST to Points conversion
                        if (pointPrice && pointPrice > 0) {
                            const pointsPerDST = 1 / parseFloat(pointPrice);
                            // Format to remove unnecessary trailing zeros
                            const formattedPoints = Number(pointsPerDST.toFixed(2)).toString();
                            ratesDescription += `🪙 **1 DST** = **${formattedPoints} ${currencyEmoji}**\n`;
                        } else {
                            ratesDescription += `🪙 **DST to Points:** *Not configured*\n`;
                        }

                        // Development Points to Points conversion
                        if (landPoint && landPoint > 0) {
                            const landPointNum = parseFloat(landPoint);
                            // Format to remove unnecessary trailing zeros
                            const formattedLandPoints = Number(landPointNum.toFixed(2)).toString();
                            ratesDescription += `💎 **1 Development Point** = **${formattedLandPoints} ${currencyEmoji}**\n`;
                        } else {
                            ratesDescription += `💎 **Development Points:** *Not configured*\n`;
                        }

                        // Rally Points conversion
                        if (rallyPoint && rallyPoint > 0) {
                            const rallyPointNum = parseFloat(rallyPoint);
                            // Format to remove unnecessary trailing zeros
                            const formattedRallyPoints = Number(rallyPointNum.toFixed(2)).toString();
                            ratesDescription += `⚔️ **1 Rally** = **${formattedRallyPoints} ${currencyEmoji}**\n`;
                        } else {
                            ratesDescription += `⚔️ **Rally Points:** *Not configured*\n`;
                        }

                        ratesEmbed.setDescription(ratesDescription);

                        // Create shop items embed
                        const shopEmbed = new EmbedBuilder()
                            .setColor(0xFFD700)
                            .setTitle(`🛒 ${guildName} Shop Items`)
                            .setDescription("List of all shop items:")
                            .setTimestamp();

                        let description = "";
                        for (const item of items) {
                            description += `**ID:** ${item.id} | **${item.name}** - ${formatNumber(item.price)} ${currencyEmoji}\n`;
                            description += `Stock: ${item.stock}`;
                            if (item.type) description += ` | Type: ${item.type}`;
                            if (item.level) description += ` | Level: ${item.level}`;
                            if (item.duration) description += ` | Duration: ${item.duration} weeks`;
                            if (item.mincastle) description += ` | Min Castle: ${item.mincastle}`;
                            description += `\n${item.description || 'No description'}\n\n`;
                        }

                        shopEmbed.setDescription(description);
                        
                        // Send both embeds
                        await interaction.reply({ embeds: [ratesEmbed, shopEmbed], ...ephemeral });
                        break;
                    }
                case "refresh":
                    {
                        const success = await refreshShopChannel(guildId, sql, guild);
                        if (success) {
                            await interaction.reply({ content: "✅ Shop channel refreshed successfully.", ...ephemeral });
                            
                            // Log the action
                            await logShopAction(guildId, sql, guild, 'shop_refreshed', user);
                        } else {
                            await interaction.reply({ content: "❌ Shop channel not found. Create channels first using `/guild create-channels`.", flags: 64 });
                        }
                        break;
                    }
                case "history":
                    {
                        const limit = options.getInteger("limit") || 20;
                        const history = await sql.getShopPurchaseHistory(guildId, limit);
                        
                        if (!history || history.length === 0) {
                            await interaction.reply({ content: "❌ No purchase history found.", ...ephemeral });
                            return;
                        }

                        const embed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(`📊 Shop Purchase History`)
                            .setDescription(`Last ${Math.min(limit, history.length)} purchases:`)
                            .setTimestamp();

                        let description = "";
                        for (const purchase of history) {
                            const date = new Date(purchase.created_at);
                            const formattedDate = date.toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                            }) + ' ' + date.toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                            });
                            description += `**${purchase.item_name}** x${purchase.quantity} - ${formatNumber(purchase.total_price)} ${currencyEmoji}\n`;
                            description += `User: <@${purchase.user_id}> | Date: ${formattedDate}\n\n`;
                        }

                        embed.setDescription(description);
                        await interaction.reply({ embeds: [embed], ...ephemeral });
                        break;
                    }
                case "balance":
                    {
                        const targetUser = options.getUser("user");
                        
                        // If checking another user's balance, verify admin permissions
                        if (targetUser && targetUser.id !== user.id) {
                            if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                                await interaction.reply({ content: "❌ You need administrator permissions to check other users' balances.", flags: 64 });
                                return;
                            }
                        }
                        
                        const checkUserId = targetUser ? targetUser.id : user.id;
                        const checkUsername = targetUser ? targetUser.username : user.username;
                        const balance = await sql.getUserPointsBalance(checkUserId, guildId);
                        
                        const embed = new EmbedBuilder()
                            .setColor(0xFFD700)
                            .setTitle("💰 Points Balance")
                            .setDescription(`${targetUser ? `**${checkUsername}**` : 'You'} currently ${targetUser ? 'has' : 'have'} **${formatNumber(balance)} ${currencyEmoji}**`)
                            .setTimestamp();
                            
                        if (targetUser) {
                            embed.setThumbnail(targetUser.displayAvatarURL());
                        } else {
                            embed.setThumbnail(user.displayAvatarURL());
                        }
                        
                        await interaction.reply({ embeds: [embed], ...ephemeral });
                        break;
                    }
                case "addpoints":
                    {
                        const targetUser = options.getUser("user");
                        const amount = options.getNumber("amount");
                        const reason = options.getString("reason") || "admin change"; // Default to valid enum value

                        // Validate amount (allow both positive and negative values, but not zero)
                        if (amount === 0) {
                            await interaction.reply({ content: "❌ Amount cannot be zero. Use positive values to add points or negative values to remove points.", flags: 64 });
                            return;
                        }

                        // Add or remove points from the user
                        await sql.addUserPoints(targetUser.id, guildId, amount, reason);

                        // Log the points change
                        await sql.logPointsChange(guildId, targetUser.id, amount, `${amount > 0 ? 'Added' : 'Removed'} by ${user.username} via shop addpoints command`, 'admin');

                        // Send confirmation message
                        const isAdding = amount > 0;
                        const absAmount = Math.abs(amount);
                        const embed = new EmbedBuilder()
                            .setColor(isAdding ? 0x00FF00 : 0xFF6B6B)
                            .setTitle(isAdding ? "✅ Points Added" : "✅ Points Removed")
                            .setDescription(`Successfully ${isAdding ? 'added' : 'removed'} **${formatNumber(absAmount)} ${currencyEmoji}** ${isAdding ? 'to' : 'from'} <@${targetUser.id}>.\n\n**Reason:** ${reason}`)
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ...ephemeral });
                        
                        // Log the action
                        await logShopAction(guildId, sql, guild, 'points_added', user, {
                            targetUserId: targetUser.id,
                            amount: amount,
                            reason: reason
                        });
                        break;
                    }
                case "purchase-points":
                    {
                        const txHash = options.getString("txhash");
                        
                        // Validate transaction hash format
                        if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
                            await interaction.reply({ content: "❌ Invalid transaction hash format. Transaction hash must be 66 characters long and start with '0x'.", flags: 64 });
                            return;
                        }

                        await interaction.deferReply({ flags: 64 }); // Private reply while processing

                        try {
                            // Check if this transaction was already processed for this guild
                            const alreadyProcessed = await sql.isDSTTransactionProcessed(txHash, guildId);
                            if (alreadyProcessed) {
                                await interaction.editReply({ content: "❌ This transaction has already been processed for points in this guild." });
                                return;
                            }

                            // Get guild point price and wallet
                            const pointPrice = await sql.getGuildPointPrice(guildId);
                            const guildWallet = await sql.getGuildWallet(guildId);
                            
                            if (!pointPrice || pointPrice <= 0) {
                                await interaction.editReply({ content: "❌ No point price is configured for this guild. Contact an administrator." });
                                return;
                            }
                            
                            if (!guildWallet) {
                                await interaction.editReply({ content: "❌ No guild wallet is configured for this guild. Contact an administrator." });
                                return;
                            }

                            // Verify the DST transaction
                            const Api = require('../../../general/api.js');
                            const api = new Api(sql);
                            const DST_CONTRACT = '0x3b7e1ce09afe2bb3a23919afb65a38e627cfbe97';
                            
                            // Get transaction receipt
                            const requestBody = {
                                jsonrpc: '2.0',
                                method: 'eth_getTransactionReceipt',
                                params: [txHash],
                                id: 1
                            };
                            
                            const receipt = await api.request('https://polygon-rpc.com', requestBody, {
                                'Content-Type': 'application/json'
                            });

                            if (!receipt.data.result || receipt.data.result.status !== '0x1') {
                                await interaction.editReply({ content: "❌ Transaction not found or failed" });
                                return;
                            }

                            // Check if transaction is to DST contract
                            if (receipt.data.result.to.toLowerCase() !== DST_CONTRACT.toLowerCase()) {
                                await interaction.editReply({ content: "❌ Transaction is not a DST token transfer" });
                                return;
                            }

                            // Parse transaction logs for Transfer events
                            const transferEvent = receipt.data.result.logs.find(log => 
                                log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && // Transfer event signature
                                log.address.toLowerCase() === DST_CONTRACT.toLowerCase()
                            );

                            if (!transferEvent) {
                                await interaction.editReply({ content: "❌ No DST transfer found in transaction" });
                                return;
                            }

                            // Decode transfer event
                            const toAddress = '0x' + transferEvent.topics[2].slice(26); // Remove padding
                            const amount = BigInt(transferEvent.data);

                            // Check if transfer is to guild wallet
                            if (toAddress.toLowerCase() !== guildWallet.toLowerCase()) {
                                await interaction.editReply({ content: "❌ DST transfer is not to the guild wallet" });
                                return;
                            }

                            // Convert amount from wei to DST (18 decimals)
                            const dstAmount = parseFloat(amount.toString()) / Math.pow(10, 18);
                            const fromAddress = '0x' + transferEvent.topics[1].slice(26); // Remove padding

                            // Calculate points to award
                            const pointsToAward = Math.floor(dstAmount / pointPrice);
                            
                            // Award points to the user (even if 0 points)
                            if (pointsToAward > 0) {
                                await sql.addUserPoints(
                                    user.id, 
                                    guildId, 
                                    pointsToAward, 
                                    `DST payment`
                                );
                            }

                            // Log the transaction (always log, even for 0 points)
                            await sql.logDSTTransaction(txHash, guildId, fromAddress, dstAmount, pointsToAward, `Manual verification by ${user.username} (${user.id})`);

                            // Send success message
                            const embed = new EmbedBuilder()
                                .setColor(pointsToAward > 0 ? 0x00FF00 : 0xFFD700)
                                .setTitle(pointsToAward > 0 ? '✅ DST Payment Verified' : '✅ DST Payment Verified (No Points)')
                                .setDescription(
                                    pointsToAward > 0 
                                        ? `Successfully verified your DST payment and awarded **${formatNumber(pointsToAward)} ${currencyEmoji}**!`
                                        : `Successfully verified your DST payment. However, the amount (${dstAmount} DST) is too small to award points. Minimum required: ${pointPrice} DST per point.`
                                )
                                .addFields(
                                    {
                                        name: '💎 DST Amount',
                                        value: `${dstAmount} DST`,
                                        inline: true
                                    },
                                    {
                                        name: '⭐ Points Awarded',
                                        value: pointsToAward > 0 ? `${formatNumber(pointsToAward)} ${currencyEmoji}` : `0 ${currencyEmoji}`,
                                        inline: true
                                    },
                                    {
                                        name: '🔗 Transaction Hash',
                                        value: `[${txHash.slice(0, 10)}...${txHash.slice(-8)}](https://polygonscan.com/tx/${txHash})`,
                                        inline: false
                                    }
                                )
                                .setTimestamp();

                            await interaction.editReply({ embeds: [embed] });

                            // Log the action
                            await logShopAction(guildId, sql, guild, 'payment_verified', user, {
                                txHash: txHash,
                                dstAmount: dstAmount,
                                pointsAwarded: pointsToAward
                            });

                        } catch (error) {
                            console.error('Error verifying DST payment:', error);
                            await interaction.editReply({ content: "❌ Error verifying transaction. Please ensure the transaction hash is correct and try again." });
                        }
                        break;
                    }
                case "licenses":
                    {
                        // Defer reply immediately to prevent timeout
                        await interaction.deferReply(ephemeral);
                        const targetUser = options.getUser("user");
                        const kingdomOption = options.getString("kingdom");
                        let derivedUserId = null;
                        let derivedUsername = null;
                        let fromKingdom = false;

                        if (kingdomOption) {
                            console.log('Kingdom option provided:', kingdomOption);
                            const discordIdFound = await sql.getVerifiedDiscordId(kingdomOption, guildId);
                            console.log('Discord ID found for kingdom:', discordIdFound);
                            if (discordIdFound && Array.isArray(discordIdFound) && discordIdFound.length > 0 && discordIdFound[0].discordId) {
                                derivedUserId = discordIdFound[0].discordId;
                                console.log('Derived user ID from kingdom:', derivedUserId);
                                fromKingdom = true;
                            } else {
                                await interaction.editReply({ content: `❌ Could not resolve a verified Discord user for kingdom ID ${kingdomOption}.` });
                                return;
                            }
                        }

                        if (!fromKingdom && targetUser && targetUser.id !== user.id) {
                            const memberPerms = interaction.member.permissions;
                            const hasKickApproveReject = memberPerms.has(PermissionFlagsBits.KickMembers)
                            const hasBan = memberPerms.has(PermissionFlagsBits.BanMembers);
                            if (!(hasKickApproveReject || hasBan)) {
                                await interaction.editReply({ content: "❌ You need kick/approve/reject members permissions or ban members permission to check other users' licenses." });
                                return;
                            }
                        }

                        // console.log(`userid: ${derivedUserId}`);

                        const checkUserId = derivedUserId || (targetUser ? targetUser.id : user.id);
                        const checkUsername = derivedUsername || (targetUser ? targetUser.username : user.username);
                        
                        // Get user's verified kingdoms for this guild using helper
                        const verifiedKingdoms = await sql.checkVerifiedKingdoms(checkUserId, guildId);
                        
                        if (!verifiedKingdoms || verifiedKingdoms.length === 0) {
                            const embed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle("📜 Whitelist Licenses")
                                .setTimestamp();
                                
                            if (fromKingdom) {
                                embed.setDescription(`Licenses for kingdoms owned by <@${checkUserId}> (${checkUsername || 'Unknown User'})`);
                            } else if (targetUser) {
                                embed.setThumbnail(targetUser.displayAvatarURL());
                                embed.setDescription(`**${checkUsername}**'s available whitelist licenses:`);
                            } else {
                                embed.setThumbnail(user.displayAvatarURL());
                                embed.setDescription("Your available whitelist licenses:");
                            }
                            
                            embed.addFields({
                                name: "No Verified Kingdoms",
                                value: targetUser ? 
                                    `${checkUsername} has no verified kingdoms in this guild.` :
                                    "You have no verified kingdoms in this guild.\n\nUse `/verify` to verify your kingdoms first!",
                                inline: false
                            });
                            await interaction.editReply({ embeds: [embed] });
                            return;
                        }
                        
                        // Get continent for this guild
                        const continentArr = await sql.getGuildContinents(guildId);
                        const continent = continentArr && continentArr.length > 0 ? continentArr[0].continent : null;
                        if (!continent) {
                            await interaction.editReply({ content: "No continent linked to this guild." });
                            return;
                        }
                        
                        // Get all whitelist entries for this guild/continent (same query as whitelist command)
                        const allWhitelistKingdoms = await sql.getWhitelist(guildId, continent);
                        
                        // Filter to only include the user's verified kingdoms
                        const verifiedKingdomIds = new Set(verifiedKingdoms.map(k => k.kingdomId));
                        const licensedKingdoms = allWhitelistKingdoms.filter(kingdom => {
                            return verifiedKingdomIds.has(kingdom.kingdomid) && (
                                (kingdom.dsa > 0 || kingdom.cmine > 0) ||
                                kingdom.expiry === null
                            );
                        });

                        console.log(`Found ${licensedKingdoms.length} licensed kingdoms for user ${checkUserId}: `, licensedKingdoms.map(k => ({ id: k.kingdomid, name: k.name, dsa: k.dsa, cmine: k.cmine, dsa_expiry: k.dsa_expiry, cmine_expiry: k.cmine_expiry })));
                        
                        // Group licenses by kingdom and find the highest valid level for each type
                        const kingdomLicenses = {};
                        const currentDate = new Date();
                        
                        for (const kingdom of licensedKingdoms) {
                            const kingdomId = kingdom.kingdomid;
                            if (!kingdomLicenses[kingdomId]) {
                                kingdomLicenses[kingdomId] = {
                                    name: kingdom.name,
                                    kingdomid: kingdom.kingdomid,
                                    dsa: { level: 0, expiry: null },
                                    cmine: { level: 0, expiry: null }
                                };
                            }

                            // Check if this license record is still valid
                            const isExpired = (kingdom.dsa_expiry && new Date(kingdom.dsa_expiry) < currentDate) || 
                                            (kingdom.cmine_expiry && new Date(kingdom.cmine_expiry) < currentDate);
                            if (isExpired) continue; // Skip expired licenses

                            // For DSA: if this record grants a higher level, update both level and expiry
                            if (kingdom.dsa > kingdomLicenses[kingdomId].dsa.level) {
                                kingdomLicenses[kingdomId].dsa.level = kingdom.dsa;
                                kingdomLicenses[kingdomId].dsa.expiry = kingdom.dsa_expiry;
                            } else if (kingdom.dsa === kingdomLicenses[kingdomId].dsa.level && kingdom.dsa > 0) {
                                // If same level, prefer permanent (expiry=null), otherwise prefer latest expiry
                                const prevExpiry = kingdomLicenses[kingdomId].dsa.expiry;
                                if (prevExpiry !== null && kingdom.dsa_expiry === null) {
                                    kingdomLicenses[kingdomId].dsa.expiry = null;
                                } else if (prevExpiry !== null && kingdom.dsa_expiry !== null) {
                                    // Pick the latest expiry
                                    if (new Date(kingdom.dsa_expiry) > new Date(prevExpiry)) {
                                        kingdomLicenses[kingdomId].dsa.expiry = kingdom.dsa_expiry;
                                    }
                                }
                            }

                            // For C-Mine: if this record grants a higher level, update both level and expiry
                            if (kingdom.cmine > kingdomLicenses[kingdomId].cmine.level) {
                                kingdomLicenses[kingdomId].cmine.level = kingdom.cmine;
                                kingdomLicenses[kingdomId].cmine.expiry = kingdom.cmine_expiry;
                            } else if (kingdom.cmine === kingdomLicenses[kingdomId].cmine.level && kingdom.cmine > 0) {
                                // If same level, prefer permanent (expiry=null), otherwise prefer latest expiry
                                const prevExpiry = kingdomLicenses[kingdomId].cmine.expiry;
                                if (prevExpiry !== null && kingdom.cmine_expiry === null) {
                                    kingdomLicenses[kingdomId].cmine.expiry = null;
                                } else if (prevExpiry !== null && kingdom.cmine_expiry !== null) {
                                    // Pick the latest expiry
                                    if (new Date(kingdom.cmine_expiry) > new Date(prevExpiry)) {
                                        kingdomLicenses[kingdomId].cmine.expiry = kingdom.cmine_expiry;
                                    }
                                }
                            }
                        }
                        
                        // Convert back to array for display
                        const aggregatedKingdoms = Object.values(kingdomLicenses).filter(kingdom => 
                            kingdom.dsa.level > 0 || kingdom.cmine.level > 0
                        );
                        
                        // Debug logging for MIYAVI
                        const miyaviKingdom = licensedKingdoms.find(k => k.name === 'MIYAVI');
                        if (miyaviKingdom) {
                            console.log(`Debug MIYAVI whitelist data:`, {
                                dsa: miyaviKingdom.dsa,
                                cmine: miyaviKingdom.cmine,
                                expiry: miyaviKingdom.expiry,
                                license_count: miyaviKingdom.license_count
                            });
                        }
                        
                        const embed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle("📜 Whitelist Licenses")
                            .setTimestamp();
                            
                        if (targetUser) {
                            embed.setThumbnail(targetUser.displayAvatarURL());
                            embed.setDescription(`**${checkUsername}**'s available whitelist licenses:`);
                        } else {
                            embed.setThumbnail(user.displayAvatarURL());
                            embed.setDescription("Your available whitelist licenses:");
                        }
                        
                        if (!aggregatedKingdoms || aggregatedKingdoms.length === 0) {
                            embed.addFields({
                                name: "No Licenses Found",
                                value: targetUser ? 
                                    `${checkUsername} has no active whitelist licenses in this guild.` :
                                    "You have no active whitelist licenses in this guild.\n\nPurchase DSA or C-Mine licenses from the shop to get started!",
                                inline: false
                            });
                            await interaction.editReply({ embeds: [embed] });
                        } else {
                            // Create paginated embeds to handle large amounts of license data
                            const embeds = [];
                            const maxFieldLength = 1024; // Discord's field value limit
                            const maxEmbedsPerMessage = 10; // Discord's embed limit per message
                            
                            let currentDescription = "";
                            let currentEmbed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle("📜 Whitelist Licenses")
                                .setTimestamp();
                                
                            if (fromKingdom) {
                                currentEmbed.setDescription(`Licenses for kingdoms owned by <@${checkUserId}> (${checkUsername || 'Unknown User'})`);
                            } else if (targetUser) {
                                currentEmbed.setThumbnail(targetUser.displayAvatarURL());
                                currentEmbed.setDescription(`**${checkUsername}**'s available whitelist licenses:`);
                            } else {
                                currentEmbed.setThumbnail(user.displayAvatarURL());
                                currentEmbed.setDescription("Your available whitelist licenses:");
                            }
                            
                            for (let i = 0; i < aggregatedKingdoms.length; i++) {
                                const kingdom = aggregatedKingdoms[i];
                                
                                const licenses = [];
                                
                                // Add DSA license info if exists
                                if (kingdom.dsa.level > 0) {
                                    licenses.push(`DSA Level ${kingdom.dsa.level}`);
                                }
                                
                                // Add C-Mine license info if exists
                                if (kingdom.cmine.level > 0) {
                                    licenses.push(`C-Mine Level ${kingdom.cmine.level}`);
                                }
                                
                                // Use kingdom name or kingdomid as fallback
                                const kingdomName = kingdom.name || kingdom.kingdomid;
                                let kingdomInfo = `**${kingdomName}** (ID: ${kingdom.kingdomid})\n`;
                                kingdomInfo += `└ **Licenses:** ${licenses.join(', ')}\n`;
                                
                                // Show expiry information - handle different expiry dates properly using the separate expiry fields
                                if (kingdom.dsa.level > 0 && kingdom.cmine.level > 0) {
                                    // Both licenses exist - show separate expiry dates
                                    kingdomInfo += `└ **DSA Expires:** ${kingdom.dsa.expiry ? `<t:${Math.floor(new Date(kingdom.dsa.expiry).getTime() / 1000)}:F> (<t:${Math.floor(new Date(kingdom.dsa.expiry).getTime() / 1000)}:R>)` : 'Never (Permanent)'}\n`;
                                    kingdomInfo += `└ **C-Mine Expires:** ${kingdom.cmine.expiry ? `<t:${Math.floor(new Date(kingdom.cmine.expiry).getTime() / 1000)}:F> (<t:${Math.floor(new Date(kingdom.cmine.expiry).getTime() / 1000)}:R>)` : 'Never (Permanent)'}\n`;
                                } else if (kingdom.dsa.level > 0) {
                                    // Only DSA license
                                    kingdomInfo += `└ **Expires:** ${kingdom.dsa.expiry ? `<t:${Math.floor(new Date(kingdom.dsa.expiry).getTime() / 1000)}:F> (<t:${Math.floor(new Date(kingdom.dsa.expiry).getTime() / 1000)}:R>)` : 'Never (Permanent)'}\n`;
                                } else if (kingdom.cmine.level > 0) {
                                    // Only C-Mine license
                                    kingdomInfo += `└ **Expires:** ${kingdom.cmine.expiry ? `<t:${Math.floor(new Date(kingdom.cmine.expiry).getTime() / 1000)}:F> (<t:${Math.floor(new Date(kingdom.cmine.expiry).getTime() / 1000)}:R>)` : 'Never (Permanent)'}\n`;
                                }
                                kingdomInfo += "\n";
                                
                                // Check if adding this kingdom would exceed the field limit
                                if (currentDescription.length + kingdomInfo.length > maxFieldLength) {
                                    // Add current field to embed and start a new one
                                    if (currentDescription.length > 0) {
                                        const fieldName = embeds.length === 0 
                                            ? `Active Licenses (${aggregatedKingdoms.length} kingdom${aggregatedKingdoms.length === 1 ? '' : 's'})`
                                            : "Continued...";
                                        currentEmbed.addFields({
                                            name: fieldName,
                                            value: currentDescription,
                                            inline: false
                                        });
                                        embeds.push(currentEmbed);
                                    }
                                    
                                    // Start new embed if we've reached the embed limit
                                    currentEmbed = new EmbedBuilder()
                                        .setColor(0x00FF00)
                                        .setTitle(`📜 Whitelist Licenses (Page ${embeds.length + 1})`)
                                        .setTimestamp();
                                    
                                    currentDescription = kingdomInfo;
                                } else {
                                    currentDescription += kingdomInfo;
                                }
                            }
                            
                            // Add the final field and embed
                            if (currentDescription.length > 0) {
                                const fieldName = embeds.length === 0 
                                    ? `Active Licenses (${aggregatedKingdoms.length} kingdom${aggregatedKingdoms.length === 1 ? '' : 's'})`
                                    : "Continued...";
                                currentEmbed.addFields({
                                    name: fieldName,
                                    value: currentDescription,
                                    inline: false
                                });
                                embeds.push(currentEmbed);
                            }
                            
                            // Limit to max embeds per message (Discord limit is 10)
                            const embedsToSend = embeds.slice(0, maxEmbedsPerMessage);
                            
                            await interaction.editReply({ embeds: embedsToSend });
                            
                            // If there are more embeds, send them in follow-up messages
                            for (let i = maxEmbedsPerMessage; i < embeds.length; i += maxEmbedsPerMessage) {
                                const nextBatch = embeds.slice(i, i + maxEmbedsPerMessage);
                                await interaction.followUp({ embeds: nextBatch, ...ephemeral });
                            }
                        }
                        break;
                    }
                default:
                    await interaction.reply({ content: "Unknown subcommand", flags: 64 });
                    break;
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "There was an error while managing the shop!", flags: 64 });
        }
    },
    async handlePurchase(interaction) {
        const sql = module.exports.sql;
        const { customId, guildId, user } = interaction;
        const guild = interaction.guild;
        const guildName = interaction.guild.name;
        
        try {
            // Get currency emoji for this guild
            const currencyEmoji = await getCurrencyEmoji(guildId, sql);
            
            // Extract item ID from custom ID
            const itemId = parseInt(customId.split("_")[2]);
            
            // Validate that itemId is a valid number
            if (isNaN(itemId) || itemId <= 0) {
                await interaction.reply({ content: "❌ Invalid item ID. Please refresh the shop and try again.", flags: 64 });
                return;
            }
            
            // Get item details
            const item = await sql.getShopItem(itemId, guildId);
            if (!item) {
                await interaction.reply({ content: "❌ Item not found.", flags: 64 });
                return;
            }

            // mincastle requirement will be enforced on the specific selected kingdom (handled later for whitelist items)

            // Check if item is in stock
            if (item.stock <= 0) {
                await interaction.reply({ content: "❌ This item is out of stock.", flags: 64 });
                return;
            }

            // Check if user has enough points
            const userBalance = await sql.getUserPointsBalance(user.id, guildId);
            const itemPrice = Math.floor(item.price);
            const userBalanceInt = Math.floor(userBalance);
            
            console.log(`Debug: User balance: ${userBalance} (${userBalanceInt}), Item price: ${item.price} (${itemPrice})`);
            
            if (userBalanceInt < itemPrice) {
                await interaction.reply({ 
                    content: `❌ Insufficient funds! You have ${formatNumber(userBalanceInt)} ${currencyEmoji} but need ${formatNumber(itemPrice)} ${currencyEmoji} to purchase this item.`, 
                    flags: 64 
                });
                return;
            }

            // Check if this item has dsa or cmine type - if so, need to select kingdom for whitelist
            if (item.type && (item.type.toLowerCase() === 'dsa' || item.type.toLowerCase() === 'cmine')) {
                await this.handleWhitelistPurchase(interaction, item, currencyEmoji, sql);
                return;
            }

            // Regular purchase flow for items without whitelist types
            await this.completeRegularPurchase(interaction, item, currencyEmoji, sql);

        } catch (error) {
            console.error('Error handling shop purchase:', error);
            await interaction.reply({ content: "There was an error processing your purchase!", flags: 64 });
        }
    },

    async handleWhitelistPurchase(interaction, item, currencyEmoji, sql) {
        const { guildId, user } = interaction;
        const guild = interaction.guild;

        // Get user's verified kingdoms
        const kingdoms = await sql.checkVerifiedKingdoms(user.id, guildId);
        if (!kingdoms || kingdoms.length === 0) {
            await interaction.reply({ 
                content: '❌ No verified kingdoms found. You need to verify a kingdom first to purchase whitelist items. Use `/verify` to verify your kingdom.', 
                flags: 64 
            });
            return;
        }

        if (kingdoms.length === 1) {
            // Only one kingdom, proceed directly
            // Enforce mincastle on this single kingdom (if required)
            if (item.mincastle) {
                const levelRows = await sql.getKingdomLevel(kingdoms[0].kingdomId);
                let level = null;
                if (Array.isArray(levelRows)) {
                    if (levelRows.length > 0 && levelRows[0].level !== undefined) level = parseInt(levelRows[0].level);
                } else if (levelRows && levelRows.level !== undefined) {
                    level = parseInt(levelRows.level);
                }
                if (level === null || level < item.mincastle) {
                    await interaction.reply({ content: `❌ Kingdom **${kingdoms[0].kingdomName}** does not meet the required castle level ${item.mincastle}+ (current: ${level ?? 'unknown'}).`, flags: 64 });
                    return;
                }
            }
            await this.applyWhitelistPurchase(interaction, item, kingdoms[0].kingdomId, kingdoms[0].kingdomName, currencyEmoji, sql);
        } else {
            // Multiple kingdoms, show selection menu
            // Deduplicate by kingdomId to avoid Discord duplicate option value error
            const uniqueMap = new Map();
            for (const k of kingdoms) {
                const idStr = k.kingdomId.toString();
                if (!uniqueMap.has(idStr)) {
                    uniqueMap.set(idStr, k);
                }
            }
            const uniqueKingdoms = Array.from(uniqueMap.values());

            // If after de-duplication only one kingdom remains, proceed directly
            if (uniqueKingdoms.length === 1) {
                await this.applyWhitelistPurchase(interaction, item, uniqueKingdoms[0].kingdomId, uniqueKingdoms[0].kingdomName, currencyEmoji, sql);
                return;
            }

            // Enforce Discord max 25 options
            let truncated = false;
            let displayKingdoms = uniqueKingdoms;
            if (uniqueKingdoms.length > 25) {
                displayKingdoms = uniqueKingdoms.slice(0, 25);
                truncated = true;
            }

            const kingdomOptions = displayKingdoms.map(k => {
                let label = k.kingdomName || `Kingdom ${k.kingdomId}`;
                if (label.length > 100) label = label.slice(0, 97) + '...'; // Discord label length limit safeguard
                return {
                    label,
                    value: k.kingdomId.toString(),
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_kingdom_shop_${user.id}_${item.id}`)
                .setPlaceholder('Select a kingdom for the whitelist')
                .addOptions(kingdomOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            let contentMsg = `Please select which kingdom should receive the ${item.type.toUpperCase()} whitelist for **${item.name}**:`;
            if (truncated) {
                contentMsg += `\n⚠️ Showing first 25 of ${uniqueKingdoms.length} kingdoms.`;
            }

            await interaction.reply({ 
                content: contentMsg, 
                components: [row], 
                flags: 64 
            });

            // Set up collector for kingdom selection
            const filter = i => i.customId.startsWith(`select_kingdom_shop_${user.id}_${item.id}`) && i.user.id === user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                const selectedKingdomId = i.values[0];
                const selectedKingdom = uniqueKingdoms.find(k => k.kingdomId.toString() === selectedKingdomId);

                if (selectedKingdom) {
                    // Enforce mincastle on the specifically selected kingdom
                    if (item.mincastle) {
                        const levelRows = await sql.getKingdomLevel(selectedKingdom.kingdomId);
                        let level = null;
                        if (Array.isArray(levelRows)) {
                            if (levelRows.length > 0 && levelRows[0].level !== undefined) level = parseInt(levelRows[0].level);
                        } else if (levelRows && levelRows.level !== undefined) {
                            level = parseInt(levelRows.level);
                        }
                        if (level === null || level < item.mincastle) {
                            await i.reply({ content: `❌ Kingdom **${selectedKingdom.kingdomName}** does not meet the required castle level ${item.mincastle}+ (current: ${level ?? 'unknown'}).`, flags: 64 });
                            collector.stop();
                            return;
                        }
                    }
                    await this.applyWhitelistPurchase(i, item, selectedKingdom.kingdomId, selectedKingdom.kingdomName, currencyEmoji, sql);
                } else {
                    await i.reply({ content: '❌ Invalid selection. Please try again.', flags: 64 });
                }

                collector.stop();
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.followUp({ content: '⏰ No selection was made. Purchase cancelled.', flags: 64 });
                }
            });
        }
    },

    async applyWhitelistPurchase(interaction, item, kingdomId, kingdomName, currencyEmoji, sql) {
        const { guildId, user } = interaction;
        const guild = interaction.guild;

        try {
            // Get continent for this guild (needed for whitelist)
            const continentArr = await sql.getGuildContinents(guildId);
            const continent = continentArr && continentArr.length > 0 ? continentArr[0].continent : null;
            
            if (!continent) {
                await interaction.reply({ content: "❌ No continent linked to this guild. Cannot apply whitelist.", flags: 64 });
                return;
            }

            // Attempt to purchase (this will decrease stock if successful)
            const purchaseSuccess = await sql.purchaseShopItem(item.id, guildId, 1);
            
            if (!purchaseSuccess) {
                await interaction.reply({ content: "❌ Purchase failed. Item may be out of stock.", flags: 64 });
                return;
            }

            // Deduct points from user
            await sql.deductUserPoints(user.id, guildId, item.price, 'shop purchase');

            // Log the purchase
            await sql.logShopPurchase(guildId, user.id, item.id, 1, item.price);

            // Apply whitelist based on item type
            const whitelistType = item.type.toLowerCase();
            let dsaLevel = 0;
            let cmineLevel = 0;
            
            if (whitelistType === 'dsa') {
                dsaLevel = item.level || 1;
            } else if (whitelistType === 'cmine') {
                cmineLevel = item.level || 1;
            }

            // Calculate expiry date if duration is specified
            let expiry = null;
            if (item.duration) {
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + (item.duration * 7)); // duration is in weeks
                expiry = expiryDate.toISOString().slice(0, 19).replace('T', ' ');
            }

            // Add to whitelist
            const whitelistResult = await sql.addToWhitelist(kingdomId, continent, guildId, dsaLevel.toString(), cmineLevel.toString(), expiry);

            // Get user's remaining balance
            const remainingBalance = await sql.getUserPointsBalance(user.id, guildId);

            // Create purchase confirmation embed with appropriate messaging
            const isExtended = whitelistResult && whitelistResult.extended;
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Purchase Successful!")
                .setDescription(`You have successfully purchased **${item.name}** for ${formatNumber(item.price)} ${currencyEmoji}`)
                .addFields(
                    { name: "Item", value: item.name, inline: true },
                    { name: "Price", value: `${formatNumber(item.price)} ${currencyEmoji}`, inline: true },
                    { name: "Kingdom", value: kingdomName, inline: true },
                    { name: "Whitelist Applied", value: `${whitelistType.toUpperCase()}: Level ${item.level || 1}`, inline: true },
                    { name: "Duration", value: item.duration ? `${item.duration} weeks` : "Permanent", inline: true },
                    { name: "Remaining Balance", value: `${formatNumber(remainingBalance)} ${currencyEmoji}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Purchased by ${user.username}`, iconURL: user.displayAvatarURL() });

            if (item.description) {
                embed.addFields({ name: "Description", value: item.description, inline: false });
            }

            // Add information about license extension or new license
            if (isExtended) {
                embed.addFields({ 
                    name: "🔄 License Extended", 
                    value: `Your existing ${whitelistType.toUpperCase()} Level ${item.level || 1} license has been extended by ${item.duration} weeks.`, 
                    inline: false 
                });
            } else if (expiry) {
                embed.addFields({ 
                    name: "🆕 New License", 
                    value: `A new ${whitelistType.toUpperCase()} Level ${item.level || 1} license has been created.`, 
                    inline: false 
                });
            }

            if (expiry && whitelistResult && whitelistResult.newExpiry) {
                const expiryDate = new Date(whitelistResult.newExpiry);
                const timestamp = Math.floor(expiryDate.getTime() / 1000);
                embed.addFields({ name: "Expires", value: `<t:${timestamp}:F> (<t:${timestamp}:R>)`, inline: true });
            }

            await interaction.reply({ embeds: [embed], flags: 64 });

            // Log the purchase
            await logShopAction(guildId, sql, guild, 'purchase', user, {
                itemName: item.name,
                price: item.price,
                quantity: 1,
                remainingStock: item.stock - 1,
                kingdom: kingdomName,
                whitelistType: whitelistType,
                level: item.level || 1,
                duration: item.duration ? (isExtended ? 'Extended' : `${item.duration} weeks`) : 'Permanent'
            });

            // Refresh the shop channel to update stock
            await refreshShopChannel(guildId, sql, guild);

        } catch (error) {
            console.error('Error applying whitelist purchase:', error);
            await interaction.reply({ content: "❌ There was an error applying the whitelist. Please contact an administrator.", flags: 64 });
        }
    },

    async completeRegularPurchase(interaction, item, currencyEmoji, sql) {
        const { guildId, user } = interaction;
        const guild = interaction.guild;

        try {
            // Attempt to purchase (this will decrease stock if successful)
            const purchaseSuccess = await sql.purchaseShopItem(item.id, guildId, 1);
            
            if (!purchaseSuccess) {
                await interaction.reply({ content: "❌ Purchase failed. Item may be out of stock.", flags: 64 });
                return;
            }

            // Deduct points from user
            await sql.deductUserPoints(user.id, guildId, item.price, 'shop purchase');

            // Log the purchase
            await sql.logShopPurchase(guildId, user.id, item.id, 1, item.price);

            // Get user's remaining balance
            const remainingBalance = await sql.getUserPointsBalance(user.id, guildId);

            // Create purchase confirmation embed
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Purchase Successful!")
                .setDescription(`You have successfully purchased **${item.name}** for ${formatNumber(item.price)} ${currencyEmoji}`)
                .addFields(
                    { name: "Item", value: item.name, inline: true },
                    { name: "Price", value: `${formatNumber(item.price)} ${currencyEmoji}`, inline: true },
                    { name: "Quantity", value: "1", inline: true },
                    { name: "Remaining Balance", value: `${formatNumber(remainingBalance)} ${currencyEmoji}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Purchased by ${user.username}`, iconURL: user.displayAvatarURL() });

            if (item.description) {
                embed.addFields({ name: "Description", value: item.description, inline: false });
            }

            await interaction.reply({ embeds: [embed], flags: 64 });

            // Log the purchase
            await logShopAction(guildId, sql, guild, 'purchase', user, {
                itemName: item.name,
                price: item.price,
                quantity: 1,
                remainingStock: item.stock - 1
            });

            // Refresh the shop channel to update stock
            await refreshShopChannel(guildId, sql, guild);

        } catch (error) {
            console.error('Error completing regular purchase:', error);
            await interaction.reply({ content: "❌ There was an error processing your purchase!", flags: 64 });
        }
    },
    async autocomplete(interaction) {
        const sql = module.exports.sql;
        const { guildId } = interaction;
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'item') {
            try {
                // Get all shop items for this guild
                const items = await sql.getShopItems(guildId);
                
                if (!items || items.length === 0) {
                    await interaction.respond([]);
                    return;
                }

                // Filter items based on user input and create choices
                const choices = items
                    .filter(item => item.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
                    .slice(0, 25) // Discord limit is 25 choices
                    .map(item => {
                        let displayName = `${item.name} (ID: ${item.id}, Stock: ${item.stock}, Price: ${formatNumber(item.price)}`;
                        if (item.type) displayName += `, Type: ${item.type}`;
                        if (item.level) displayName += `, Lvl: ${item.level}`;
                        if (item.duration) displayName += `, ${item.duration}w`;
                        displayName += ')';
                        
                        // Truncate if too long for Discord's 100 character limit
                        if (displayName.length > 100) {
                            displayName = displayName.substring(0, 97) + '...';
                        }
                        
                        return {
                            name: displayName,
                            value: item.id.toString()
                        };
                    });

                await interaction.respond(choices);
            } catch (error) {
                console.error('Error in shop autocomplete:', error);
                await interaction.respond([]);
            }
        } else if (focusedOption.name === 'type') {
            // Provide autocomplete for item types
            const typeChoices = [
                { name: 'DSA', value: 'dsa' },
                { name: 'C-Mine', value: 'cmine' }
            ];
            
            const filteredChoices = typeChoices.filter(choice => 
                choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
            );
            
            await interaction.respond(filteredChoices);
        } else if (focusedOption.name === 'reason') {
            // Provide autocomplete for points transaction reasons (enum values)
            const reasonChoices = [
                { name: 'Rallies', value: 'rallies' },
                { name: 'Dev Points', value: 'dev points' },
                { name: 'CVC Points', value: 'cvc points' },
                { name: 'Other', value: 'other' },
                { name: 'Admin Change', value: 'admin change' }
            ];
            
            const filteredChoices = reasonChoices.filter(choice => 
                choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()) ||
                choice.value.toLowerCase().includes(focusedOption.value.toLowerCase())
            );
            
            await interaction.respond(filteredChoices);
        } else if (focusedOption.name === 'kingdom') {
            try {
                const search = focusedOption.value;
                // Reuse existing sql method analogous to blacklist autocomplete
                const names = await sql.searchKingdomName(search);
                const choices = names.slice(0,25).map(n => ({
                    name: n.name ? `${n.name} (${n.kingdomId})` : n.kingdomId,
                    value: n.kingdomId.toString()
                }));
                await interaction.respond(choices);
            } catch (e) {
                console.error('Error in kingdom autocomplete:', e);
                await interaction.respond([]);
            }
        }
    },
    refreshShopChannel,
};

// Helper function to get currency emoji for a guild
async function getCurrencyEmoji(guildId, sql) {
    const customEmoji = await sql.getGuildCurrencyEmoji(guildId);
    return customEmoji || "🪙"; // Default to coin emoji if no custom emoji is set
}

// Helper function to log shop actions
async function logShopAction(guildId, sql, guild, action, user, details = {}) {
    try {
        // Get log channels
        const logChannels = await sql.getGuildLogChannels(guildId);
        if (!logChannels || logChannels.length === 0) {
            return; // No log channels configured
        }

        const channels = logChannels[0];
        // Use shop_log_channel if available, otherwise fall back to accept_log_channel
        const logChannelId = channels.shop_log_channel || channels.accept_log_channel;
        
        if (!logChannelId) {
            return; // No suitable log channel found
        }

        const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel) {
            return; // Channel not found or not accessible
        }

        // Get currency emoji
        const currencyEmoji = await getCurrencyEmoji(guildId, sql);

        // Create embed based on action type
        let embed = new EmbedBuilder()
            .setTimestamp()
            .setFooter({ text: `Action by ${user.username}`, iconURL: user.displayAvatarURL() });

        switch (action) {
            case 'item_added':
                embed
                    .setColor(0x00FF00)
                    .setTitle("🛒 Shop Item Added")
                    .setDescription(`**${details.name}** has been added to the shop`)
                    .addFields(
                        { name: "Price", value: `${formatNumber(details.price)} ${currencyEmoji}`, inline: true },
                        { name: "Stock", value: details.stock.toString(), inline: true },
                        { name: "Item ID", value: details.id?.toString() || 'Unknown', inline: true }
                    );
                if (details.type) embed.addFields({ name: "Type", value: details.type, inline: true });
                if (details.level) embed.addFields({ name: "Level", value: details.level.toString(), inline: true });
                if (details.duration) embed.addFields({ name: "Duration", value: `${details.duration} weeks`, inline: true });
                if (details.description) embed.addFields({ name: "Description", value: details.description, inline: false });
                break;

            case 'item_edited':
                embed
                    .setColor(0xFFD700)
                    .setTitle("✏️ Shop Item Edited")
                    .setDescription(`**${details.name}** (ID: ${details.id}) has been updated`)
                    .addFields(
                        { name: "Price", value: `${formatNumber(details.price)} ${currencyEmoji}`, inline: true },
                        { name: "Stock", value: details.stock.toString(), inline: true }
                    );
                if (details.type) embed.addFields({ name: "Type", value: details.type, inline: true });
                if (details.level) embed.addFields({ name: "Level", value: details.level.toString(), inline: true });
                if (details.duration) embed.addFields({ name: "Duration", value: `${details.duration} weeks`, inline: true });
                if (details.description) embed.addFields({ name: "Description", value: details.description, inline: false });
                break;

            case 'item_removed':
                embed
                    .setColor(0xFF6B6B)
                    .setTitle("🗑️ Shop Item Removed")
                    .setDescription(`**${details.name}** (ID: ${details.id}) has been removed from the shop`)
                    .addFields(
                        { name: "Last Price", value: `${formatNumber(details.price)} ${currencyEmoji}`, inline: true },
                        { name: "Last Stock", value: details.stock.toString(), inline: true }
                    );
                break;

            case 'purchase':
                embed
                    .setColor(0x00FF00)
                    .setTitle("💰 Item Purchased")
                    .setDescription(`<@${user.id}> purchased **${details.itemName}**`)
                    .addFields(
                        { name: "Price", value: `${formatNumber(details.price)} ${currencyEmoji}`, inline: true },
                        { name: "Quantity", value: details.quantity?.toString() || "1", inline: true },
                        { name: "Remaining Stock", value: details.remainingStock?.toString() || "Unknown", inline: true }
                    );
                if (details.kingdom) embed.addFields({ name: "Kingdom", value: details.kingdom, inline: true });
                if (details.whitelistType) embed.addFields({ name: "Whitelist Applied", value: `${details.whitelistType.toUpperCase()}: Level ${details.level || 1}`, inline: true });
                if (details.duration) embed.addFields({ name: "Duration", value: details.duration, inline: true });
                break;

            case 'points_added':
                embed
                    .setColor(details.amount > 0 ? 0x00FF00 : 0xFF6B6B)
                    .setTitle(details.amount > 0 ? "💸 Points Added" : "💸 Points Removed")
                    .setDescription(`<@${details.targetUserId}> ${details.amount > 0 ? 'received' : 'lost'} **${formatNumber(Math.abs(details.amount))} ${currencyEmoji}**`)
                    .addFields(
                        { name: "Amount", value: `${details.amount > 0 ? '+' : ''}${formatNumber(details.amount)} ${currencyEmoji}`, inline: true },
                        { name: "Reason", value: details.reason || "No reason provided", inline: true },
                        { name: "Modified by", value: `<@${user.id}>`, inline: true }
                    );
                break;

            case 'shop_refreshed':
                embed
                    .setColor(0x5865F2)
                    .setTitle("🔄 Shop Refreshed")
                    .setDescription("Shop channel has been refreshed");
                break;

            default:
                embed
                    .setColor(0x5865F2)
                    .setTitle("🛒 Shop Action")
                    .setDescription(`Action: ${action}`)
                    .addFields({ name: "Details", value: JSON.stringify(details), inline: false });
                break;
        }

        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging shop action:', error);
        // Don't throw the error - logging failures shouldn't break the main functionality
    }
}

// Helper function to set emoji on button (handles both custom and unicode emojis)
function setButtonEmoji(button, emoji) {
    try {
        if (!emoji) {
            button.setEmoji("🪙"); // Default fallback
            return;
        }

        // Trim any whitespace
        emoji = emoji.trim();

        if (emoji.startsWith('<') && emoji.endsWith('>')) {
            // Custom emoji format: <:name:id> or <a:name:id>
            const emojiMatch = emoji.match(/<(a)?:([^:]+):(\d+)>/);
            if (emojiMatch) {
                const isAnimated = !!emojiMatch[1];
                const name = emojiMatch[2];
                const id = emojiMatch[3];
                
                button.setEmoji({
                    name: name,
                    id: id,
                    animated: isAnimated
                });
            } else {
                console.warn(`Invalid custom emoji format: ${emoji}`);
                button.setEmoji("🪙"); // Fallback
            }
        } else {
            // Unicode emoji
            button.setEmoji(emoji);
        }
    } catch (error) {
        console.error('Error setting button emoji:', error);
        button.setEmoji("🪙"); // Fallback on error
    }
}

async function refreshShopChannel(guildId, sql, guild) {
    try {
        // Get currency emoji for this guild
        const currencyEmoji = await getCurrencyEmoji(guildId, sql);
        
        // Get shop channel
        const managedChannels = await sql.getManagedChannels(guildId);
        if (!managedChannels || managedChannels.length === 0 || !managedChannels[0].shop_channel) {
            return false;
        }

        const shopChannelId = managedChannels[0].shop_channel;
        const shopChannel = await guild.channels.fetch(shopChannelId).catch(() => null);
        
        if (!shopChannel) {
            return false;
        }

        // Clear existing messages
        const messages = await shopChannel.messages.fetch({ limit: 100 });
        await shopChannel.bulkDelete(messages.filter(msg => msg.author.bot));

        // Get shop items
        const shopItems = await sql.getShopItems(guildId);
        
        // Create new embed
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🛒 ${guild.name} Shop`)
            .setDescription("Welcome to the guild shop! Browse and purchase items below.")
            .setFooter({ text: "Powered by Lokex" });

        // Create buttons for shop items
        const rows = [];
        let currentRow = new ActionRowBuilder();
        let buttonsInRow = 0;

        // Filter items with stock > 0 for display
        const inStockItems = shopItems ? shopItems.filter(item => item.stock > 0) : [];
        
        if (inStockItems.length > 0) {
            for (const item of inStockItems) {
                const button = new ButtonBuilder()
                    .setCustomId(`shop_buy_${item.id}`)
                    .setLabel(`${formatNumber(item.price)} - ${item.name}`)
                    .setStyle(ButtonStyle.Success);

                // Set the currency emoji as button emoji (appears at front of button)
                setButtonEmoji(button, currencyEmoji);

                currentRow.addComponents(button);
                buttonsInRow++;

                if (buttonsInRow === 5) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                    buttonsInRow = 0;
                }
            }

            if (buttonsInRow > 0) {
                rows.push(currentRow);
            }

            // Add fields for each item in stock
            for (const item of inStockItems) {
                let itemValue = `**Price:** ${formatNumber(item.price)} ${currencyEmoji}\n**Stock:** ${item.stock}`;
                
                // Add duration if it exists
                if (item.duration) {
                    itemValue += `\n:clock3: **Duration:** ${item.duration} weeks`;
                }
                if (item.mincastle) {
                    itemValue += `\n🏰 **Min Castle lvl:** ${item.mincastle}`;
                }
                
                // Add description only if it exists
                if (item.description) {
                    itemValue += `\n**Description:** ${item.description}`;
                }
                
                embed.addFields({
                    name: item.name,
                    value: itemValue,
                    inline: true
                });
            }
        } else {
            embed.addFields({
                name: "No Items Available",
                value: "There are currently no items in the shop. Check back later!",
                inline: false
            });
        }

        // Send new message
        await shopChannel.send({ embeds: [embed], components: rows });
        return true;
    } catch (error) {
        console.error('Error refreshing shop channel:', error);
        return false;
    }
}
