const { SlashCommandBuilder, PermissionFlagsBits, Options, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");


module.exports = {
    data: new SlashCommandBuilder()
        .setName("guild")
        .setDescription("Manage guilds settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("verified-role")
                .setDescription("role to be assigned to verified members")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("Role to be assigned to verified members")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("unverify")
                .setDescription("Set whether to unverify members or not")
                .addBooleanOption((option) =>
                    option
                        .setName("unverify")
                        .setDescription("True = unverify members after X days with no verified account. Use /guild unverified-period.")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create-channels")
                .setDescription("Create verification channel and more")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("accept-log-channel")
                .setDescription("channel to log accepted members and more")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log accepted members and more")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("reject-log-channel")
                .setDescription("channel to log rejected members and more")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log rejected members and more")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("shop-log-channel")
                .setDescription("channel to log shop purchases and transactions")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log shop purchases and transactions")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("announcement-channel")
                .setDescription("channel for bot announcements and notifications")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel for bot announcements and notifications")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("hide-answers")
                .setDescription("Hide the bot's answers to commands")
                .addBooleanOption((option) =>
                    option
                        .setName("hidden")
                        .setDescription("True = hides bot answers")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("show-settings")
                .setDescription("Display all current guild settings")
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("unverified-period")
                .setDescription("Set the period after which users lose their verified role")
                .addIntegerOption((option) =>
                    option
                        .setName("days")
                        .setDescription("Number of days before unverification")
                        .setRequired(true)
                        .setMinValue(1)
                )
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("currency-emoji")
                .setDescription("Set a custom emoji for shop currency")
                .addStringOption((option) =>
                    option
                        .setName("emoji")
                        .setDescription("Custom emoji to use as currency symbol (use default Discord emoji or custom guild emoji)")
                        .setRequired(true)
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
            const guildExistsFlag = await sql.guildExists(guildId);
            if (!guildExistsFlag) {
                await sql.addGuild(guildId, guildName);
            }
            switch (options.getSubcommand()) {
                case "verified-role":
                    {
                        const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "2");
                        if (!subscriptionFlagInfo) {
                            await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription.", flags: 64 });
                            return;
                        }
                        const role = options.getRole("role");
                        const roleId = role.id;
                        const roleName = role.name;
                        await sql.setGuildVerificationRole(roleId, guildId);
                        await interaction.reply({ content: `Role ${roleName} has been set as the verified role.`, ...ephemeral });
                        break;
                    }
                case "create-channels":
                    {
                        await interaction.deferReply({ ...ephemeral });
                        await createGuildChannels(interaction, guild, guildName, guildId, ephemeral, sql);
                        break;
                    }
                case "accept-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildAcceptLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the accept log channel.`, ...ephemeral });
                        break;
                    }
                case "reject-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildRejectLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the reject log channel.`, ...ephemeral });
                        break;
                    }
                case "shop-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildShopLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the shop log channel.`, ...ephemeral });
                        break;
                    }
                case "announcement-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildAnnouncementChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the announcement channel.`, ...ephemeral });
                        break;
                    }
                case "hide-answers":
                    {
                        const hidden = options.getBoolean("hidden");
                        await sql.setEphemeral(hidden, guildId);
                        if (hidden) {
                            await interaction.reply({ content: `Bot answers are now hidden.`, flags: 64 });
                        }
                        else {
                            await interaction.reply({ content: `Bot answers are now visible.` });
                        }
                        break;
                    }
                case "unverify":
                    {
                        const unverifyFlag = options.getBoolean("unverify");
                        await sql.setUnverifyFlag(unverifyFlag, guildId);
                        if (unverifyFlag) {
                            await interaction.reply({ content: `Players will now get their verification role removed if they do not have a verified account on your continent.`, ...ephemeral });
                        }
                        else {
                            await interaction.reply({ content: `No roles will be removed regardless of affiliation or location.`, ...ephemeral });
                        }
                        break;
                    }
                case "unverified-period":
                    {
                        const period = options.getInteger("days");
                        await sql.setUnverifiedPeriod(period, guildId);
                        if (period === 0) {
                            await interaction.reply({ content: `Unverification period has been disabled.`, ...ephemeral });
                        } else {
                            await interaction.reply({ content: `Unverification period set to ${period} day${period === 1 ? '' : 's'}.`, ...ephemeral });
                        }
                        break;
                    }
                case "currency-emoji":
                    {
                        const emoji = options.getString("emoji");
                        
                        // Validate emoji format (either Unicode emoji or Discord custom emoji format)
                        const emojiRegex = /^(?:[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]|<a?:\w+:\d+>)$/u;
                        
                        if (!emojiRegex.test(emoji)) {
                            await interaction.reply({ content: "❌ Invalid emoji format. Please use a standard emoji or a Discord custom emoji format like <:name:id>", flags: 64 });
                            return;
                        }
                        
                        await sql.setGuildCurrencyEmoji(emoji, guildId);
                        
                        // Import and use the refresh function from shop.on.js
                        try {
                            const shopModule = require('./shop.on.js');
                            await shopModule.refreshShopChannel(guildId, sql, guild);
                        } catch (error) {
                            console.log('Could not refresh shop channel automatically:', error);
                        }
                        
                        await interaction.reply({ content: `✅ Currency emoji has been set to ${emoji}. Shop channel has been refreshed with the new emoji.`, ...ephemeral });
                        break;
                    }
                case "show-settings":
                    {
                        // Define channel-related fields
                        const channelFields = [
                            'accept_log_channel',
                            'reject_log_channel',
                            'shop_log_channel',
                            'announcement_channel',
                            'verification_channel',
                            'titles_channel',
                            'pledgers_channel',
                            'buff_channel',
                            'drago_lookup_channel',
                            'shop_channel',
                            'ranking_channel',
                            'cmine_whitelist_channel',
                            'dsa_whitelist_channel'
                        ];

                        // Define emoji fields
                        const emojiFields = ['emoji_id'];

                        const settings = await sql.getGuildSettings(guildId);
                        if (!settings || !settings[0]) {
                            await interaction.reply({ content: "No settings found for this guild.", ...ephemeral });
                            return;
                        }

                        // Filter out guild_id and id, and prepare the settings entries
                        const settingsEntries = Object.entries(settings[0])
                            .filter(([key]) => key !== 'guild_id' && key !== 'id')
                            .map(([key, value]) => {
                                const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                let displayValue;
                                if (channelFields.includes(key)) {
                                    // Handle channel fields by converting to a channel mention
                                    displayValue = (value && value !== '0') ? `<#${value}>` : 'Not set';
                                } else if (emojiFields.includes(key)) {
                                    // Handle emoji fields by displaying the emoji
                                    displayValue = value || '🪙 (default)';
                                } else {
                                    // Handle non-channel fields as before
                                    displayValue = value !== null && value !== undefined ? String(value) : 'Not set';
                                }
                                return { name: displayKey, value: displayValue, inline: false };
                            });

                        if (settingsEntries.length === 0) {
                            await interaction.reply({ content: "No settings to display for this guild.", ...ephemeral });
                            return;
                        }

                        // Split settings into chunks of 25 fields (Discord limit)
                        const chunkSize = 25;
                        const embeds = [];
                        for (let i = 0; i < settingsEntries.length; i += chunkSize) {
                            const chunk = settingsEntries.slice(i, i + chunkSize);
                            const embed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle(`${guildName} Guild Settings`)
                                .setDescription(`Current settings for this guild (Part ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(settingsEntries.length / chunkSize)}):`)
                                .addFields(chunk);
                            embeds.push(embed);
                        }

                        // Send all embeds
                        await interaction.reply({ embeds: [embeds[0]], ...ephemeral });
                        for (let i = 1; i < embeds.length; i++) {
                            await interaction.followUp({ embeds: [embeds[i]], ...ephemeral });
                        }
                        break;
                    }
                default:
                    await interaction.editReply({ content: "Unknown subcommand", ...ephemeral });
                    break;
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "There was an error while changing guild settings! If this is the first time using the /guild command it's normal. It should work if you try again. If it doesn't work several times, please contact support.", flags: 64 });
        }
    },
};

