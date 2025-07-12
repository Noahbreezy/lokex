const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");

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
                        .setDescription("New description of the item")
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
            const adminOnlyCommands = ['add', 'edit', 'remove', 'list', 'refresh', 'history', 'addpoints'];
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

                        await sql.addShopItem(guildId, name, price, stock, description, type, level, duration);
                        const items = await sql.getShopItems(guildId);
                        const addedItem = items.find(i => i.name === name && i.price === price && i.stock === stock);
                        const itemIdMsg = addedItem ? ` (ID: ${addedItem.id})` : '';
                        await interaction.reply({ content: `✅ Item "${name}"${itemIdMsg} added to shop with price ${Math.floor(price)} ${currencyEmoji} and stock ${stock}.`, ...ephemeral });
                        
                        // Refresh shop channel if it exists
                        await refreshShopChannel(guildId, sql, guild);
                        break;
                    }
                case "edit":
                    {
                        const itemSelection = options.getString("item");
                        const itemId = parseInt(itemSelection);
                        const name = options.getString("name");
                        const price = options.getNumber("price");
                        const stock = options.getInteger("stock");
                        const description = options.getString("description");
                        const type = options.getString("type");
                        const level = options.getInteger("level");
                        const duration = options.getInteger("duration");

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
                        const updatedDescription = description !== null ? description : currentItem.description;
                        const updatedType = type !== null ? type : currentItem.type;
                        const updatedLevel = level !== null ? level : currentItem.level;
                        const updatedDuration = duration !== null ? duration : currentItem.duration;

                        await sql.updateShopItem(itemId, guildId, updatedName, updatedPrice, updatedStock, updatedDescription, updatedType, updatedLevel, updatedDuration);
                        await interaction.reply({ content: `✅ Item "${updatedName}" (ID: ${itemId}) updated successfully.`, ...ephemeral });
                        
                        // Refresh shop channel if it exists
                        await refreshShopChannel(guildId, sql, guild);
                        break;
                    }
                case "remove":
                    {
                        const itemSelection = options.getString("item");
                        const itemId = parseInt(itemSelection);
                        
                        // Check if item exists
                        const item = await sql.getShopItem(itemId, guildId);
                        if (!item) {
                            await interaction.reply({ content: "❌ Item not found.", flags: 64 });
                            return;
                        }

                        await sql.deleteShopItem(itemId, guildId);
                        await interaction.reply({ content: `✅ Item "${item.name}" (ID: ${itemId}) removed from shop.`, ...ephemeral });
                        
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

                        const embed = new EmbedBuilder()
                            .setColor(0xFFD700)
                            .setTitle(`🛒 ${guildName} Shop Items`)
                            .setDescription("List of all shop items:")
                            .setTimestamp();

                        let description = "";
                        for (const item of items) {
                            description += `**ID:** ${item.id} | **${item.name}** - ${Math.floor(item.price)} ${currencyEmoji}\n`;
                            description += `Stock: ${item.stock}`;
                            if (item.type) description += ` | Type: ${item.type}`;
                            if (item.level) description += ` | Level: ${item.level}`;
                            if (item.duration) description += ` | Duration: ${item.duration} weeks`;
                            description += `\n${item.description || 'No description'}\n\n`;
                        }

                        embed.setDescription(description);
                        await interaction.reply({ embeds: [embed], ...ephemeral });
                        break;
                    }
                case "refresh":
                    {
                        const success = await refreshShopChannel(guildId, sql, guild);
                        if (success) {
                            await interaction.reply({ content: "✅ Shop channel refreshed successfully.", ...ephemeral });
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
                            const date = new Date(purchase.created_at).toLocaleDateString();
                            description += `**${purchase.item_name}** x${purchase.quantity} - ${Math.floor(purchase.total_price)} ${currencyEmoji}\n`;
                            description += `User: <@${purchase.user_id}> | Date: ${date}\n\n`;
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
                            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
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
                            .setDescription(`${targetUser ? `**${checkUsername}**` : 'You'} currently ${targetUser ? 'has' : 'have'} **${Math.floor(balance)} ${currencyEmoji}**`)
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
                            .setDescription(`Successfully ${isAdding ? 'added' : 'removed'} **${Math.floor(absAmount)} ${currencyEmoji}** ${isAdding ? 'to' : 'from'} <@${targetUser.id}>.\n\n**Reason:** ${reason}`)
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ...ephemeral });
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
            
            // Get item details
            const item = await sql.getShopItem(itemId, guildId);
            if (!item) {
                await interaction.reply({ content: "❌ Item not found.", flags: 64 });
                return;
            }

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
                    content: `❌ Insufficient funds! You have ${userBalanceInt} ${currencyEmoji} but need ${itemPrice} ${currencyEmoji} to purchase this item.`, 
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
            await this.applyWhitelistPurchase(interaction, item, kingdoms[0].kingdomId, kingdoms[0].kingdomName, currencyEmoji, sql);
        } else {
            // Multiple kingdoms, show selection menu
            const options = kingdoms.map(kingdom => ({
                label: kingdom.kingdomName,
                value: kingdom.kingdomId.toString(),
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_kingdom_shop_${user.id}_${item.id}`)
                .setPlaceholder('Select a kingdom for the whitelist')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({ 
                content: `Please select which kingdom should receive the ${item.type.toUpperCase()} whitelist for **${item.name}**:`, 
                components: [row], 
                flags: 64 
            });

            // Set up collector for kingdom selection
            const filter = i => i.customId.startsWith(`select_kingdom_shop_${user.id}_${item.id}`) && i.user.id === user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                const selectedKingdomId = i.values[0];
                const selectedKingdom = kingdoms.find(k => k.kingdomId.toString() === selectedKingdomId);

                if (selectedKingdom) {
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
            await sql.addToWhitelist(kingdomId, continent, guildId, dsaLevel.toString(), cmineLevel.toString(), expiry);

            // Get user's remaining balance
            const remainingBalance = await sql.getUserPointsBalance(user.id, guildId);

            // Create purchase confirmation embed
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Purchase Successful!")
                .setDescription(`You have successfully purchased **${item.name}** for ${Math.floor(item.price)} ${currencyEmoji}`)
                .addFields(
                    { name: "Item", value: item.name, inline: true },
                    { name: "Price", value: `${Math.floor(item.price)} ${currencyEmoji}`, inline: true },
                    { name: "Kingdom", value: kingdomName, inline: true },
                    { name: "Whitelist Applied", value: `${whitelistType.toUpperCase()}: Level ${item.level || 1}`, inline: true },
                    { name: "Duration", value: item.duration ? `${item.duration} weeks` : "Permanent", inline: true },
                    { name: "Remaining Balance", value: `${Math.floor(remainingBalance)} ${currencyEmoji}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Purchased by ${user.username}`, iconURL: user.displayAvatarURL() });

            if (item.description) {
                embed.addFields({ name: "Description", value: item.description, inline: false });
            }

            if (expiry) {
                const expiryDate = new Date(expiry);
                embed.addFields({ name: "Expires", value: expiryDate.toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }), inline: true });
            }

            await interaction.reply({ embeds: [embed], flags: 64 });

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
                .setDescription(`You have successfully purchased **${item.name}** for ${Math.floor(item.price)} ${currencyEmoji}`)
                .addFields(
                    { name: "Item", value: item.name, inline: true },
                    { name: "Price", value: `${Math.floor(item.price)} ${currencyEmoji}`, inline: true },
                    { name: "Quantity", value: "1", inline: true },
                    { name: "Remaining Balance", value: `${Math.floor(remainingBalance)} ${currencyEmoji}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Purchased by ${user.username}`, iconURL: user.displayAvatarURL() });

            if (item.description) {
                embed.addFields({ name: "Description", value: item.description, inline: false });
            }

            await interaction.reply({ embeds: [embed], flags: 64 });

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
                // Get currency emoji for this guild
                const currencyEmoji = await getCurrencyEmoji(guildId, sql);
                
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
                        let displayName = `${item.name} (ID: ${item.id}, Stock: ${item.stock}, Price: ${Math.floor(item.price)} ${currencyEmoji}`;
                        if (item.type) displayName += `, Type: ${item.type}`;
                        if (item.level) displayName += `, Lvl: ${item.level}`;
                        if (item.duration) displayName += `, ${item.duration}w`;
                        displayName += ')';
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
        }
    },
    refreshShopChannel,
};

// Helper function to get currency emoji for a guild
async function getCurrencyEmoji(guildId, sql) {
    const customEmoji = await sql.getGuildCurrencyEmoji(guildId);
    return customEmoji || "🪙"; // Default to coin emoji if no custom emoji is set
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
                    .setLabel(`${Math.floor(item.price)} - ${item.name}`)
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
                let itemValue = `**Price:** ${Math.floor(item.price)} ${currencyEmoji}\n**Stock:** ${item.stock}`;
                itemValue += `\n**Description:** ${item.description || 'No description'}`;
                
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
