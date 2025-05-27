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
                        .setDescription("True = unverify members after 7D with no verified account in the continent")
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
                .setName("hide-answers")
                .setDescription("Hide the bot's answers to commands")
                .addBooleanOption((option) =>
                    option
                        .setName("hidden")
                        .setDescription("True = hides bot answers")
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const { commandName, options, guildId, user } = interaction;
        const userId = user.id;
        const guild = interaction.guild;
        const guildName = interaction.guild.name;
        const userName = user.username;
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
                default:
                    await interaction.editReply({ content: "Unknown subcommand", ...ephemeral });
                    break;
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "There was an error while changing guild settings! If this is the first time using the /guild command it's normal. It should work if you try again.", flags: 64 });
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