async function createGuildChannels(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        const existingChannels = await guild.channels.fetch();
        const existingChannelIds = existingChannels.map(channel => channel.id);
        const managedChannelsDB = (await sql.getManagedChannels(guildId))[0] || {};

        // Only create channels that are not already in the database and Discord
        if (!managedChannelsDB.verification_channel || !existingChannelIds.includes(managedChannelsDB.verification_channel)) {
            await createVerificationChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.titles_channel || !existingChannelIds.includes(managedChannelsDB.titles_channel)) {
            await createTitlesChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.pledgers_channel || !existingChannelIds.includes(managedChannelsDB.pledgers_channel)) {
            await createPledgersChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.buff_channel || !existingChannelIds.includes(managedChannelsDB.buff_channel)) {
            await createBuffChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.drago_lookup_channel || !existingChannelIds.includes(managedChannelsDB.drago_lookup_channel)) {
            await createDragoLookupChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.shop_channel || !existingChannelIds.includes(managedChannelsDB.shop_channel)) {
            await createShopChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }

        await interaction.followUp({ content: `✅ Channels created or verified for ${guildName}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the channels.", flags: 64 });
    }
}

async function createVerificationChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let verificationChannel = await guild.channels.create({
            name: "verification",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        await sql.setGuildVerificationChannel(verificationChannel.id, guildId);

        // Create embed message
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🔹 Automated Verification of ${guildName}`)
            .setDescription(
                "🇬🇧 **Push 'Verify' to receive instructions in your private messages!**\n" +
                "Please check messages from Lokex for a step-by-step guide."
            )
            .addFields(
                { name: "🇫🇷 French", value: "**Appuyez sur 'Verify' pour recevoir des instructions dans vos messages privés !**\nVeuillez vérifier les messages de Lokex pour un guide étape par étape." },
                { name: "🇪🇸 Spanish", value: "**Presiona 'Verify' para recibir instrucciones en tus mensajes privados!**\nPor favor, revisa los mensajes de Lokex para obtener una guía paso a paso." },
                { name: "🇩🇪 German", value: "**Drücken Sie 'Verify', um Anweisungen in Ihren privaten Nachrichten zu erhalten!**\nBitte überprüfen Sie die Nachrichten von Lokex für eine Schritt-für-Schritt-Anleitung." },
                { name: "🇵🇹 Portuguese", value: "**Pressione 'Verify' para receber instruções em suas mensagens privadas!**\nPor favor, verifique as mensagens de Lokex para um guia passo a passo." },
                { name: "🇷🇺 Russian", value: "**Нажмите 'Verify', чтобы получить инструкции в личных сообщениях!**\nПожалуйста, проверьте сообщения от Lokex для пошагового руководства." },
                { name: "🇮🇷 Persian", value: "**دکمه 'Verify' را فشار دهید تا دستورالعمل‌ها را در پیام‌های خصوصی خود دریافت کنید!**\nلطفاً پیام‌های Lokex را برای راهنمای گام به گام بررسی کنید." },
                { name: "🇨🇳 Chinese", value: "**点击 'Verify' 按钮在您的私信中获取指示！**\n请检查 Lokex 发送的消息以获取分步指南。" }
            )
            .setFooter({ text: "Ask for help in: #open-chat" });


        // Create the "Verify" button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("verify")
                .setLabel("Verify")
                .setStyle(ButtonStyle.Primary)
        );

        // Send message to the new channel
        let message = await verificationChannel.send({ embeds: [embed], components: [row] });

        // Respond to the interaction
        await interaction.followUp({ content: `✅ Verification channel created: ${verificationChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the verification channel.", flags: 64 });
    }
}

async function createTitlesChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        // Create the "titles" channel with appropriate permissions
        let titlesChannel = await guild.channels.create({
            name: "titles-request",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        // Store the channel ID in the database
        await sql.setGuildTitlesChannel(titlesChannel.id, guildId);

        // Create the embed message for the titles panel
        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Matching the color from the image
            .setTitle(`🔹 Titles for ${guildName}`)
            .setDescription(
                "Choose a title, then select the target kingdom. IF you have only one kingdom verified, the title will be delivered directly.\n\n" +
                "1. Click on **Alchemist** 🧪 (for research) or **Architect** 🏰 (for building)\n" +
                "2. Select the target kingdom for the title from the dropdown menu.\n" +
                "3. If the target kingdom is not in the dropdown menu, please click **\"Add Kingdom\"** and follow the instructions to verify it. Once verified, start over at step 1.\n\n" +
                "🚨 **PLEASE NOTE:** The title is reserved for **2 minutes ⏰** then someone else can take it from you. If you finish with the title more quickly, please click **\"Free the Title\"** ❌ so that the others can use it! 🙏"
            )
            .addFields(
                { name: "Alchemist status:", value: "Free", inline: true },
                { name: "Architect status:", value: "Free", inline: true },
                { name: "Titles applied today:", value: "0", inline: false },
                { name: "Titles applied from start:", value: "0", inline: false }
            )
        // .setFooter({ text: "Lokex" });

        // Create the buttons for the panel
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("alchemist_")
                .setLabel("Alchemist")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🧪"),
            new ButtonBuilder()
                .setCustomId("architect_")
                .setLabel("Architect")
                .setStyle(ButtonStyle.Success)
                .setEmoji("🔨"),
            new ButtonBuilder()
                .setCustomId("freetitle_")
                .setLabel("Free the Title")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌")
        );

        // Create the "Add Kingdom" button in a separate row
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("add_kingdom")
                .setLabel("Add Kingdom")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🏰")
        );

        // Send the message to the new titles channel
        let message = await titlesChannel.send({ embeds: [embed], components: [row, row2] });

        // Respond to the interaction
        await interaction.followUp({ content: `✅ Titles channel created: ${titlesChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the titles channel.", flags: 64 });
    }
}

async function createPledgersChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let pledgersChannel = await guild.channels.create({
            name: "pledgers",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        await sql.setGuildPledgersChannel(pledgersChannel.id, guildId);

        await interaction.followUp({ content: `✅ Pledgers channel created: ${pledgersChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the pledgers channel.", flags: 64 });
    }
}

async function createBuffChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let buffChannel = await guild.channels.create({
            name: "buff-status",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        await sql.setGuildBuffChannel(buffChannel.id, guildId);

        await interaction.followUp({ content: `✅ Buff channel created: ${buffChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the buff channel.", flags: 64 });
    }
}

async function createDragoLookupChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let dragoInfoChannel = await guild.channels.create({
            name: "drago-info",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], // Allow sending messages for slash command
                }
            ]
        });

        await sql.setGuildDragoLookupChannel(dragoInfoChannel.id, guildId);

        // Create embed message explaining the /dragolookup command and button
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle("🟢 Drago Info Lookup")
            .setDescription(
                "Use the `/dragolookup` command or click the **Find Drago** button below to look up stats for up to 5 Dragos by ID or link.\n\n" +
                "**Slash Command Example:** `/dragolookup drago1:12345 drago2:23456`\n\n" +
                "**Button:** Click 'Find Drago' to open a modal and enter up to 5 Drago IDs.\n\n" +
                "You will get a detailed embed for each Drago, including level, fusion, legendary parts, and all abilities."
            )
            .setFooter({ text: "Powered by Lokex" });

        // Create the "Find Drago" button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("drago_list")
                .setLabel("Find Drago")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🐉")
        );

        // Send message to the new channel
        await dragoInfoChannel.send({ embeds: [embed], components: [row] });

        await interaction.followUp({ content: `✅ Drago Info channel created: ${dragoInfoChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the Drago Info channel.", flags: 64 });
    }
}

async function createShopChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let shopChannel = await guild.channels.create({
            name: "shop",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        await sql.setGuildShopChannel(shopChannel.id, guildId);

        // Get shop items from database
        const shopItems = await sql.getShopItems(guildId);
        
        // Create embed message for the shop
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🛒 ${guildName} Shop`)
            .setDescription("Welcome to the guild shop! Browse and purchase items below.")
            .setFooter({ text: "Powered by Lokex" });

        // Create buttons for shop items
        const rows = [];
        let currentRow = new ActionRowBuilder();
        let buttonsInRow = 0;

        // Filter items with stock > 0 for display
        const inStockItems = shopItems ? shopItems.filter(item => item.stock > 0) : [];
        
        if (inStockItems.length > 0) {
            // Get currency emoji for buttons
            const currencyEmoji = await sql.getGuildCurrencyEmoji(guildId) || "🪙";
            
            for (const item of inStockItems) {
                const button = new ButtonBuilder()
                    .setCustomId(`shop_buy_${item.id}`)
                    .setLabel(`${item.name} - ${item.price} ${currencyEmoji}`)
                    .setStyle(ButtonStyle.Success);

                // Handle custom emoji for button
                if (currencyEmoji.startsWith('<') && currencyEmoji.endsWith('>')) {
                    // Custom emoji format: <:name:id> or <a:name:id>
                    const emojiMatch = currencyEmoji.match(/<a?:(\w+):(\d+)>/);
                    if (emojiMatch) {
                        button.setEmoji({
                            name: emojiMatch[1],
                            id: emojiMatch[2],
                            animated: currencyEmoji.startsWith('<a:')
                        });
                    } else {
                        button.setEmoji("🪙"); // Fallback
                    }
                } else {
                    // Unicode emoji - use currency emoji as button emoji
                    button.setEmoji(currencyEmoji);
                }

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
                embed.addFields({
                    name: item.name,
                    value: `**Price:** ${item.price} ${currencyEmoji}\n**Stock:** ${item.stock}\n**Description:** ${item.description || 'No description'}`,
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

        // Send message to the new channel
        await shopChannel.send({ embeds: [embed], components: rows });

        await interaction.followUp({ content: `✅ Shop channel created: ${shopChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the shop channel.", flags: 64 });
    }
}