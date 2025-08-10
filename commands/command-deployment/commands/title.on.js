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

        // Handle admin titles (check for admin suffix)
        if (interaction.customId.includes('admin') || ['duke', 'count', 'baron', 'general', 'minister'].includes(action)) {
            return await this.handleAdminButtonInteraction(interaction);
        }

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
                    await this.handleTitleRequest(interaction, 109, 'Alchemist', sql, api);
                    break;
                case 'architect':
                    await this.handleTitleRequest(interaction, 108, 'Architect', sql, api);
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

    async handleAdminButtonInteraction(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const ephemeral = { flags: 64 };

        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: '⚠️ Admin titles are restricted to administrators only!', ...ephemeral });
            return;
        }

        const subscriptionFlagInfo = await sql.checkSubscriptionValid(interaction.guild.id, "2");
        if (!subscriptionFlagInfo) {
            await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription.", flags: 64 });
            return;
        }

        const [action] = interaction.customId.split('_');
        
        const adminTitleMap = {
            'duke': { id: 103, name: 'Duke' },
            'count': { id: 104, name: 'Count' },
            'baron': { id: 105, name: 'Baron' },
            'general': { id: 106, name: 'General' },
            'minister': { id: 107, name: 'Minister' }
        };

        try {
            if (action === 'freetitle') {
                await this.freeAdminTitle(interaction, sql);
            } else if (adminTitleMap[action]) {
                const title = adminTitleMap[action];
                await this.handleAdminTitleRequest(interaction, title.id, title.name, sql, api);
            } else if (action === 'add' && interaction.customId.includes('kingdom_admin')) {
                await interaction.reply({ content: 'Please use the `/verify` command to add and verify new kingdoms.', ...ephemeral });
            }
        } catch (error) {
            console.error(`Error handling admin ${action} button:`, error);
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
            // Deduplicate kingdoms by kingdomId (Discord requires unique option values)
            const uniqueMap = new Map();
            for (const k of kingdoms) {
                if (!uniqueMap.has(k.kingdomId)) {
                    uniqueMap.set(k.kingdomId, k);
                }
            }
            let uniqueKingdoms = Array.from(uniqueMap.values());
            const removedDuplicates = kingdoms.length - uniqueKingdoms.length;

            // Discord max options per select menu is 25
            let truncated = false;
            if (uniqueKingdoms.length > 25) {
                uniqueKingdoms = uniqueKingdoms.slice(0, 25);
                truncated = true;
            }

            const options = uniqueKingdoms.map(k => ({
                label: k.kingdomName.substring(0, 100), // safety trim
                value: k.kingdomId.toString(),
            }));

            if (removedDuplicates > 0) {
                console.log(`[title.on] Deduplicated ${removedDuplicates} duplicate kingdom entries for user ${userId}`);
            }
            if (truncated) {
                console.warn(`[title.on] Truncated kingdom options list to 25 for user ${userId}`);
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_kingdom_${interaction.user.id}_${titleId}`)
                .setPlaceholder('Select a kingdom')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            let notice = 'Please select a kingdom from the dropdown below:';
            if (removedDuplicates > 0) notice += ` (Removed ${removedDuplicates} duplicate${removedDuplicates > 1 ? 's' : ''})`;
            if (truncated) notice += ' (Showing first 25 kingdoms)';
            await interaction.reply({ content: notice, components: [row], flags: 64 });

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

    async handleAdminTitleRequest(interaction, titleId, titleName, sql, api) {
        const userId = interaction.user.id;
        const kingdoms = await sql.checkVerifiedKingdoms(userId, interaction.guild.id);
        if (!kingdoms) {
            await interaction.reply({ content: 'No verified kingdoms found for this user. Use the "Add Kingdom" button to verify one.', flags: 64 });
            return;
        }

        const lastRecord = await sql.getLastTitleUsers().then(records => records.find(r => r.titleId === titleId));
        if (lastRecord && !lastRecord.free && (new Date() - new Date(lastRecord.date)) / 60000 <= 2) {
            await interaction.reply({ content: `${titleName} is reserved. Please wait or free it if it's yours.`, flags: 64 });
            return;
        }

        if (kingdoms.length === 1) {
            await this.applyAdminTitle(interaction, titleId, kingdoms[0].kingdomId, kingdoms[0].kingdomName, titleName, sql, api);
        } else {
            // Deduplicate kingdoms by kingdomId (Discord requires unique option values)
            const uniqueMap = new Map();
            for (const k of kingdoms) {
                if (!uniqueMap.has(k.kingdomId)) {
                    uniqueMap.set(k.kingdomId, k);
                }
            }
            let uniqueKingdoms = Array.from(uniqueMap.values());
            const removedDuplicates = kingdoms.length - uniqueKingdoms.length;

            // Discord max options per select menu is 25
            let truncated = false;
            if (uniqueKingdoms.length > 25) {
                uniqueKingdoms = uniqueKingdoms.slice(0, 25);
                truncated = true;
            }

            const options = uniqueKingdoms.map(k => ({
                label: k.kingdomName.substring(0, 100),
                value: k.kingdomId.toString(),
            }));

            if (removedDuplicates > 0) {
                console.log(`[title.on] (Admin) Deduplicated ${removedDuplicates} duplicate kingdom entries for user ${userId}`);
            }
            if (truncated) {
                console.warn(`[title.on] (Admin) Truncated kingdom options list to 25 for user ${userId}`);
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_admin_kingdom_${interaction.user.id}_${titleId}`)
                .setPlaceholder('Select a kingdom for admin title')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            let notice = `Please select a kingdom for the **${titleName}** title:`;
            if (removedDuplicates > 0) notice += ` (Removed ${removedDuplicates} duplicate${removedDuplicates > 1 ? 's' : ''})`;
            if (truncated) notice += ' (Showing first 25 kingdoms)';
            await interaction.reply({ content: notice, components: [row], flags: 64 });

            const filter = i => i.customId.startsWith(`select_admin_kingdom_${interaction.user.id}_${titleId}`) && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                const selectedKingdomId = i.values[0];
                const selectedKingdom = kingdoms.find(k => k.kingdomId.toString() === selectedKingdomId);

                if (selectedKingdom) {
                    await this.applyAdminTitle(i, titleId, selectedKingdom.kingdomId, selectedKingdom.kingdomName, titleName, sql, api);
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

    async applyAdminTitle(interaction, titleId, kingdomId, kingdomName, titleName, sql, api) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const managerToken = await sql.getQueenToken(guildId);

        if (!managerToken || !managerToken[0]?.token) {
            await interaction.reply({ content: 'No manager token available for this kingdom.', flags: 64 });
            return;
        }

        // Log the admin title request
        await sql.logTitleRequest(titleId, kingdomId, userId, guildId);

        // API call to apply the admin title
        const data = qs.stringify({ code: titleId, targetKingdomId: kingdomId });
        const headers = { 'x-access-token': managerToken[0].token, 'Content-Type': 'application/x-www-form-urlencoded' };
        const response = await api.request('https://api-lok-live.leagueofkingdoms.com/api/shrine/title/change', data, headers);
        console.log('Admin Title API response:', response.data);

        if (response.data.result) {
            await interaction.reply({ content: `👑 **${titleName}** has been applied to **${kingdomName}**! (Admin Title)`, flags: 64 });
            const logChannel = await interaction.guild.channels.fetch((await sql.getGuildLogChannels(interaction.guild.id))[0]?.accept_log_channel);
            if (logChannel) {
                await logChannel.send(`👑 **Admin Title Applied:** ${titleName} has been applied to ${kingdomName} (<@${userId}>)`);
            }
            await this.updateAdminTitlesEmbed(interaction, sql);
        } else {
            await sql.freeTitle(userId, guildId);
            await interaction.reply({ content: 'Failed to apply admin title. Please try again.', flags: 64 });
            await this.updateAdminTitlesEmbed(interaction, sql);
        }
    },

    async freeAdminTitle(interaction, sql) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const result = await sql.freeTitle(userId, guildId);
        if (result.affectedRows > 0) {
            await interaction.reply({ content: '✅ You freed the admin title! Thank you!', flags: 64 });
            await this.updateAdminTitlesEmbed(interaction, sql);
        } else {
            await interaction.reply({ content: 'You have no admin title applied to free!', flags: 64 });
        }
    },

    async freeTitle(interaction, sql) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const result = await sql.freeTitle(userId, guildId);
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
        const alchemistStatus = await this.getTitleStatus(109, sql); // 109 = Alchemist
        const architectStatus = await this.getTitleStatus(108, sql); // 108 = Architect
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
    },

    async updateAdminTitlesEmbed(interaction, sql) {
        const guildId = interaction.guild.id;
        const managedChannels = await sql.getManagedChannels(guildId);
        const adminTitlesChannelId = managedChannels[0]?.admin_titles_channel;
        if (!adminTitlesChannelId) return;

        const adminTitlesChannel = await interaction.guild.channels.fetch(adminTitlesChannelId);
        if (!adminTitlesChannel) return;

        // Fetch the latest message in the admin titles channel
        const messages = await adminTitlesChannel.messages.fetch({ limit: 1 });
        const message = messages.first();
        if (!message || !message.embeds.length) return;

        // Get current admin title statuses and counters
        const dukeStatus = await this.getTitleStatus(103, sql); // 103 = Duke
        const countStatus = await this.getTitleStatus(104, sql); // 104 = Count
        const baronStatus = await this.getTitleStatus(105, sql); // 105 = Baron
        const generalStatus = await this.getTitleStatus(106, sql); // 106 = General
        const ministerStatus = await this.getTitleStatus(107, sql); // 107 = Minister
        const adminTitlesAppliedToday = await sql.getAdminTitlesToday(guildId);
        const adminTitlesAppliedTotal = await sql.getAdminTitlesTotal(guildId);

        // Update the embed
        const updatedEmbed = new EmbedBuilder()
            .setColor(0xFF0000) // Red color for admin titles
            .setTitle(`🔹 Admin Titles for ${interaction.guild.name}`)
            .setDescription(
                "Choose an admin title, then select the target kingdom. IF you have only one kingdom verified, the title will be delivered directly.\n\n" +
                "1. Click on **Duke** 👑, **Count** 🎩, **Baron** ⚔️, **General** 🛡️, or **Minister** 📜\n" +
                "2. Select the target kingdom for the title from the dropdown menu.\n" +
                "3. If the target kingdom is not in the dropdown menu, please click **\"Add Kingdom\"** and follow the instructions to verify it. Once verified, start over at step 1.\n\n" +
                "🚨 **PLEASE NOTE:** The title is reserved for **2 minutes ⏰** then someone else can take it from you. If you finish with the title more quickly, please click **\"Free the Title\"** ❌ so that the others can use it! 🙏\n\n" +
                "⚠️ **ADMIN ONLY:** These titles are reserved for administrators."
            )
            .addFields(
                { name: "Duke status:", value: dukeStatus, inline: true },
                { name: "Count status:", value: countStatus, inline: true },
                { name: "Baron status:", value: baronStatus, inline: true },
                { name: "General status:", value: generalStatus, inline: true },
                { name: "Minister status:", value: ministerStatus, inline: true },
                { name: "Admin titles applied today:", value: adminTitlesAppliedToday[0].count.toString(), inline: false },
                { name: "Admin titles applied from start:", value: adminTitlesAppliedTotal[0].count.toString(), inline: false }
            );

        // Edit the existing message
        await message.edit({ embeds: [updatedEmbed] });
    }
};