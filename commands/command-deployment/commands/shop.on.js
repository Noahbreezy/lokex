const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const MAX_MEDALS_PER_KINGDOM = 40000;

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

function formatFullNumber(num) {
    if (num === null || num === undefined) {
        return '0';
    }

    const original = typeof num === 'string' ? num.trim() : num.toString();
    if (!original) {
        return '0';
    }

    const hasNegativeSign = original.startsWith('-');
    const sanitized = (hasNegativeSign ? original.slice(1) : original).replace(/,/g, '');

    if (!/^\d*\.?\d*$/.test(sanitized)) {
        const numericValue = Number(num);
        if (!Number.isFinite(numericValue)) {
            return original;
        }
        return numericValue.toLocaleString('en-US', {
            useGrouping: true,
            maximumFractionDigits: 20
        });
    }

    let [integerPart, fractionPart] = sanitized.split('.');
    if (!integerPart || integerPart.length === 0) {
        integerPart = '0';
    }

    integerPart = integerPart.replace(/^0+(?=\d)/, '');
    if (integerPart === '') {
        integerPart = '0';
    }

    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formattedFraction = fractionPart ? `.${fractionPart}` : '';

    const result = `${hasNegativeSign ? '-' : ''}${formattedInteger}${formattedFraction}`;
    return result === '-0' ? '0' : result;
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
                .addIntegerOption((option) =>
                    option
                        .setName("maxowned")
                        .setDescription("Max number this item a user can own (licenses across kingdoms). 0 or empty = unlimited.")
                        .setRequired(false)
                        .setMinValue(0)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("maxduration")
                        .setDescription("Maximum stacked duration for this item in weeks (0 or empty = unlimited)")
                        .setRequired(false)
                        .setMinValue(0)
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
                .addIntegerOption((option) =>
                    option
                        .setName("maxowned")
                        .setDescription("New max number this item a user can own (use 0 to clear)")
                        .setRequired(false)
                        .setMinValue(0)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("maxduration")
                        .setDescription("New maximum stacked duration in weeks (use 0 to clear)")
                        .setRequired(false)
                        .setMinValue(0)
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
                .setName("medals-history")
                .setDescription("Download medal history totals for all kingdoms within a date range")
                .addStringOption((option) =>
                    option
                        .setName("from")
                        .setDescription("Start date in YYYY-MM-DD format")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("to")
                        .setDescription("End date in YYYY-MM-DD format")
                        .setRequired(true)
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
            const adminOnlyCommands = ['add', 'edit', 'remove', 'refresh', 'history', 'addpoints', 'medals-history'];
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
                        const maxowned = options.getInteger("maxowned"); // preserve 0 as unlimited
                        const maxdurationInput = options.getInteger("maxduration");
                        const maxduration = (maxdurationInput === null || maxdurationInput <= 0) ? null : maxdurationInput;

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

                        await sql.addShopItem(guildId, name, price, stock, description, type, level, duration, mincastle, maxowned, maxduration);
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
                                mincastle,
                                maxowned,
                                maxduration
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
                        const maxowned = options.getInteger("maxowned");
                        const maxdurationOption = options.getInteger("maxduration");

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
                        // maxowned: allow explicit 0 to clear (NULL = unlimited)
                        let updatedMaxowned;
                        if (maxowned !== null) {
                            updatedMaxowned = maxowned === 0 ? null : maxowned;
                        } else {
                            updatedMaxowned = currentItem.maxowned;
                        }
                        let updatedMaxduration;
                        if (maxdurationOption !== null) {
                            updatedMaxduration = maxdurationOption === 0 ? null : maxdurationOption;
                        } else {
                            updatedMaxduration = currentItem.maxduration ?? null;
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

                        await sql.updateShopItem(itemId, guildId, updatedName, updatedPrice, updatedStock, updatedDescription, updatedType, updatedLevel, updatedDuration, updatedMincastle, updatedMaxowned, updatedMaxduration);

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
                            mincastle: updatedMincastle,
                            maxowned: updatedMaxowned,
                            maxduration: updatedMaxduration
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
                            if (item.maxowned) description += ` | Max Owned: ${item.maxowned}`;
                            if (item.maxduration) description += ` | Max Duration: ${item.maxduration}w`;
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
                        const balanceDisplay = formatFullNumber(balance);

                        const embed = new EmbedBuilder()
                            .setColor(0xFFD700)
                            .setTitle("💰 Points Balance")
                            .setDescription(`${targetUser ? `**${checkUsername}**` : 'You'} currently ${targetUser ? 'has' : 'have'} **${balanceDisplay} ${currencyEmoji}**`)
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
                case "medals-history":
                    await this.handleMedalsHistory(interaction, ephemeral);
                    break;
                case "licenses":
                    {
                        // Defer reply immediately to prevent timeout
                        await interaction.deferReply(ephemeral);
                        const targetUser = options.getUser("user");
                        const kingdomOption = options.getString("kingdom");
                        let derivedUserId = null;
                        let derivedUsername = null;
                        let derivedUserAvatar = null;
                        let fromKingdom = false;
                        let selectedKingdomLabel = kingdomOption ? kingdomOption.trim() : null;

                        if (kingdomOption) {
                            console.log('Kingdom option provided:', kingdomOption);
                            const discordIdFound = await sql.getVerifiedDiscordId(kingdomOption, guildId);
                            console.log('Discord ID found for kingdom:', discordIdFound);
                            if (discordIdFound && Array.isArray(discordIdFound) && discordIdFound.length > 0 && discordIdFound[0].discordId) {
                                derivedUserId = discordIdFound[0].discordId;
                                // Get the username for the derived user
                                try {
                                    const derivedUser = await interaction.guild.members.fetch(derivedUserId);
                                    derivedUsername = derivedUser.user.username;
                                    derivedUserAvatar = derivedUser.displayAvatarURL();
                                } catch (error) {
                                    console.log('Could not fetch derived user, using ID as fallback:', derivedUserId);
                                    derivedUsername = `User ${derivedUserId}`;
                                }
                                console.log('Derived user ID and username:', derivedUserId, derivedUsername);
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

                        if (kingdomOption && verifiedKingdoms && Array.isArray(verifiedKingdoms)) {
                            const normalizedOption = kingdomOption.toString().trim().toLowerCase();
                            const exactOption = kingdomOption.toString().trim();
                            const matchedKingdom = verifiedKingdoms.find(k =>
                                (k.kingdomId && k.kingdomId.toString() === exactOption) ||
                                (k.kingdomName && k.kingdomName.toLowerCase() === normalizedOption)
                            );
                            if (matchedKingdom) {
                                selectedKingdomLabel = matchedKingdom.kingdomName || `Kingdom ${matchedKingdom.kingdomId}`;
                            }
                        }

                        if (!verifiedKingdoms || verifiedKingdoms.length === 0) {
                            const embed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle("📜 Whitelist Licenses")
                                .setTimestamp();

                            if (fromKingdom) {
                                if (derivedUserAvatar) {
                                    embed.setThumbnail(derivedUserAvatar);
                                }
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
                                value: fromKingdom ?
                                    `<@${checkUserId}> (${checkUsername || 'Unknown User'}) has no verified kingdoms in this guild${selectedKingdomLabel ? ` for **${selectedKingdomLabel}**` : ''}.` :
                                    (targetUser ?
                                        `${checkUsername} has no verified kingdoms in this guild.` :
                                        "You have no verified kingdoms in this guild.\n\nUse `/verify` to verify your kingdoms first!"),
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

                        if (fromKingdom) {
                            if (derivedUserAvatar) {
                                embed.setThumbnail(derivedUserAvatar);
                            }
                            embed.setDescription(`Licenses for kingdoms owned by <@${checkUserId}> (${checkUsername || 'Unknown User'})${selectedKingdomLabel ? ` – focusing on **${selectedKingdomLabel}**` : ''}`);
                        } else if (targetUser) {
                            embed.setThumbnail(targetUser.displayAvatarURL());
                            embed.setDescription(`**${checkUsername}**'s available whitelist licenses:`);
                        } else {
                            embed.setThumbnail(user.displayAvatarURL());
                            embed.setDescription("Your available whitelist licenses:");
                        }

                        if (!aggregatedKingdoms || aggregatedKingdoms.length === 0) {
                            embed.addFields({
                                name: "No Licenses Found",
                                value: fromKingdom ?
                                    `<@${checkUserId}> (${checkUsername || 'Unknown User'}) has no active whitelist licenses${selectedKingdomLabel ? ` for **${selectedKingdomLabel}**` : ''} in this guild.` :
                                    (targetUser ?
                                        `${checkUsername} has no active whitelist licenses in this guild.` :
                                        "You have no active whitelist licenses in this guild.\n\nPurchase DSA or C-Mine licenses from the shop to get started!"),
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
                                currentEmbed.setDescription(`Licenses for kingdoms owned by <@${checkUserId}> (${checkUsername || 'Unknown User'})${selectedKingdomLabel ? ` – focusing on **${selectedKingdomLabel}**` : ''}`);
                                if (derivedUserAvatar) {
                                    currentEmbed.setThumbnail(derivedUserAvatar);
                                }
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
    async handleMedalsHistory(interaction, ephemeral) {
        const sql = module.exports.sql;
        const { options, guildId, user } = interaction;
        const guild = interaction.guild;
        const fromDateInput = (options.getString("from") || "").trim();
        const toDateInput = (options.getString("to") || "").trim();

        const isEphemeral = Boolean(ephemeral && ephemeral.flags === 64);

        try {
            const member = interaction.member || await guild.members.fetch(user.id);
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({ content: "❌ You need administrator permissions to use this command.", ...ephemeral });
                return;
            }

            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(fromDateInput) || !dateRegex.test(toDateInput)) {
                await interaction.reply({ content: "❌ Invalid date format. Use YYYY-MM-DD for both start and end dates.", ...ephemeral });
                return;
            }

            const fromDate = new Date(`${fromDateInput}T00:00:00Z`);
            const toDate = new Date(`${toDateInput}T23:59:59Z`);

            if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
                await interaction.reply({ content: "❌ Invalid date values. Please verify the provided dates.", ...ephemeral });
                return;
            }

            if (fromDate > toDate) {
                await interaction.reply({ content: "❌ Start date cannot be after end date.", ...ephemeral });
                return;
            }

            const maxRangeDays = 365;
            const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
            if (daysDiff > maxRangeDays) {
                await interaction.reply({ content: `❌ Date range cannot exceed ${maxRangeDays} days.`, ...ephemeral });
                return;
            }

            if (isEphemeral) {
                await interaction.deferReply({ ephemeral: true });
            } else {
                await interaction.deferReply();
            }

            await interaction.editReply(`🔄 Fetching medal totals for all kingdoms from ${fromDateInput} to ${toDateInput}...`);

            const fromDateTime = `${fromDateInput} 00:00:00`;
            const toDateTime = `${toDateInput} 23:59:59`;
            const history = await sql.getMedalsHistory(guildId, fromDateTime, toDateTime);

            const kingdomSummaries = Array.isArray(history?.kingdomSummaries) ? history.kingdomSummaries : [];

            if (kingdomSummaries.length === 0) {
                await interaction.editReply(`❌ No medal data found for ${fromDateInput} to ${toDateInput}.`);
                return;
            }

            kingdomSummaries.sort((a, b) => b.endingBalance - a.endingBalance);

            const totalTransactions = kingdomSummaries.reduce((sum, k) => sum + k.transactionCount, 0);

            const csvContent = this.generateMedalsHistoryCSV({
                fromDate: fromDateInput,
                toDate: toDateInput,
                kingdomSummaries
            });

            const fileName = `medals_history_${fromDateInput}_to_${toDateInput}.csv`;
            const tempFilePath = path.join(__dirname, '..', '..', '..', 'temp', fileName);
            const tempDir = path.dirname(tempFilePath);

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            fs.writeFileSync(tempFilePath, '\ufeff' + csvContent, { encoding: 'utf8' });

            const attachment = new AttachmentBuilder(tempFilePath, { name: fileName });

            const summaryLines = [
                `✅ **Medal History Report**`,
                `📅 **Date Range:** ${fromDateInput} to ${toDateInput}`,
                `👑 **Kingdoms Covered:** ${kingdomSummaries.length.toLocaleString()}`,
                `📝 **Transactions Processed:** ${totalTransactions.toLocaleString()}`
            ];

            await interaction.editReply({
                content: summaryLines.join('\n'),
                files: [attachment]
            });

            setTimeout(() => {
                try {
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                } catch (cleanupError) {
                    console.error('Failed to remove temporary medals history file:', cleanupError);
                }
            }, 60_000);

        } catch (error) {
            console.error('Error generating medals history:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('❌ An error occurred while generating the medal history report. Please try again later.');
            } else {
                await interaction.reply({ content: '❌ An error occurred while generating the medal history report. Please try again later.', ...ephemeral });
            }
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

            const itemType = item.type ? item.type.toLowerCase() : null;
            const userBalance = await sql.getUserPointsBalance(user.id, guildId);

            if (itemType === 'medal') {
                const pricePerMedal = Number(item.price);
                if (!Number.isFinite(pricePerMedal) || pricePerMedal <= 0) {
                    await interaction.reply({
                        content: '❌ This medal item is misconfigured. Please contact an administrator.',
                        flags: 64
                    });
                    return;
                }

                if (userBalance < pricePerMedal) {
                    const priceDisplay = pricePerMedal % 1 === 0
                        ? formatNumber(pricePerMedal)
                        : pricePerMedal.toFixed(2);
                    await interaction.reply({
                        content: `❌ Insufficient funds! You need at least ${priceDisplay} ${currencyEmoji} to buy a single medal.`,
                        flags: 64
                    });
                    return;
                }

                await this.handleMedalPurchase(interaction, item, currencyEmoji, sql);
                return;
            }

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
            if (itemType && (itemType === 'dsa' || itemType === 'cmine')) {
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

        // Determine continent and max-owned state for this license type/level
        const continentArr = await sql.getGuildContinents(guildId);
        const continent = continentArr && continentArr.length > 0 ? continentArr[0].continent : null;
        if (!continent) {
            await interaction.reply({ content: "❌ No continent linked to this guild. Cannot apply whitelist.", flags: 64 });
            return;
        }

        const isLicenseItem = item.type && (item.type.toLowerCase() === 'dsa' || item.type.toLowerCase() === 'cmine');
        const hasMaxOwned = isLicenseItem && Number(item.maxowned) > 0; // 0 or null = unlimited
        let atLimit = false;
        let eligibleKingdomIds = new Set();
        if (hasMaxOwned) {
            try {
                const limitResult = await sql.hasReachedLicenseLimit(user.id, guildId, continent, item.type, item.level, item.maxowned);
                console.log(`Debug: Checking maxowned for user ${user.id}, guild ${guildId}, continent ${continent}, type ${item.type}, level ${item.level || 1}, maxowned ${item.maxowned}:`, limitResult);
                if (limitResult && Array.isArray(limitResult)) {
                    atLimit = true;
                    eligibleKingdomIds = new Set(limitResult.map(e => e.kingdomId.toString()));
                    console.log(`Debug: License cap reached; eligible kingdoms for extension:`, Array.from(eligibleKingdomIds));
                } else {
                    atLimit = false;
                }
            } catch (e) {
                console.error('Error checking maxowned state:', e);
            }
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

            // Enforce maxowned on single kingdom: if at limit, only allow extending existing license
            if (hasMaxOwned && atLimit) {
                if (!eligibleKingdomIds.has(kingdoms[0].kingdomId.toString())) {
                    await interaction.reply({ content: `❌ You already own the maximum of **${item.maxowned}** ${item.type.toUpperCase()} Level ${item.level} license(s). You can only extend an existing license, not assign a new kingdom.`, flags: 64 });
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

            // If at limit, restrict to eligible kingdoms (those already having this license level)
            let filteredKingdoms = uniqueKingdoms;
            let limitedMsg = '';
            if (hasMaxOwned && atLimit) {
                filteredKingdoms = uniqueKingdoms.filter(k => eligibleKingdomIds.has(k.kingdomId.toString()));
                limitedMsg = `\nYou have reached the maximum of **${item.maxowned}** ${item.type.toUpperCase()} Level ${item.level} license(s). Please select a kingdom to extend its existing license.`;
                if (filteredKingdoms.length === 0) {
                    await interaction.reply({ content: `❌ You have reached the maximum of **${item.maxowned}** ${item.type.toUpperCase()} Level ${item.level} license(s) and none of your verified kingdoms currently have this license to extend.`, flags: 64 });
                    return;
                }
            }

            // Enforce Discord max 25 options
            let truncated = false;
            let displayKingdoms = filteredKingdoms;
            if (filteredKingdoms.length > 25) {
                displayKingdoms = filteredKingdoms.slice(0, 25);
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

            const menuCustomId = `select_kingdom_shop_${user.id}_${item.id}_${interaction.id}`;

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(menuCustomId)
                .setPlaceholder(hasMaxOwned && atLimit ? 'Select a kingdom to extend' : 'Select a kingdom for the whitelist')
                .addOptions(kingdomOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            let contentMsg = `Please select which kingdom should receive the ${item.type.toUpperCase()} whitelist for **${item.name}**:` + limitedMsg;
            if (truncated) {
                contentMsg += `\n⚠️ Showing first 25 of ${uniqueKingdoms.length} kingdoms.`;
            }

            await interaction.reply({
                content: contentMsg,
                components: [row],
                flags: 64
            });

            // Set up collector for kingdom selection
            const filter = i => i.customId === menuCustomId && i.user.id === user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                const selectedKingdomId = i.values[0];
                const selectedKingdom = uniqueKingdoms.find(k => k.kingdomId.toString() === selectedKingdomId);

                let acknowledged = true;
                try {
                    await i.deferUpdate({}).catch(error => {
                        if (error?.code === 10062) {
                            acknowledged = false;
                            return;
                        }
                        throw error;
                    });

                    if (!acknowledged) {
                        collector.stop();
                        return;
                    }

                    if (!selectedKingdom) {
                        await i.editReply({ content: '❌ Invalid selection. Please try again.', components: [] });
                        collector.stop();
                        return;
                    }

                    if (hasMaxOwned && atLimit && !eligibleKingdomIds.has(selectedKingdomId.toString())) {
                        await i.editReply({ content: `❌ You already own the maximum of **${item.maxowned}** ${item.type.toUpperCase()} Level ${item.level} license(s). Please select one of your kingdoms that already has this license to extend.`, components: [] });
                        collector.stop();
                        return;
                    }

                    if (item.mincastle) {
                        const levelRows = await sql.getKingdomLevel(selectedKingdom.kingdomId);
                        let level = null;
                        if (Array.isArray(levelRows)) {
                            if (levelRows.length > 0 && levelRows[0].level !== undefined) level = parseInt(levelRows[0].level);
                        } else if (levelRows && levelRows.level !== undefined) {
                            level = parseInt(levelRows.level);
                        }
                        if (level === null || level < item.mincastle) {
                            await i.editReply({ content: `❌ Kingdom **${selectedKingdom.kingdomName}** does not meet the required castle level ${item.mincastle}+ (current: ${level ?? 'unknown'}).`, components: [] });
                            collector.stop();
                            return;
                        }
                    }

                    await i.editReply({
                        content: `Processing **${item.name}** for kingdom **${selectedKingdom.kingdomName}**...`,
                        components: []
                    });

                    await this.applyWhitelistPurchase(i, item, selectedKingdom.kingdomId, selectedKingdom.kingdomName, currencyEmoji, sql);
                    collector.stop();
                } catch (error) {
                    console.error('Error handling whitelist kingdom selection:', error);
                    if (acknowledged) {
                        try {
                            await i.editReply({ content: '❌ There was an error processing that selection. Please try again.', components: [] });
                        } catch (editErr) {
                            console.error('Failed to edit reply after whitelist selection error:', editErr);
                        }
                    }
                    collector.stop();
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.followUp({ content: '⏰ No selection was made. Purchase cancelled.', flags: 64 });
                }
            });
        }
    },

    async handleMedalPurchase(interaction, item, currencyEmoji, sql) {
        const { guildId, user } = interaction;

        try {
            const kingdoms = await sql.checkVerifiedKingdoms(user.id, guildId);
            if (!kingdoms || kingdoms.length === 0) {
                await interaction.reply({
                    content: '❌ No verified kingdoms found. Verify a kingdom first using `/verify` to purchase medals.',
                    flags: 64
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`shop_medal_quantity_${item.id}_${user.id}`)
                .setTitle(`Purchase ${item.name}`);

            const quantityInput = new TextInputBuilder()
                .setCustomId('medal_quantity')
                .setLabel('How many medals do you want?')
                .setPlaceholder(`Enter a number up to ${MAX_MEDALS_PER_KINGDOM}`)
                .setMinLength(1)
                .setMaxLength(5)
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));

            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error preparing medal purchase modal:', error);
            await interaction.reply({ content: '❌ There was an error preparing your medal purchase. Please try again later.', flags: 64 });
        }
    },

    async handleMedalQuantitySubmit(interaction) {
        const sql = module.exports.sql;
        const { guildId, user } = interaction;

        try {
            const idParts = interaction.customId.split('_');
            const itemId = parseInt(idParts[3], 10);
            const requestUserId = idParts[4];

            if (!itemId || !requestUserId) {
                await interaction.reply({ content: '❌ Invalid medal purchase request.', flags: 64 });
                return;
            }

            if (user.id !== requestUserId) {
                await interaction.reply({ content: "❌ This medal purchase request isn't for you.", flags: 64 });
                return;
            }

            const item = await sql.getShopItem(itemId, guildId);
            if (!item || !item.type || item.type.toLowerCase() !== 'medal') {
                await interaction.reply({ content: '❌ Medal item not found or no longer available.', flags: 64 });
                return;
            }

            const rawQuantity = interaction.fields.getTextInputValue('medal_quantity').trim();
            const sanitized = rawQuantity.replace(/,/g, '');
            const quantity = parseInt(sanitized, 10);

            if (!Number.isFinite(quantity) || quantity <= 0) {
                await interaction.reply({ content: '❌ Please enter a valid positive number of medals.', flags: 64 });
                return;
            }

            if (quantity > MAX_MEDALS_PER_KINGDOM) {
                await interaction.reply({ content: `❌ You can purchase at most ${MAX_MEDALS_PER_KINGDOM} medals per transaction.`, flags: 64 });
                return;
            }

            if (quantity > item.stock) {
                await interaction.reply({ content: `❌ Only ${formatNumber(item.stock)} medals remain in stock for this item.`, flags: 64 });
                return;
            }

            const pricePerMedal = Number(item.price);
            if (!Number.isFinite(pricePerMedal) || pricePerMedal <= 0) {
                await interaction.reply({ content: '❌ Invalid medal price configuration. Please contact an administrator.', flags: 64 });
                return;
            }

            const totalCost = Number((pricePerMedal * quantity).toFixed(2));
            const balance = await sql.getUserPointsBalance(user.id, guildId);

            if (balance < totalCost) {
                const emoji = await getCurrencyEmoji(guildId, sql);
                const totalDisplay = (totalCost % 1 === 0)
                    ? formatNumber(totalCost)
                    : totalCost.toFixed(2);
                const balanceDisplay = (balance % 1 === 0)
                    ? formatNumber(balance)
                    : balance.toFixed(2);
                await interaction.reply({
                    content: `❌ Insufficient funds! You need ${totalDisplay} ${emoji} but only have ${balanceDisplay}.`,
                    flags: 64
                });
                return;
            }

            const kingdoms = await sql.checkVerifiedKingdoms(user.id, guildId);
            if (!kingdoms || kingdoms.length === 0) {
                await interaction.reply({
                    content: '❌ No verified kingdoms found. Verify a kingdom first using `/verify` to purchase medals.',
                    flags: 64
                });
                return;
            }

            const uniqueMap = new Map();
            for (const k of kingdoms) {
                const idStr = k.kingdomId.toString();
                if (!uniqueMap.has(idStr)) {
                    uniqueMap.set(idStr, k);
                }
            }
            const uniqueKingdoms = Array.from(uniqueMap.values());
            const currencyEmoji = await getCurrencyEmoji(guildId, sql);

            if (uniqueKingdoms.length === 1) {
                const target = uniqueKingdoms[0];
                await this.completeMedalPurchase(interaction, {
                    respondType: 'reply',
                    item,
                    quantity,
                    totalCost,
                    kingdomId: target.kingdomId,
                    kingdomName: target.kingdomName || `Kingdom ${target.kingdomId}`,
                    currencyEmoji
                });
                return;
            }

            let displayKingdoms = uniqueKingdoms;
            let truncated = false;
            if (displayKingdoms.length > 25) {
                displayKingdoms = displayKingdoms.slice(0, 25);
                truncated = true;
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId(`shop_medal_select_${item.id}_${quantity}_${user.id}`)
                .setPlaceholder('Select the kingdom that will receive these medals')
                .addOptions(displayKingdoms.map(k => {
                    let label = k.kingdomName || `Kingdom ${k.kingdomId}`;
                    if (label.length > 100) {
                        label = label.slice(0, 97) + '...';
                    }
                    return {
                        label,
                        value: k.kingdomId.toString()
                    };
                }));

            const row = new ActionRowBuilder().addComponents(select);

            const totalDisplay = (totalCost % 1 === 0)
                ? formatNumber(totalCost)
                : totalCost.toFixed(2);
            const priceDisplay = (pricePerMedal % 1 === 0)
                ? pricePerMedal.toLocaleString('en-US')
                : pricePerMedal.toFixed(2);

            let content = `Select which kingdom should receive **${formatNumber(quantity)}** medals from **${item.name}**.`;
            content += `\nTotal cost: ${totalDisplay} ${currencyEmoji} (price per medal: ${priceDisplay}).`;
            if (truncated) {
                content += `\n⚠️ Showing the first 25 of ${uniqueKingdoms.length} verified kingdoms.`;
            }

            await interaction.reply({ content, components: [row], flags: 64 });
        } catch (error) {
            console.error('Error handling medal quantity submission:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ There was an error processing your medal purchase.', flags: 64 });
            }
        }
    },

    async handleMedalKingdomSelect(interaction) {
        const sql = module.exports.sql;
        const { guildId, user } = interaction;

        try {
            const idParts = interaction.customId.split('_');
            const itemId = parseInt(idParts[3], 10);
            const quantity = parseInt(idParts[4], 10);
            const requestUserId = idParts[5];

            if (!itemId || !quantity || !requestUserId) {
                await interaction.reply({ content: '❌ Invalid medal selection request.', flags: 64 });
                return;
            }

            if (user.id !== requestUserId) {
                await interaction.reply({ content: "❌ This medal selection isn't for you.", flags: 64 });
                return;
            }

            const selectedKingdomId = interaction.values && interaction.values[0];
            if (!selectedKingdomId) {
                await interaction.reply({ content: '❌ No kingdom selected.', flags: 64 });
                return;
            }

            const item = await sql.getShopItem(itemId, guildId);
            if (!item || !item.type || item.type.toLowerCase() !== 'medal') {
                await interaction.reply({ content: '❌ Medal item not found or no longer available.', flags: 64 });
                return;
            }

            const kingdoms = await sql.checkVerifiedKingdoms(user.id, guildId);
            const target = Array.isArray(kingdoms) ? kingdoms.find(k => k.kingdomId.toString() === selectedKingdomId.toString()) : null;
            if (!target) {
                await interaction.reply({ content: '❌ That kingdom is no longer verified or cannot receive medals.', flags: 64 });
                return;
            }
            const kingdomName = target ? (target.kingdomName || `Kingdom ${selectedKingdomId}`) : `Kingdom ${selectedKingdomId}`;
            const pricePerMedal = Number(item.price);
            const totalCost = Number((pricePerMedal * quantity).toFixed(2));
            const currencyEmoji = await getCurrencyEmoji(guildId, sql);

            await this.completeMedalPurchase(interaction, {
                respondType: 'update',
                item,
                quantity,
                totalCost,
                kingdomId: selectedKingdomId,
                kingdomName,
                currencyEmoji
            });
        } catch (error) {
            console.error('Error handling medal kingdom selection:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ There was an error finalizing your medal purchase.', flags: 64 });
            }
        }
    },

    async completeMedalPurchase(interaction, { respondType, item, quantity, totalCost, kingdomId, kingdomName, currencyEmoji }) {
        const sql = module.exports.sql;
        const { guildId, user } = interaction;
        let purchaseTotal = totalCost;

        const respond = async (payload) => {
            if (respondType === 'update') {
                await interaction.update(payload);
            } else if (respondType === 'reply') {
                await interaction.reply({ ...payload, flags: 64 });
            } else if (respondType === 'followUp') {
                await interaction.followUp({ ...payload, flags: 64 });
            }
        };

        const formatPrice = (value) => {
            if (!Number.isFinite(value)) return '0';
            return value % 1 === 0 ? formatNumber(value) : value.toFixed(2);
        };

        try {
            const latestItem = await sql.getShopItem(item.id, guildId);
            if (!latestItem || !latestItem.type || latestItem.type.toLowerCase() !== 'medal') {
                await respond({ content: '❌ Medal item not found or no longer available.', components: [] });
                return;
            }

            const currentStock = latestItem.stock;
            if (currentStock < quantity) {
                await respond({ content: `❌ Not enough stock remaining. Only ${formatNumber(currentStock)} medals are available.`, components: [] });
                return;
            }

            const pricePerMedal = Number(latestItem.price);
            if (!Number.isFinite(pricePerMedal) || pricePerMedal <= 0) {
                await respond({ content: '❌ Invalid medal price configuration. Please contact an administrator.', components: [] });
                return;
            }

            const recalculatedTotal = Number((pricePerMedal * quantity).toFixed(2));
            if (purchaseTotal === undefined || Math.abs(purchaseTotal - recalculatedTotal) > 0.01) {
                purchaseTotal = recalculatedTotal;
            }

            const balance = await sql.getUserPointsBalance(user.id, guildId);
            if (balance < purchaseTotal) {
                await respond({ content: `❌ Insufficient funds. You need ${formatPrice(purchaseTotal)} ${currencyEmoji} but only have ${formatPrice(balance)}.`, components: [] });
                return;
            }

            const existingTotal = await sql.getMedalTotalForKingdom(kingdomId.toString(), guildId);
            const projected = existingTotal + quantity;
            if (projected > MAX_MEDALS_PER_KINGDOM) {
                const remaining = Math.max(MAX_MEDALS_PER_KINGDOM - existingTotal, 0);
                const remainingMsg = remaining > 0
                    ? `You can only purchase ${formatNumber(remaining)} more medals for this kingdom.`
                    : 'This kingdom has already reached the medal cap.';
                await respond({ content: `❌ Medal cap reached. ${remainingMsg}`, components: [] });
                return;
            }

            const purchaseSuccess = await sql.purchaseShopItem(latestItem.id, guildId, quantity);
            if (!purchaseSuccess) {
                await respond({ content: '❌ Purchase failed. The item may be out of stock.', components: [] });
                return;
            }

            await sql.deductUserPoints(user.id, guildId, purchaseTotal, 'shop purchase');
            await sql.logShopPurchase(guildId, user.id, latestItem.id, quantity, purchaseTotal);
            await sql.recordMedalTransaction(kingdomId.toString(), user.id, quantity, guildId);

            const remainingBalance = await sql.getUserPointsBalance(user.id, guildId);
            const updatedMedalTotal = existingTotal + quantity;
            const remainingStock = currentStock - quantity;

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Medal Purchase Successful!')
                .setDescription(`You purchased **${formatNumber(quantity)}** medals from **${latestItem.name}** for ${formatPrice(purchaseTotal)} ${currencyEmoji}.`)
                .addFields(
                    { name: 'Kingdom', value: `${kingdomName} (ID: ${kingdomId})`, inline: true },
                    { name: 'Price per Medal', value: `${formatPrice(pricePerMedal)} ${currencyEmoji}`, inline: true },
                    { name: 'Total Cost', value: `${formatPrice(purchaseTotal)} ${currencyEmoji}`, inline: true },
                    { name: 'Remaining Balance', value: `${formatNumber(remainingBalance)} ${currencyEmoji}`, inline: true },
                    { name: 'Medals for Kingdom', value: `${updatedMedalTotal.toLocaleString('en-US')} / ${MAX_MEDALS_PER_KINGDOM.toLocaleString('en-US')}`, inline: true },
                    { name: 'Stock Remaining', value: formatNumber(Math.max(remainingStock, 0)), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Purchased by ${user.username}`, iconURL: user.displayAvatarURL() });

            if (latestItem.description) {
                embed.addFields({ name: 'Description', value: latestItem.description, inline: false });
            }

            await respond({ content: '', embeds: [embed], components: [] });

            await logShopAction(guildId, sql, interaction.guild, 'medals_purchased', user, {
                itemName: latestItem.name,
                quantity,
                totalCost: purchaseTotal,
                kingdom: kingdomName,
                kingdomId: kingdomId.toString(),
                remainingStock: Math.max(remainingStock, 0)
            });

            await refreshShopChannel(guildId, sql, interaction.guild);
        } catch (error) {
            console.error('Error completing medal purchase:', error);
            try {
                await respond({ content: '❌ There was an error completing your medal purchase. Please contact an administrator.', components: [] });
            } catch (respondError) {
                console.error('Failed to notify user about medal purchase error:', respondError);
            }
        }
    },

    async applyWhitelistPurchase(interaction, item, kingdomId, kingdomName, currencyEmoji, sql) {
        const { guildId, user } = interaction;
        const guild = interaction.guild;

        const respond = async (payload = {}) => {
            if (interaction.deferred) {
                const { flags, ...rest } = payload;
                return interaction.editReply(rest);
            }
            if (interaction.replied) {
                return interaction.followUp({ ...payload, flags: payload.flags ?? 64 });
            }
            return interaction.reply({ ...payload, flags: payload.flags ?? 64 });
        };

        try {
            let currentItem = item;
            const latestItem = await sql.getShopItem(item.id, guildId);
            if (latestItem) {
                currentItem = latestItem;
            }

            const itemPrice = Number(currentItem.price);
            if (!Number.isFinite(itemPrice) || itemPrice <= 0) {
                await respond({ content: "❌ This whitelist item is misconfigured. Please contact an administrator." });
                return;
            }

            const balance = await sql.getUserPointsBalance(user.id, guildId);
            if (balance < itemPrice) {
                await respond({
                    content: `❌ Insufficient funds! You need ${formatFullNumber(itemPrice)} ${currencyEmoji} but only have ${formatFullNumber(balance)} ${currencyEmoji}.`
                });
                return;
            }

            // Get continent for this guild (needed for whitelist)
            const continentArr = await sql.getGuildContinents(guildId);
            const continent = continentArr && continentArr.length > 0 ? continentArr[0].continent : null;

            if (!continent) {
                await respond({ content: "❌ No continent linked to this guild. Cannot apply whitelist." });
                return;
            }

            const whitelistType = (currentItem.type || '').toLowerCase();
            if (!['dsa', 'cmine'].includes(whitelistType)) {
                await respond({ content: "❌ This shop item is not configured as a whitelist license." });
                return;
            }

            const licenseLevel = currentItem.level || 1;
            const durationWeeks = currentItem.duration ? Number(currentItem.duration) : null;
            const maxDurationWeeks = (currentItem.maxduration === null || currentItem.maxduration === undefined || currentItem.maxduration <= 0)
                ? null
                : Number(currentItem.maxduration);

            if (!durationWeeks || durationWeeks <= 0) {
                await respond({ content: "❌ This whitelist item is missing a valid duration in weeks." });
                return;
            }

            const dsaLevel = whitelistType === 'dsa' ? licenseLevel : 0;
            const cmineLevel = whitelistType === 'cmine' ? licenseLevel : 0;

            // Validate whitelist limits before charging the user
            const validation = await sql.addToWhitelist(
                kingdomId,
                continent,
                guildId,
                dsaLevel.toString(),
                cmineLevel.toString(),
                null,
                {
                    durationWeeks,
                    maxDurationWeeks,
                    validateOnly: true
                }
            );

            if (!validation || validation.success === false) {
                let errorMessage = "❌ Unable to apply this whitelist license.";
                if (validation?.reason === 'permanent_exists') {
                    errorMessage = `❌ This kingdom already has a permanent ${whitelistType.toUpperCase()} level ${licenseLevel} license.`;
                } else if (validation?.reason === 'maxduration_exceeded') {
                    const limitLabel = maxDurationWeeks ? `${maxDurationWeeks} weeks` : 'the configured limit';
                    if (validation.waitMs) {
                        const waitUntil = Date.now() + validation.waitMs;
                        const timestamp = Math.floor(waitUntil / 1000);
                        errorMessage = `❌ This purchase would exceed the maximum duration (${limitLabel}) for ${whitelistType.toUpperCase()} level ${licenseLevel}. Try again <t:${timestamp}:R>.`;
                    } else {
                        errorMessage = `❌ This purchase would exceed the maximum duration (${limitLabel}) for ${whitelistType.toUpperCase()} level ${licenseLevel}.`;
                    }
                } else if (validation?.reason === 'invalid_level' || validation?.reason === 'invalid_duration') {
                    errorMessage = "❌ This whitelist item configuration is invalid. Please contact an administrator.";
                }

                await respond({ content: errorMessage });
                return;
            }

            const referenceTime = validation.referenceTime;

            // Attempt to purchase (this will decrease stock if successful)
            const purchaseSuccess = await sql.purchaseShopItem(currentItem.id, guildId, 1);

            if (!purchaseSuccess) {
                await respond({ content: "❌ Purchase failed. Item may be out of stock." });
                return;
            }

            // Deduct points from user
            await sql.deductUserPoints(user.id, guildId, itemPrice, 'shop purchase');

            // Apply whitelist with previously validated plan
            const whitelistResult = await sql.addToWhitelist(
                kingdomId,
                continent,
                guildId,
                dsaLevel.toString(),
                cmineLevel.toString(),
                null,
                {
                    durationWeeks,
                    maxDurationWeeks,
                    referenceTime
                }
            );

            if (!whitelistResult || whitelistResult.success === false) {
                // This should not happen, but if it does, refund user and restore stock
                await sql.query(`UPDATE shop_items SET stock = stock + 1 WHERE id = ? AND guild_id = ?`, [currentItem.id, guildId]);
                await sql.deductUserPoints(user.id, guildId, -itemPrice, 'shop refund');
                console.error('Whitelist application failed post-purchase:', whitelistResult);
                await respond({ content: "❌ Purchase was refunded because the whitelist could not be applied. Please contact an administrator." });
                await refreshShopChannel(guildId, sql, guild);
                return;
            }

            // Get user's remaining balance
            const remainingBalance = await sql.getUserPointsBalance(user.id, guildId);

            await sql.logShopPurchase(guildId, user.id, currentItem.id, 1, itemPrice);

            // Create purchase confirmation embed with appropriate messaging
            const isExtended = whitelistResult && whitelistResult.extended;
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Purchase Successful!")
                .setDescription(`You have successfully purchased **${currentItem.name}** for ${formatNumber(itemPrice)} ${currencyEmoji}`)
                .addFields(
                    { name: "Item", value: currentItem.name, inline: true },
                    { name: "Price", value: `${formatNumber(itemPrice)} ${currencyEmoji}`, inline: true },
                    { name: "Kingdom", value: kingdomName, inline: true },
                    { name: "Whitelist Applied", value: `${whitelistType.toUpperCase()}: Level ${licenseLevel}`, inline: true },
                    { name: "Duration", value: `${durationWeeks} weeks`, inline: true },
                    { name: "Remaining Balance", value: `${formatNumber(remainingBalance)} ${currencyEmoji}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Purchased by ${user.username}`, iconURL: user.displayAvatarURL() });

            if (maxDurationWeeks) {
                embed.addFields({ name: "Max Duration", value: `${maxDurationWeeks} weeks`, inline: true });
            }

            if (currentItem.description) {
                embed.addFields({ name: "Description", value: currentItem.description, inline: false });
            }

            // Add information about license extension or new license
            if (isExtended) {
                embed.addFields({
                    name: "🔄 License Extended",
                    value: `Your existing ${whitelistType.toUpperCase()} Level ${licenseLevel} license has been extended by ${durationWeeks} weeks.`,
                    inline: false
                });
            } else if (whitelistResult.newExpiry) {
                embed.addFields({
                    name: "🆕 New License",
                    value: `A new ${whitelistType.toUpperCase()} Level ${licenseLevel} license has been created.`,
                    inline: false
                });
            }

            if (whitelistResult && whitelistResult.newExpiry) {
                const expiryDate = new Date(whitelistResult.newExpiry);
                const timestamp = Math.floor(expiryDate.getTime() / 1000);
                embed.addFields({ name: "Expires", value: `<t:${timestamp}:F> (<t:${timestamp}:R>)`, inline: true });
            }

            await respond({ content: '', embeds: [embed], components: [] });

            // Log the purchase
            await logShopAction(guildId, sql, guild, 'purchase', user, {
                itemName: currentItem.name,
                price: itemPrice,
                quantity: 1,
                remainingStock: currentItem.stock - 1,
                kingdom: kingdomName,
                whitelistType: whitelistType,
                level: licenseLevel,
                duration: `${durationWeeks} weeks`,
                maxduration: maxDurationWeeks,
                extended: isExtended,
                newExpiry: whitelistResult.newExpiry
            });

            // Refresh the shop channel to update stock
            await refreshShopChannel(guildId, sql, guild);

        } catch (error) {
            console.error('Error applying whitelist purchase:', error);
            try {
                await respond({ content: "❌ There was an error applying the whitelist. Please contact an administrator." });
            } catch (respondError) {
                console.error('Failed to notify user about whitelist error:', respondError);
            }
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
    generateMedalsHistoryCSV({ fromDate, toDate, kingdomSummaries }) {
        const escapeCsvValue = (value) => {
            if (value === null || value === undefined) {
                return '';
            }
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return '"' + stringValue.replace(/"/g, '""') + '"';
            }
            return stringValue;
        };

    const lines = ['sep=,'];
    lines.push('Kingdom ID,Starting Balance,Total Gains,Total Losses,Net Change,Ending Balance,Transactions');

        if (kingdomSummaries.length === 0) {
            lines.push('No medal data in this range,,,,,');
            return lines.join('\n');
        }

        for (const summary of kingdomSummaries) {
            lines.push([
                escapeCsvValue(summary.kingdomId),
                summary.startingBalance,
                summary.totalPositive,
                summary.totalNegative,
                summary.netChange,
                summary.endingBalance,
                summary.transactionCount
            ].join(','));
        }

        return lines.join('\n');
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
                { name: 'C-Mine', value: 'cmine' },
                { name: 'Medal', value: 'medal' }
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
                const choices = names.slice(0, 25).map(n => ({
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
                if (details.maxowned) embed.addFields({ name: "Max Owned", value: details.maxowned.toString(), inline: true });
                if (details.maxduration) embed.addFields({ name: "Max Duration", value: `${details.maxduration} weeks`, inline: true });
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
                if (details.maxowned !== undefined && details.maxowned !== null) embed.addFields({ name: "Max Owned", value: details.maxowned.toString(), inline: true });
                if (details.maxduration !== undefined && details.maxduration !== null) embed.addFields({ name: "Max Duration", value: `${details.maxduration} weeks`, inline: true });
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

            case 'medals_purchased':
                {
                    const formattedCost = (details.totalCost % 1 === 0)
                        ? formatNumber(details.totalCost)
                        : Number(details.totalCost).toFixed(2);
                    embed
                        .setColor(0x00FF00)
                        .setTitle("🏅 Medals Purchased")
                        .setDescription(`<@${user.id}> purchased **${formatNumber(details.quantity)}** medals from **${details.itemName}**`)
                        .addFields(
                            { name: "Total Cost", value: `${formattedCost} ${currencyEmoji}`, inline: true },
                            { name: "Kingdom", value: `${details.kingdom || 'Unknown'}${details.kingdomId ? ` (ID: ${details.kingdomId})` : ''}`, inline: true },
                            { name: "Remaining Stock", value: details.remainingStock?.toString() || 'Unknown', inline: true }
                        );
                }
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
                if (details.maxduration) embed.addFields({ name: "Max Duration", value: `${details.maxduration} weeks`, inline: true });
                if (typeof details.extended === 'boolean') embed.addFields({ name: "Extended", value: details.extended ? 'Yes' : 'No', inline: true });
                if (details.newExpiry) {
                    const expiryDate = new Date(details.newExpiry);
                    const expiryTs = Math.floor(expiryDate.getTime() / 1000);
                    embed.addFields({ name: "Expires", value: `<t:${expiryTs}:F>`, inline: true });
                }
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

                if (item.type && item.type.toLowerCase() === 'medal') {
                    itemValue += `\n🏅 **Type:** Medals (price per medal)`;
                    itemValue += `\n📏 **Per-Kingdom Cap:** ${MAX_MEDALS_PER_KINGDOM.toLocaleString('en-US')}`;
                } else if (item.type) {
                    itemValue += `\n🏷️ **Type:** ${item.type.toUpperCase()}`;
                }

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
