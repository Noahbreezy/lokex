const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require("discord.js");

// Helper for autocomplete
async function handleNameAutocomplete(interaction, sql) {
    const focusedValue = interaction.options.getFocused();
    const names = await sql.searchKingdomName(focusedValue);
    const choices = names.slice(0, 25).map(nameObj => ({
        name: nameObj.name || 'Unknown',
        value: nameObj.kingdomId || 'Unknown'
    }));
    await interaction.respond(choices);
}

// Helper to parse expiry date
function parseExpiryDate(expiryString) {
    if (!expiryString) return null;

    try {
        // Handle YYYY-MM-DD format (set time to 23:59:59)
        if (/^\d{4}-\d{2}-\d{2}$/.test(expiryString)) {
            const date = new Date(expiryString + ' 23:59:59');
            return date.toISOString().slice(0, 19).replace('T', ' ');
        }

        // Handle YYYY-MM-DD HH:MM format
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(expiryString)) {
            const date = new Date(expiryString + ':00');
            return date.toISOString().slice(0, 19).replace('T', ' ');
        }

        // Handle YYYY-MM-DD HH:MM:SS format
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(expiryString)) {
            const date = new Date(expiryString);
            return date.toISOString().slice(0, 19).replace('T', ' ');
        }

        return null;
    } catch (error) {
        return null;
    }
}

