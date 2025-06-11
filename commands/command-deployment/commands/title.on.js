const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const qs = require('qs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('title')
        .setDescription('Manage and request in-game titles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const guildId = interaction.guild?.id ?? null;
        if (!guildId) {
            await interaction.reply({ content: 'This command can only be used in a server.', flags: 64 });
            return;
        }
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        try {
            await interaction.deferReply({ ...ephemeral });

            const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "2");
            if (!subscriptionFlagInfo) {
                await interaction.editReply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription.", flags: 64 });
                return;
            }

            // Create or update the titles panel
            const guildSettings = await sql.getGuildLogChannels(guildId);
            const titlesChannelId = guildSettings[0]?.titles_channel;
            if (!titlesChannelId) {
                await interaction.editReply({ content: 'Titles channel not set. Use `/guild create-channels` to set it up.', ...ephemeral });
                return;
            }

            const titlesChannel = await interaction.guild.channels.fetch(titlesChannelId);
            if (!titlesChannel) {
                await interaction.editReply({ content: 'Titles channel not found. Please recreate it with `/guild create-channels`.', ...ephemeral });
                return;
            }

            // Fetch title statuses and usage stats
            const alchemistStatus = await this.getTitleStatus(108, sql); // 108 = Alchemist
            const architectStatus = await this.getTitleStatus(109, sql); // 109 = Architect
            const titlesAppliedToday = await this.getTitlesAppliedToday(guildId, sql);
            const titlesAppliedTotal = await this.getTitlesAppliedTotal(sql);

            // Create the embed
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`🔹 Titles for ${interaction.guild.name}`)
                .setDescription(
                    "Choose a title, then select the target kingdom. If you have only one kingdom verified, the title will be delivered directly.\n\n" +
                    "1. Click on **Alchemist** 🧪 (for research) or **Architect** 🏰 (for building)\n" +
                    "2. Select the target kingdom for the title from the dropdown menu (to be implemented).\n" +
                    "3. If the target kingdom is not in the dropdown menu, please click **\"Add Kingdom\"** (handled by /verify command) and follow the instructions to verify it. Once verified, start over at step 1.\n\n" +
                    "🚨 **PLEASE NOTE:** The title is reserved for **2 minutes ⏰** then someone else can take it from you. If you finish with the title more quickly, please click **\"Free the Title\"** ❌ so that others can use it! 🙏"
                )
                .addFields(
                    { name: "Alchemist status:", value: alchemistStatus, inline: true },
                    { name: "Architect status:", value: architectStatus, inline: true },
                    { name: "Titles applied today:", value: titlesAppliedToday.toString(), inline: false },
                    { name: "Titles applied from start:", value: titlesAppliedTotal.toString(), inline: false }
                )
                .setFooter({ text: "Lokex" });

            // Create the buttons
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`alchemist_${interaction.user.id}`)
                    .setLabel("Alchemist")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("🧪"),
                new ButtonBuilder()
                    .setCustomId(`architect_${interaction.user.id}`)
                    .setLabel("Architect")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji("🔨"),
                new ButtonBuilder()
                    .setCustomId(`freetitle_${interaction.user.id}`)
                    .setLabel("Free the Title")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji("❌")
            );

            // Send or update the message in the titles channel
            const message = await titlesChannel.send({ embeds: [embed], components: [row] });
            // await interaction.editReply({ content: `Titles panel updated in ${titlesChannel}.`, ...ephemeral });

        } catch (error) {
            console.error('Title command error:', error);
            await interaction.editReply({ content: 'There was an error setting up the titles panel.', ...ephemeral });
        }
    },

    async getTitleStatus(titleId, sql) {
        const lastRecord = await sql.checkTitleStatus(titleId);
        if (!lastRecord || lastRecord.free === 1) return 'Free';
        const timeDiff = (new Date() - new Date(lastRecord.date)) / 60000; // Difference in minutes
        return timeDiff > 2 ? 'Free' : `Reserved by <@${lastRecord.discordId}> (${Math.ceil(2 - timeDiff)}m left)`;
    },

    async getTitlesAppliedToday(guildId, sql) {
        const result = await sql.getTitlesToday(guildId);
        return result[0].count;
    },

    async getTitlesAppliedTotal(guildId, sql) {
        const result = await sql.getTitlesTotal(guildId);
        return result[0].count;
    },

    async handleButtonInteraction(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const [action, userId] = interaction.customId.split('_');
        const ephemeral = { flags: 64 };

        if (interaction.user.id !== userId && userId !== '') {
            await interaction.reply({ content: 'This button is not for you!', ...ephemeral });
            return;
        }
        
        // console.log('interaction', interaction.guild.id);

        const subscriptionFlagInfo = await sql.checkSubscriptionValid(interaction.guild.id, "2");
        // console.log('Subscription flag info:', subscriptionFlagInfo);
        if (!subscriptionFlagInfo) {
            await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription.", flags: 64 });
            return;
        }

        try {
            switch (action) {
                case 'alchemist':
                    await this.handleTitleRequest(interaction, 109, 'Architect', sql, api);
                    break;
                case 'architect':
                    await this.handleTitleRequest(interaction, 108, 'Alchemist', sql, api);
                    break;
                case 'freetitle':
                    await this.freeTitle(interaction, sql);
                    break;
            }
        } catch (error) {
            console.error(`Error handling ${action} button:`, error);
            await interaction.reply({ content: 'An error occurred.', ...ephemeral });
        }
    },

    async handleTitleRequest(interaction, titleId, titleName, sql, api) {
        const userId = interaction.user.id;
        const kingdoms = await sql.checkVerifiedKingdoms(userId, interaction.guild.id);
        if (!kingdoms) {
            await interaction.reply({ content: 'No verified kingdoms found for this user. Use the "Add Kingdom" button to verify one.', flags: 64 });
            return;
        }

        const lastRecord = await sql.getLastTitleUsers().then(records => records.find(r => r.titleId === titleId));
        if (lastRecord && !lastRecord.free && (new Date() - new Date(lastRecord.date)) / 60000 <= 2) {
            await interaction.reply({ content: `${titleName} is reserved. Please wait or free it if it’s yours.`, flags: 64 });
            return;
        }

        if (kingdoms.length === 1) {
            await this.applyTitle(interaction, titleId, kingdoms[0].kingdomId, kingdoms[0].kingdomName, titleName, sql, api);
        } else {
            const options = kingdoms.map(kingdom => ({
                label: kingdom.kingdomName,
                value: kingdom.kingdomId.toString(),
            }));

            console.log('Options:', options);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_kingdom_${interaction.user.id}_${titleId}`)
                .setPlaceholder('Select a kingdom')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({ content: 'Please select a kingdom from the dropdown below:', components: [row], flags: 64 });

            const filter = i => i.customId.startsWith(`select_kingdom_${interaction.user.id}_${titleId}`) && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                const selectedKingdomId = i.values[0];
                const selectedKingdom = kingdoms.find(k => k.kingdomId.toString() === selectedKingdomId);

                if (selectedKingdom) {
                    await this.applyTitle(i, titleId, selectedKingdom.kingdomId, selectedKingdom.kingdomName, titleName, sql, api);
                } else {
                    await i.reply({ content: 'Invalid selection. Please try again.', flags: 64 });
                }

                collector.stop();
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.followUp({ content: 'No selection was made. Please try again.', flags: 64 });
                }
            });

        }
    },

    async applyTitle(interaction, titleId, kingdomId, kingdomName, titleName, sql, api) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const managerToken = await sql.getQueenToken(guildId);

        if (!managerToken || !managerToken[0]?.token) {
            await interaction.reply({ content: 'No manager token available for this kingdom.', flags: 64 });
            return;
        }

        // Log the title request
        await sql.logTitleRequest(titleId, kingdomId, userId, guildId);

        // API call to apply the title (replace with correct endpoint)
        const data = qs.stringify({ code: titleId, targetKingdomId: kingdomId });
        const headers = { 'x-access-token': managerToken[0].token, 'Content-Type': 'application/x-www-form-urlencoded' };
        const response = await api.request('https://api-lok-live.leagueofkingdoms.com/api/shrine/title/change', data, headers);
        console.log('Title API response:', response.data);

        if (response.data.result) {
            await interaction.reply({ content: `${titleName} has been applied to ${kingdomName}!`, flags: 64 });
            const titlesChannel = await interaction.guild.channels.fetch((await sql.getGuildLogChannels(interaction.guild.id))[0]?.accept_log_channel);
            await titlesChannel.send(`${titleName} has been applied to ${kingdomName} (<@${userId}>)`);
            await this.updateTitlesEmbed(interaction, sql);
        } else {
            await sql.freeTitle(guildId, userId);
            await interaction.reply({ content: 'Failed to apply title. Please try again.', flags: 64 });
            await this.updateTitlesEmbed(interaction, sql)
        }
    },

    async freeTitle(interaction, sql) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const result = await sql.freeTitle(userId, guildId);
        console.log(result);
        if (result.affectedRows > 0) {
            await interaction.reply({ content: 'You freed the title! Thank you!', flags: 64 });
            await this.updateTitlesEmbed(interaction, sql);
        } else {
            await interaction.reply({ content: 'You have no title applied to free!', flags: 64 });
        }
    },

    async updateTitlesEmbed(interaction) {
        const sql = module.exports.sql;
        const guildId = interaction.guild.id;
        const guildSettings = await sql.getGuildLogChannels(guildId);
        const titlesChannelId = guildSettings[0]?.titles_channel;
        if (!titlesChannelId) return;

        const titlesChannel = await interaction.guild.channels.fetch(titlesChannelId);
        if (!titlesChannel) return;

        // Fetch the latest message in the channel (assuming it's the embed)
        const messages = await titlesChannel.messages.fetch({ limit: 1 });
        const message = messages.first();
        if (!message || !message.embeds.length) return;

        // Get current title statuses and counters
        const alchemistStatus = await this.getTitleStatus(108, sql); // 108 = Alchemist
        const architectStatus = await this.getTitleStatus(109, sql); // 109 = Architect
        const titlesAppliedToday = await this.getTitlesAppliedToday(guildId, sql);
        const titlesAppliedTotal = await this.getTitlesAppliedTotal(guildId, sql);

        // Update the embed
        const updatedEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🔹 Titles for ${interaction.guild.name}`)
            .setDescription(
                "Choose a title, then select the target kingdom. If you have only one kingdom verified, the title will be delivered directly.\n\n" +
                "1. Click on **Alchemist** 🧪 (for research) or **Architect** 🏰 (for building)\n" +
                "2. Select the target kingdom for the title from the dropdown menu.\n" +
                "3. If the target kingdom is not in the dropdown menu, please click **\"Add Kingdom\"** and follow the instructions to verify it. Once verified, start over at step 1.\n\n" +
                "🚨 **PLEASE NOTE:** The title is reserved for **2 minutes ⏰** then someone else can take it from you. If you finish with the title more quickly, please click **\"Free the Title\"** ❌ so that others can use it! 🙏"
            )
            .addFields(
                { name: "Alchemist status:", value: alchemistStatus, inline: true },
                { name: "Architect status:", value: architectStatus, inline: true },
                { name: "Titles applied today:", value: titlesAppliedToday.toString(), inline: false },
                { name: "Titles applied from start:", value: titlesAppliedTotal.toString(), inline: false }
            );

        // Edit the existing message
        await message.edit({ embeds: [updatedEmbed] });
    }
};