// Helper to format expiry date for display
function formatExpiryForDisplay(expiry) {
    if (!expiry) return "No expiry";
    const date = new Date(expiry);
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}-${month}-${year} ${hours}:${minutes}`;
}

// Helper to format expiry as Discord timestamp
function formatExpiryAsDiscordTimestamp(expiry) {
    if (!expiry) return "Permanent";
    const date = new Date(expiry);
    const unixTimestamp = Math.floor(date.getTime() / 1000);
    return `<t:${unixTimestamp}:R>`;
}

// Helper to create paginated whitelist embed
function createWhitelistEmbed(whitelist, page, totalPages) {
    const ITEMS_PER_PAGE = 10;
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, whitelist.length);
    const currentItems = whitelist.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setTitle('📋 Whitelist')
        .setColor(0x00AE86)
        .setFooter({ text: `Page ${page + 1} of ${totalPages} • Total: ${whitelist.length} kingdoms` });

    if (currentItems.length === 0) {
        embed.setDescription('No kingdoms found on this page.');
        return embed;
    }

    const description = currentItems.map((w, i) => {
        const globalIndex = startIndex + i + 1;
        const kingdomName = (w.name ? w.name : w.kingdomid).trim();
        let line = `**${globalIndex}**. **${kingdomName}**`;

        // Show DSA level and expiry inline
        if (w.dsa > 0) {
            if (w.dsa_expiry) {
                line += `\n   🐉 DSA: ${w.dsa} until ${formatExpiryAsDiscordTimestamp(w.dsa_expiry)}`;
            } else {
                line += `\n   🐉 DSA: ${w.dsa}`;
            }
        } else {
            line += `\n   🐉 DSA: ${w.dsa}`;
        }

        // Show CMine level and expiry inline
        if (w.cmine > 0) {
            if (w.cmine_expiry) {
                line += `\n   💎 CMine: ${w.cmine} until ${formatExpiryAsDiscordTimestamp(w.cmine_expiry)}`;
            } else {
                line += `\n   💎 CMine: ${w.cmine}`;
            }
        } else {
            line += `\n   💎 CMine: ${w.cmine}`;
        }

        return line;
    }).join('\n\n');

    embed.setDescription(description);
    return embed;
}

// Helper to create navigation buttons
function createNavigationButtons(currentPage, totalPages) {
    const row = new ActionRowBuilder();

    const leftButton = new ButtonBuilder()
        .setCustomId('whitelist_prev')
        .setLabel('◀️ Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0);

    const rightButton = new ButtonBuilder()
        .setCustomId('whitelist_next')
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === totalPages - 1);

    const pageButton = new ButtonBuilder()
        .setCustomId('whitelist_page_info')
        .setLabel(`${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

    row.addComponents(leftButton, pageButton, rightButton);
    return row;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("whitelist")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDescription("Manage Whitelist")
        .addSubcommand((subcommand) =>
            subcommand.setName("list").setDescription("List Whitelist")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Whitelist a user")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("The user's ingame name (select from the list) or kingdomid")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option.setName("dsa")
                        .setDescription("DSA whitelist level (0-5)")
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(5)
                )
                .addIntegerOption(option =>
                    option.setName("cmine")
                        .setDescription("CMine whitelist level (0-5)")
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(5)
                )
                .addStringOption(option =>
                    option.setName("expiry")
                        .setDescription("Expiry date (YYYY-MM-DD HH:MM or YYYY-MM-DD, leave empty for no expiry)")
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove from whitelist")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("The user's ingame name (select from the list) or kingdomid")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("bulkadd")
                .setDescription("Bulk add kingdoms to the whitelist")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("bulkremove")
                .setDescription("Bulk remove kingdoms from the whitelist")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("reset")
                .setDescription("Reset all whitelisted kingdoms for this guild (set DSA and CMine to 0)")
        ),

    async execute(interaction) {
        try {
            const sql = module.exports.sql;
            const { options } = interaction;
            const guild = interaction.guild.id;

            // Don't defer for bulk operations as they show modals immediately
            const subcommand = options.getSubcommand();
            const shouldDefer = !['bulkadd', 'bulkremove'].includes(subcommand);

            const ephemeralFlag = await sql.getEphemeral(guild);
            const ephemeral = ephemeralFlag ? { flags: 64 } : {};

            if (shouldDefer) {
                await interaction.deferReply(ephemeral);
            }

            // Get continent for this guild
            const continentArr = await sql.getGuildContinents(guild);
            const continent = continentArr && continentArr.length > 0 ? continentArr[0].continent : null;
            if (!continent) {
                if (shouldDefer) {
                    await interaction.editReply({ content: "No continent linked to this guild." });
                } else {
                    await interaction.reply({ content: "No continent linked to this guild.", flags: 64 });
                }
                return;
            }

            const subscriptionFlagInfo = await sql.checkSubscriptionValid(guild, "5");
            if (!subscriptionFlagInfo) {
                const message = "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription.";
                if (shouldDefer) {
                    await interaction.editReply({ content: message });
                } else {
                    await interaction.reply({ content: message, flags: 64 });
                }
                return;
            }

            switch (options.getSubcommand()) {
                case "remove": {
                    const kingdomId = options.getString("name");
                    // Get the latest name for display
                    const nameResult = await sql.getKingdomName(kingdomId);
                    const displayName = (nameResult && nameResult[0] && nameResult[0].name) ? nameResult[0].name : kingdomId;
                    await sql.removeFromWhitelist(kingdomId, continent, guild);
                    await interaction.editReply({
                        content: `${displayName} has been removed from the whitelist.`
                    });
                    break;
                }
                case "add": {
                    const kingdomId = options.getString("name");
                    let dsa = options.getInteger("dsa");
                    let cmine = options.getInteger("cmine");
                    const expiryString = options.getString("expiry");

                    // Ensure values are between 0 and 5
                    if (dsa < 0) dsa = 0;
                    if (dsa > 5) dsa = 5;
                    if (cmine < 0) cmine = 0;
                    if (cmine > 5) cmine = 5;

                    // Parse expiry date
                    const expiry = parseExpiryDate(expiryString);
                    if (expiryString && !expiry) {
                        await interaction.editReply({
                            content: "Invalid expiry date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM"
                        });
                        return;
                    }

                    // Check if expiry is in the future
                    if (expiry && new Date(expiry) <= new Date()) {
                        await interaction.editReply({
                            content: "Expiry date must be in the future."
                        });
                        return;
                    }

                    // Get the latest name for display
                    const nameResult = await sql.getKingdomName(kingdomId);
                    const displayName = (nameResult && nameResult[0] && nameResult[0].name) ? nameResult[0].name : kingdomId;

                    const result = await sql.addToWhitelist(kingdomId, continent, guild, dsa.toString(), cmine.toString(), expiry);

                    let responseContent = `${displayName} has been whitelisted (DSA: ${dsa}, CMine: ${cmine})`;

                    if (result && result.extended) {
                        responseContent = `${displayName} license extended (DSA: ${dsa}, CMine: ${cmine})`;
                        if (result.newExpiry) {
                            responseContent += ` until ${formatExpiryAsDiscordTimestamp(result.newExpiry)}`;
                        }
                    } else {
                        if (expiry) {
                            responseContent += ` until ${formatExpiryAsDiscordTimestamp(expiry)}`;
                        }
                    }
                    responseContent += ".";

                    await interaction.editReply({
                        content: responseContent
                    });
                    break;
                }
                case "list": {
                    const whitelist = await sql.getWhitelist(guild, continent);
                    if (!whitelist || whitelist.length === 0) {
                        const emptyEmbed = new EmbedBuilder()
                            .setTitle('📋 Whitelist')
                            .setDescription('Whitelist is empty.')
                            .setColor(0xFF6B6B);
                        await interaction.editReply({ embeds: [emptyEmbed] });
                        return;
                    }

                    const ITEMS_PER_PAGE = 10;
                    const totalPages = Math.ceil(whitelist.length / ITEMS_PER_PAGE);
                    let currentPage = 0;

                    const embed = createWhitelistEmbed(whitelist, currentPage, totalPages);
                    const buttons = createNavigationButtons(currentPage, totalPages);

                    const response = await interaction.editReply({
                        embeds: [embed],
                        components: totalPages > 1 ? [buttons] : []
                    });

                    if (totalPages > 1) {
                        const collector = response.createMessageComponentCollector({
                            componentType: ComponentType.Button,
                            time: 300000 // 5 minutes
                        });

                        collector.on('collect', async (buttonInteraction) => {
                            if (buttonInteraction.user.id !== interaction.user.id) {
                                await buttonInteraction.reply({
                                    content: 'You cannot use these buttons.',
                                    flags: 64
                                });
                                return;
                            }

                            if (buttonInteraction.customId === 'whitelist_prev') {
                                currentPage = Math.max(0, currentPage - 1);
                            } else if (buttonInteraction.customId === 'whitelist_next') {
                                currentPage = Math.min(totalPages - 1, currentPage + 1);
                            }

                            const newEmbed = createWhitelistEmbed(whitelist, currentPage, totalPages);
                            const newButtons = createNavigationButtons(currentPage, totalPages);

                            await buttonInteraction.update({
                                embeds: [newEmbed],
                                components: [newButtons]
                            });
                        });

                        collector.on('end', async () => {
                            try {
                                const disabledButtons = createNavigationButtons(currentPage, totalPages);
                                disabledButtons.components.forEach(button => button.setDisabled(true));

                                await response.edit({
                                    components: [disabledButtons]
                                });
                            } catch (error) {
                                // Ignore errors when editing expired interactions
                            }
                        });
                    }
                    break;
                }
                case "bulkadd": {
                    // Show modal for multi-line input
                    const modal = new ModalBuilder()
                        .setCustomId('whitelist_bulkadd_modal')
                        .setTitle('Bulk Add to Whitelist')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('bulkadd_list')
                                    .setLabel('kingdomId,dsa,cmine[,expiry] (one per line)')
                                    .setStyle(TextInputStyle.Paragraph)
                                    .setRequired(true)
                            )
                        );
                    await interaction.showModal(modal);
                    break;
                }
                case "bulkremove": {
                    // Show modal for multi-line input
                    const modal = new ModalBuilder()
                        .setCustomId('whitelist_bulkremove_modal')
                        .setTitle('Bulk Remove from Whitelist')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('bulkremove_list')
                                    .setLabel('Paste kingdomIds (one per line)')
                                    .setStyle(TextInputStyle.Paragraph)
                                    .setRequired(true)
                            )
                        );
                    await interaction.showModal(modal);
                    break;
                }
                case "reset": {
                    await sql.resetWhitelist(guild, continent);
                    await interaction.editReply({
                        content: "All whitelisted kingdoms for this guild have been reset (DSA and CMine set to 0)."
                    });
                    break;
                }
            }
        } catch (error) {
            console.error('Error in whitelist command:', error);
            const errorMessage = "An error occurred while processing your request. Please try again.";

            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: 64 });
            }
        }
    },
    async autocomplete(interaction) {
        const sql = module.exports.sql;
        await handleNameAutocomplete(interaction, sql);
    },
    async modalSubmit(interaction) {
        try {
            if (interaction.customId === 'whitelist_bulkadd_modal') {
                const sql = module.exports.sql;
                const guild = interaction.guild.id;
                const ephemeralFlag = await sql.getEphemeral(guild);
                const ephemeral = ephemeralFlag ? { flags: 64 } : {};

                await interaction.deferReply(ephemeral);

                // Get continent for this guild
                const continentArr = await sql.getGuildContinents(guild);
                const continent = continentArr && continentArr.length > 0 ? continentArr[0].continent : null;
                if (!continent) {
                    await interaction.editReply({ content: "No continent linked to this guild." });
                    return;
                }

                const input = interaction.fields.getTextInputValue('bulkadd_list');
                const lines = input.split('\n').map(line => line.trim()).filter(Boolean);
                let added = [];
                let failed = [];
                let incorrect = [];
                for (const line of lines) {
                    const parts = line.split(',').map(x => x.trim());
                    const kingdomId = parts[0];
                    let dsa = 0, cmine = 0;
                    if (parts.length > 1) dsa = Math.max(0, Math.min(5, parseInt(parts[1]) || 0));
                    if (parts.length > 2) cmine = Math.max(0, Math.min(5, parseInt(parts[2]) || 0));

                    // Parse expiry date if provided
                    let expiry = null;
                    if (parts.length > 3) {
                        expiry = parseExpiryDate(parts[3]);
                        if (parts[3] && !expiry) {
                            incorrect.push(`${kingdomId} (invalid expiry: ${parts[3]})`);
                            continue;
                        }
                        if (expiry && new Date(expiry) <= new Date()) {
                            incorrect.push(`${kingdomId} (expiry in past: ${parts[3]})`);
                            continue;
                        }
                    }

                    // Check for correct kingdomId length (24 chars for MongoDB ObjectId style)
                    if (!kingdomId || kingdomId.length !== 24) {
                        incorrect.push(kingdomId || "(empty)");
                        continue;
                    }

                    try {
                        const result = await sql.addToWhitelist(kingdomId, continent, guild, dsa.toString(), cmine.toString(), expiry);
                        const nameResult = await sql.getKingdomName(kingdomId);
                        const displayName = (nameResult && nameResult[0] && nameResult[0].name) ? nameResult[0].name : kingdomId;

                        let addedText = `${displayName} (DSA: ${dsa}, CMine: ${cmine})`;
                        if (result && result.extended) {
                            addedText = `${displayName} - Extended (DSA: ${dsa}, CMine: ${cmine})`;
                            if (result.newExpiry) {
                                addedText += ` until ${formatExpiryAsDiscordTimestamp(result.newExpiry)}`;
                            }
                        } else {
                            if (expiry) {
                                addedText += ` until ${formatExpiryAsDiscordTimestamp(expiry)}`;
                            }
                        }
                        added.push(addedText);
                    } catch (err) {
                        failed.push(kingdomId);
                    }
                }
                let reply = "";
                if (added.length) reply += `✅ Added to whitelist:\n${added.join('\n')}\n`;
                if (failed.length) reply += `❌ Failed to add:\n${failed.join('\n')}\n`;
                if (incorrect.length) reply += `⚠️ Incorrect ID:\n${incorrect.join('\n')}`;

                // Discord reply limit is 2000 characters
                const MAX_REPLY_LENGTH = 2000;
                if (reply.length > MAX_REPLY_LENGTH) {
                    reply = reply.slice(0, MAX_REPLY_LENGTH - 20) + "\n...(truncated)";
                }

                await interaction.editReply({ content: reply || "No valid entries." });
            } else if (interaction.customId === 'whitelist_bulkremove_modal') {
                const sql = module.exports.sql;
                const guild = interaction.guild.id;
                const ephemeralFlag = await sql.getEphemeral(guild);
                const ephemeral = ephemeralFlag ? { flags: 64 } : {};

                await interaction.deferReply(ephemeral);

                // Get continent for this guild
                const continentArr = await sql.getGuildContinents(guild);
                const continent = continentArr && continentArr.length > 0 ? continentArr[0].continent : null;
                if (!continent) {
                    await interaction.editReply({ content: "No continent linked to this guild." });
                    return;
                }

                const input = interaction.fields.getTextInputValue('bulkremove_list');
                const lines = input.split('\n').map(line => line.trim()).filter(Boolean);
                let removed = [];
                let failed = [];
                let incorrect = [];

                for (const kingdomId of lines) {
                    // Check for correct kingdomId length (24 chars for MongoDB ObjectId style)
                    if (!kingdomId || kingdomId.length !== 24) {
                        incorrect.push(kingdomId || "(empty)");
                        continue;
                    }

                    try {
                        // Get the latest name for display before removing
                        const nameResult = await sql.getKingdomName(kingdomId);
                        const displayName = (nameResult && nameResult[0] && nameResult[0].name) ? nameResult[0].name : kingdomId;
                        await sql.removeFromWhitelist(kingdomId, continent, guild);
                        removed.push(displayName);
                    } catch (err) {
                        failed.push(kingdomId);
                    }
                }

                let reply = "";
                if (removed.length) reply += `✅ Removed from whitelist:\n${removed.join('\n')}\n`;
                if (failed.length) reply += `❌ Failed to remove:\n${failed.join('\n')}\n`;
                if (incorrect.length) reply += `⚠️ Incorrect ID:\n${incorrect.join('\n')}`;

                // Discord reply limit is 2000 characters
                const MAX_REPLY_LENGTH = 2000;
                if (reply.length > MAX_REPLY_LENGTH) {
                    reply = reply.slice(0, MAX_REPLY_LENGTH - 20) + "\n...(truncated)";
                }

                await interaction.editReply({ content: reply || "No valid entries." });
            }
        } catch (error) {
            console.error('Error in whitelist modal submit:', error);
            const errorMessage = "An error occurred while processing your request. Please try again.";

            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: 64 });
            }
        }
    },
};