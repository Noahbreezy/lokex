const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const path = require('path');
const fs = require('fs');
const Encryption = require("../../../encryption/encryption.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("player-info")
        .setDescription("Get detailed information about kingdoms and players")
        .addStringOption(option =>
            option.setName("player")
                .setDescription("Search the name of the player or paste their kingdom ID")
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addUserOption(option =>
            option.setName("discord")
                .setDescription("Tag a discord user to get their kingdom info")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("summary_only")
                .setDescription("Only return the summary embed when searching by Discord user")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const encryption = new Encryption();

        try {
            if (!interaction.guild) {
                await interaction.reply({ content: "This command can only be used in a server.", flags: 64 });
                return;
            }

            const guildId = interaction.guild.id;
            const ephemeralFlag = await sql.getEphemeral(guildId);
            const ephemeral = ephemeralFlag ? { flags: 64 } : {};

            // Check subscription
            const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "3");
            if (!subscriptionFlagInfo) {
                await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscription renew` to get a new subscription. ", flags: 64 });
                return;
            }

            await interaction.deferReply(ephemeral);

            const playerOption = interaction.options.getString("player");
            const discordOption = interaction.options.getUser("discord");
            const summaryOnly = interaction.options.getBoolean("summary_only") === true;

            if (playerOption) {
                // Handle specific kingdom
                await handleKingdomInfo(interaction, playerOption, sql, api, encryption, ephemeral, guildId);
            } else if (discordOption) {
                // Handle all kingdoms for a discord user
                await handleDiscordUserInfo(interaction, discordOption, sql, api, encryption, ephemeral, guildId, summaryOnly);
            } else {
                // No options provided - show user's own kingdoms
                await handleOwnKingdomsSelection(interaction, sql, ephemeral, guildId);
            }
        } catch (error) {
            console.error('Error in player-info execute:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "An error occurred while processing your request.", flags: 64 });
            } else {
                await interaction.editReply({ content: "An error occurred while processing your request." });
            }
        }
    },

    async autocomplete(interaction) {
        await handleNameAutocomplete(interaction, module.exports.sql);
    },

    async stringselect(interaction) {
        const customId = interaction.customId || '';

        if (customId.startsWith("player-info_selectkingdom")) {
            await interaction.deferUpdate();

            const kingdomId = interaction.values[0];
            await handleKingdomInfo(
                interaction,
                kingdomId,
                module.exports.sql,
                module.exports.api,
                new Encryption(),
                { flags: 64 },
                interaction.guild?.id
            );
            return;
        }

        if (customId.startsWith(INVITE_SELECT_PREFIX)) {
            await handleInviteSelect(interaction, module.exports.sql, module.exports.api);
            return;
        }

        if (customId.startsWith(RANK_SELECT_PREFIX)) {
            await handleRankSelect(interaction, module.exports.sql, module.exports.api);
            return;
        }
    },

    async buttons(interaction) {
        await handleButtonInteraction(interaction, module.exports.sql, module.exports.api);
    },

    async modals(interaction) {
        await handleModalSubmission(interaction, module.exports.sql, module.exports.api);
    }
};

async function handleKingdomInfo(interaction, kingdomId, sql, api, encryption, ephemeral, guildId) {
    try {
        const effectiveGuildId = guildId || interaction.guild?.id;
        if (!effectiveGuildId) {
            await interaction.editReply({ content: "Unable to resolve guild context for this request." });
            return;
        }

        const token = (await sql.getRandomManagerTokenFromGuild(effectiveGuildId))[0]?.token;
        if (!token) {
            await interaction.editReply({ content: "No valid manager token found to look up that kingdom.", ...ephemeral });
            return;
        }

        const playerInfo = await getPlayerInfo(kingdomId, token, sql, api, encryption, effectiveGuildId);
        if (!playerInfo) {
            await interaction.editReply({ content: "Player not found or the kingdom ID is invalid.", ...ephemeral });
            return;
        }

        const [
            discordDetails,
            combatStats,
            socialStats,
            licenseSummary,
            blacklistEntries,
            kingdomCoordinates
        ] = await Promise.all([
            getDiscordVerificationDetails(interaction, sql, playerInfo.kingdomId),
            getCombatStats(sql, playerInfo.kingdomId),
            getSocialStats(sql, playerInfo.kingdomId, effectiveGuildId),
            getKingdomLicenseSummary(sql, playerInfo.kingdomId, playerInfo.continent, effectiveGuildId),
            getBlacklistStatus(sql, playerInfo.kingdomId, effectiveGuildId),
            resolveKingdomCoordinates(sql, playerInfo)
        ]);

        const economyDetails = discordDetails
            ? await getEconomyDetails(sql, effectiveGuildId, discordDetails.discordId)
            : null;
        const combatDeltas = await getCombatDeltaStats(sql, playerInfo.kingdomId, combatStats);
        const pastNamesHistory = Array.isArray(playerInfo.pastNamesHistory)
            ? playerInfo.pastNamesHistory
            : [];
        const embed = buildPlayerEmbed(
            playerInfo,
            discordDetails,
            economyDetails,
            combatStats,
            combatDeltas,
            socialStats,
            licenseSummary,
            blacklistEntries,
            pastNamesHistory,
            kingdomCoordinates
        );

        let imageArtifacts = null;
        try {
            if (playerInfo.kingdomId) {
                imageArtifacts = await fetchPlayerProfileImageAttachment(api, playerInfo.kingdomId);
                if (imageArtifacts?.attachment && imageArtifacts?.imageName) {
                    embed.setThumbnail(`attachment://${imageArtifacts.imageName}`);
                }
            }

            const replyPayload = { embeds: [embed], ...ephemeral };
            const actionRows = buildAccountActionRows(playerInfo.kingdomId);
            if (actionRows.length > 0) {
                replyPayload.components = actionRows;
            }
            if (imageArtifacts?.attachment) {
                replyPayload.files = [imageArtifacts.attachment];
            }

            await interaction.editReply(replyPayload);
            await savePlayerInfo(playerInfo, sql);
        } finally {
            if (imageArtifacts?.filePath && fs.existsSync(imageArtifacts.filePath)) {
                fs.unlinkSync(imageArtifacts.filePath);
            }
        }
    } catch (error) {
        console.error('Error in handleKingdomInfo:', error);
        await interaction.editReply({ content: "An error occurred while fetching player information.", ...ephemeral });
    }
}

async function handleDiscordUserInfo(interaction, discordUser, sql, api, encryption, ephemeral, guildId, summaryOnly = false) {
    const effectiveGuildId = guildId || interaction.guild?.id;
    if (!effectiveGuildId) {
        await interaction.editReply({ content: "Unable to resolve guild context for this request.", ...ephemeral });
        return;
    }

    const kingdoms = await sql.checkVerifiedKingdoms(discordUser.id, effectiveGuildId);
    if (!kingdoms || kingdoms.length === 0) {
        await interaction.editReply({ content: `${discordUser.username} has no verified kingdoms in this guild.`, ...ephemeral });
        return;
    }

    const verificationCache = new Map();
    const economyCache = new Map();

    const kingdomResults = await Promise.all(
        kingdoms.map(async (kingdom) => {
            const token = (await sql.getRandomManagerTokenFromGuild(effectiveGuildId))[0]?.token;
            if (!token) return null;

            const playerInfo = await getPlayerInfo(kingdom.kingdomId, token, sql, api, encryption, effectiveGuildId);
            if (!playerInfo) return null;

            const [discordDetails, combatStats, socialStats, licenseSummary, blacklistEntries, kingdomCoordinates] = await Promise.all([
                getDiscordVerificationDetails(interaction, sql, playerInfo.kingdomId, verificationCache),
                getCombatStats(sql, playerInfo.kingdomId),
                getSocialStats(sql, playerInfo.kingdomId, effectiveGuildId),
                getKingdomLicenseSummary(sql, playerInfo.kingdomId, playerInfo.continent, effectiveGuildId),
                getBlacklistStatus(sql, playerInfo.kingdomId, effectiveGuildId),
                resolveKingdomCoordinates(sql, playerInfo)
            ]);

            let economyDetails = null;
            if (discordDetails) {
                if (!economyCache.has(discordDetails.discordId)) {
                    economyCache.set(
                        discordDetails.discordId,
                        getEconomyDetails(sql, effectiveGuildId, discordDetails.discordId)
                    );
                }
                economyDetails = await economyCache.get(discordDetails.discordId);
            }

            const combatDeltas = await getCombatDeltaStats(sql, playerInfo.kingdomId, combatStats);
            const pastNamesHistory = Array.isArray(playerInfo.pastNamesHistory)
                ? playerInfo.pastNamesHistory
                : [];

            const allianceDisplay = formatAllianceWithRank(playerInfo.allianceTag, playerInfo.allianceRank);

            const summaryEntry = {
                name: playerInfo.name || playerInfo.kingdomId || 'Unknown',
                kingdomId: playerInfo.kingdomId || 'Unknown',
                level: Number.isFinite(Number(playerInfo.level)) ? Number(playerInfo.level) : 'Unknown',
                alliance: allianceDisplay,
                power: Number.isFinite(Number(playerInfo.power)) ? Number(playerInfo.power) : null,
                licenseSummary
            };

            const embed = buildPlayerEmbed(
                playerInfo,
                discordDetails,
                economyDetails,
                combatStats,
                combatDeltas,
                socialStats,
                licenseSummary,
                blacklistEntries,
                pastNamesHistory,
                kingdomCoordinates
            );

            const actionRows = buildAccountActionRows(playerInfo.kingdomId);
            const embedEntry = {
                embed,
                attachment: null,
                filePath: null,
                components: actionRows.length > 0 ? actionRows : undefined
            };

            if (playerInfo.kingdomId) {
                const imageArtifacts = await fetchPlayerProfileImageAttachment(api, playerInfo.kingdomId);
                if (imageArtifacts?.attachment && imageArtifacts?.imageName) {
                    embed.setThumbnail(`attachment://${imageArtifacts.imageName}`);
                    embedEntry.attachment = imageArtifacts.attachment;
                    embedEntry.filePath = imageArtifacts.filePath || null;
                } else if (imageArtifacts?.filePath) {
                    embedEntry.filePath = imageArtifacts.filePath;
                }
            }
            console.log(`Prepared embed result for kingdom ID: ${playerInfo.kingdomId}`);

            return {
                embedEntry,
                summaryEntry,
                discordDetails,
                economyDetails,
                socialStats
            };
        })
    );

    const successfulResults = kingdomResults.filter(Boolean);

    if (successfulResults.length === 0) {
        await interaction.editReply({ content: "Unable to retrieve information for the linked kingdoms at this time.", ...ephemeral });
        return;
    }

    const embedResults = successfulResults.map(result => result.embedEntry);

    const summaryData = {
        discordDetails: null,
        economyDetails: null,
        socialTotals: null,
        accountEntries: []
    };

    for (const result of successfulResults) {
        const { summaryEntry, discordDetails, economyDetails, socialStats } = result;

        if (!summaryData.discordDetails && discordDetails) {
            summaryData.discordDetails = discordDetails;
        }

        if (!summaryData.economyDetails && economyDetails) {
            summaryData.economyDetails = economyDetails;
        }

        if (socialStats) {
            if (!summaryData.socialTotals) {
                summaryData.socialTotals = {
                    illegalMines: 0,
                    blacklistCount: 0,
                    titleCount: 0,
                    ralliesStarted: 0
                };
            }

            summaryData.socialTotals.illegalMines += Number(socialStats.illegalMines) || 0;
            summaryData.socialTotals.blacklistCount += Number(socialStats.blacklistCount) || 0;
            summaryData.socialTotals.titleCount += Number(socialStats.titleCount) || 0;
            summaryData.socialTotals.ralliesStarted += Number(socialStats.ralliesStarted) || 0;
        }

        summaryData.accountEntries.push(summaryEntry);
    }

    const isEphemeral = Boolean(ephemeral?.flags);
    const summaryEmbed = buildDiscordAccountsSummaryEmbed(discordUser, summaryData);

    if (summaryOnly) {
        try {
            if (summaryEmbed) {
                await interaction.editReply({ embeds: [summaryEmbed], components: [] });
            } else {
                await interaction.editReply({ content: "Summary information is unavailable at this time.", components: [] });
            }
        } finally {
            const leftoverFiles = embedResults
                .map(entry => entry.filePath)
                .filter(filePath => filePath && fs.existsSync(filePath));
            cleanupTempFiles(leftoverFiles);
        }
        return;
    }

    const [firstResult, ...remainingResults] = embedResults;

    try {
        await sendEmbedResponse(interaction, firstResult, { isEphemeral, isInitial: true, ephemeralFlags: ephemeral });

        for (const result of remainingResults) {
            await sendEmbedResponse(interaction, result, { isEphemeral, isInitial: false });
        }

        if (summaryEmbed) {
            const summaryPayload = { embeds: [summaryEmbed] };
            if (isEphemeral) {
                summaryPayload.flags = 64;
            }
            await interaction.followUp(summaryPayload);
        }
    } finally {
        const leftoverFiles = embedResults
            .map(entry => entry.filePath)
            .filter(filePath => filePath && fs.existsSync(filePath));
        cleanupTempFiles(leftoverFiles);
    }
}

async function handleOwnKingdomsSelection(interaction, sql, ephemeral, guildId) {
    try {
        // Get user's verified kingdoms
        const kingdoms = await sql.checkVerifiedKingdoms(interaction.user.id, interaction.guild.id);
        if (!kingdoms || kingdoms.length === 0) {
            return interaction.editReply({ content: "You have no verified kingdoms in this guild. Please verify your kingdoms first.", ...ephemeral });
        }

        if (kingdoms.length === 1) {
            // Directly show info for the single kingdom
            const kingdomId = kingdoms[0].kingdomId;
            await handleKingdomInfo(interaction, kingdomId, sql, module.exports.api, new (require("../../../encryption/encryption.js"))(), ephemeral, guildId);
            return;
        }

        // Show selection menu
        const options = kingdoms.slice(0, 25).map(kingdom => {
            return new StringSelectMenuOptionBuilder()
                .setLabel(kingdom.kingdomName || kingdom.kingdomId)
                .setDescription(`Kingdom ID: ${kingdom.kingdomId}`)
                .setValue(kingdom.kingdomId);
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('player-info_selectkingdom')
            .setPlaceholder('Select your kingdom')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.editReply({
            content: "Select one of your kingdoms to view information:",
            components: [row],
            ...ephemeral
        });
    } catch (error) {
        console.error('Error in handleOwnKingdomsSelection:', error);
        await interaction.editReply({ content: "An error occurred while loading your kingdoms.", ...ephemeral });
    }
}

function buildPlayerEmbed(playerInfo, discordDetails, economyDetails, combatStats, combatDeltas, socialStats, licenseSummary, blacklistEntries, pastNamesHistory, kingdomCoordinates) {
    const safeName = playerInfo.name || "Unknown";

    const embed = new EmbedBuilder()
        .setTitle(`${safeName}'s information`)
        .setColor("#007ACC")
        .setTimestamp();

    const allianceDisplay = formatAllianceWithRank(playerInfo.allianceTag, playerInfo.allianceRank);

    const accountInfoValue = [
        `• Kingdom ID: ${playerInfo.kingdomId || 'Unknown'}`,
        `• Continent: ${playerInfo.continent ?? 'Unknown'}`,
        `• Level: ${playerInfo.level ?? 'Unknown'}`,
        `• Alliance: ${allianceDisplay}`,
        `• Power: ${formatNumberWithSuffix2(playerInfo.power)}`
    ].join('\n');

    embed.addFields({
        name: '__Account Info__',
        value: accountInfoValue,
        inline: true
    });

    const discordInfoValue = buildDiscordInfoFieldValue(discordDetails);

    embed.addFields({
        name: '__Discord Info__',
        value: discordInfoValue,
        inline: true
    });

    const walletsInfoValue = buildWalletsFieldValue(economyDetails);

    embed.addFields({
        name: '__Wallets__',
        value: walletsInfoValue,
        inline: false
    });

    const combatInfoValue = buildCombatFieldValue(combatStats, playerInfo);

    embed.addFields({
        name: '__Combat Stats__',
        value: combatInfoValue,
        inline: true
    });

    const economyInfoValue = buildEconomyFieldValue(economyDetails);

    embed.addFields({
        name: '__Economy Info__',
        value: economyInfoValue,
        inline: true
    });

    const socialInfoValue = buildSocialFieldValue(socialStats);

    embed.addFields({
        name: '__Social Stats__',
        value: socialInfoValue,
        inline: true
    });

    const combatDeltaFields = buildCombatDeltaFields(combatDeltas);
    combatDeltaFields.forEach(field => embed.addFields(field));

    const licenseInfoValue = buildLicenseFieldValue(licenseSummary);
    if (licenseInfoValue) {
        embed.addFields({
            name: '__Whitelist Licenses__',
            value: licenseInfoValue,
            inline: false
        });
    }

    const blacklistInfoValue = buildBlacklistFieldValue(blacklistEntries);
    if (blacklistInfoValue) {
        embed.addFields({
            name: '__Blacklist Status__',
            value: blacklistInfoValue,
            inline: false
        });
    }

    const pastNamesFieldValue = buildPastNamesFieldValue(pastNamesHistory);
    if (pastNamesFieldValue) {
        embed.addFields({
            name: '__Past Names__',
            value: pastNamesFieldValue,
            inline: false
        });
    }

    const coordinatesFieldValue = buildCoordinatesFieldValue(kingdomCoordinates);
    embed.addFields({
        name: '__Coordinates__',
        value: coordinatesFieldValue,
        inline: false
    });

    return embed;
}

async function getCombatStats(sql, kingdomId) {
    try {
        const rows = await sql.getLatestKingdomInfo(kingdomId);
        const info = rows && rows[0];
        if (!info) {
            return null;
        }

        const kills = Number(info.kills) || 0;
        const deaths = Number(info.death) || 0;
        const kd = deaths === 0 ? (kills > 0 ? Infinity : 0) : kills / deaths;

        return {
            kills,
            deaths,
            kd
        };
    } catch (error) {
        console.error('Error retrieving combat stats:', error);
        return null;
    }
}

async function getCombatDeltaStats(sql, kingdomId, combatStats) {
    if (!combatStats) {
        return null;
    }

    const targets = [7, 30, 90];
    const deltaResults = {};

    await Promise.all(targets.map(async (days) => {
        try {
            const rows = await sql.getKingdomInfoCloseToNDaysAgo(kingdomId, days);
            const historical = rows && rows[0];

            if (!historical) {
                deltaResults[days] = null;
                return;
            }

            const pastKills = Number(historical.kills) || 0;
            const pastDeaths = Number(historical.death) || 0;
            const pastKd = pastDeaths === 0 ? (pastKills > 0 ? Infinity : 0) : pastKills / pastDeaths;

            const killsChange = combatStats.kills - pastKills;
            const deathsChange = combatStats.deaths - pastDeaths;
            const kdChange = computeKdChange(combatStats.kd, pastKd);

            deltaResults[days] = {
                killsChange,
                deathsChange,
                kdChange
            };
        } catch (error) {
            console.error(`Error retrieving ${days}d combat delta:`, error);
            deltaResults[days] = null;
        }
    }));

    return deltaResults;
}

async function getSocialStats(sql, kingdomId, guildId) {
    try {
        const [illegalMines, blacklistCount, titleCount, ralliesStarted] = await Promise.all([
            sql.getIllegalReportsCount(kingdomId, guildId),
            sql.getTotalBlacklistedCount(kingdomId, guildId),
            sql.getKingdomTitleCount(kingdomId, guildId),
            sql.getRalliesCount(kingdomId, guildId)
        ]);

        return {
            illegalMines: Number(illegalMines) || 0,
            blacklistCount: Number(blacklistCount) || 0,
            titleCount: Number(titleCount) || 0,
            ralliesStarted: Number(ralliesStarted) || 0
        };
    } catch (error) {
        console.error('Error retrieving social stats:', error);
        return null;
    }
}

async function getBlacklistStatus(sql, kingdomId, guildId) {
    try {
        const result = await sql.isKingdomBlacklisted(kingdomId, guildId);
        if (!result || result === false) {
            return null;
        }

        if (Array.isArray(result)) {
            return result.filter(entry => entry);
        }

        return [result];
    } catch (error) {
        console.error('Error retrieving blacklist status:', error);
        return null;
    }
}

async function resolveKingdomCoordinates(sql, playerInfo) {
    const xNumber = Number(playerInfo?.x);
    const yNumber = Number(playerInfo?.y);

    // If x is 0 or not finite, use the SQL query
    if (Number.isFinite(xNumber) && Number.isFinite(yNumber) && (xNumber !== 0 || yNumber !== 0)) {
        return { x: xNumber, y: yNumber };
    }

    try {
        const rows = await sql.getKingdomLocation(playerInfo.kingdomId);
        if (!rows || rows.length === 0) {
            return null;
        }

        const entry = rows[0];
        const x = Number(entry?.x);
        const y = Number(entry?.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }

        return { x, y };
    } catch (error) {
        console.error('Error retrieving kingdom coordinates:', error);
        return null;
    }
}

async function getKingdomLicenseSummary(sql, kingdomId, continent, guildId) {
    try {
        if (!kingdomId || !guildId) {
            return null;
        }

        let resolvedContinent = Number(continent);
        if (!Number.isFinite(resolvedContinent) || resolvedContinent === 0) {
            try {
                const fallbackRows = await sql.getKingdomContinent(kingdomId);
                const fallbackContinent = fallbackRows && fallbackRows[0] ? Number(fallbackRows[0].continent) : NaN;
                if (Number.isFinite(fallbackContinent) && fallbackContinent !== 0) {
                    resolvedContinent = fallbackContinent;
                }
            } catch (fallbackError) {
                console.error('Error resolving fallback continent for license lookup:', fallbackError);
            }
        }

        if (!Number.isFinite(resolvedContinent) || resolvedContinent === 0) {
            return null;
        } else {
            resolvedContinent = (await sql.getGuildContinent(guildId))[0]?.continent;
            console.log('continent:', resolvedContinent);
        }

        const rows = await sql.getKingdomLicenses(kingdomId, resolvedContinent, guildId);
        if (!rows || rows.length === 0) {
            return null;
        }

        const summary = {
            dsa: { level: 0, expiry: null },
            cmine: { level: 0, expiry: null }
        };

        for (const entry of rows) {
            const expiryDate = entry?.expiry ? new Date(entry.expiry) : null;
            const normalizedExpiry = expiryDate instanceof Date && !Number.isNaN(expiryDate.getTime())
                ? expiryDate
                : null;

            const dsaLevel = Number(entry?.dsa) || 0;
            if (dsaLevel > 0) {
                if (
                    dsaLevel > summary.dsa.level ||
                    (dsaLevel === summary.dsa.level && shouldPreferExpiry(summary.dsa.expiry, normalizedExpiry))
                ) {
                    summary.dsa.level = dsaLevel;
                    summary.dsa.expiry = normalizedExpiry;
                }
            }

            const cmineLevel = Number(entry?.cmine) || 0;
            if (cmineLevel > 0) {
                if (
                    cmineLevel > summary.cmine.level ||
                    (cmineLevel === summary.cmine.level && shouldPreferExpiry(summary.cmine.expiry, normalizedExpiry))
                ) {
                    summary.cmine.level = cmineLevel;
                    summary.cmine.expiry = normalizedExpiry;
                }
            }
        }

        if (summary.dsa.level === 0 && summary.cmine.level === 0) {
            return null;
        }

        return summary;
    } catch (error) {
        console.error('Error retrieving kingdom license summary:', error);
        return null;
    }
}

function shouldPreferExpiry(currentExpiry, candidateExpiry) {
    if (!candidateExpiry && currentExpiry) {
        return true;
    }
    if (!candidateExpiry && !currentExpiry) {
        return false;
    }
    if (candidateExpiry && !currentExpiry) {
        return false;
    }
    if (candidateExpiry && currentExpiry) {
        return candidateExpiry > currentExpiry;
    }
    return false;
}

async function getEconomyDetails(sql, guildId, discordId) {
    try {
        const [pointsBalance, wallets] = await Promise.all([
            sql.getUserPointsBalance(discordId, guildId),
            sql.getVerifiedWallets(discordId, guildId)
        ]);

        const filteredWallets = (wallets || [])
            .filter(wallet => wallet && wallet !== '0' && wallet !== 0)
            .map(wallet => wallet.toString());

        const walletMap = new Map();
        for (const wallet of filteredWallets) {
            const key = wallet.toLowerCase();
            if (!walletMap.has(key)) {
                walletMap.set(key, wallet);
            }
        }

        const uniqueWallets = Array.from(walletMap.values());

        if (uniqueWallets.length === 0) {
            return {
                pointsBalance,
                totalPledged: 0,
                wallets: []
            };
        }

        const pledgedResults = await Promise.all(
            uniqueWallets
                .map(async (wallet) => ({
                    wallet,
                    pledged: await sql.getTotalPledgedToMergedContinent(wallet, guildId)
                }))
        );

        const totalPledged = pledgedResults.reduce((acc, { pledged }) => acc + (pledged || 0), 0);

        const displayLimit = 5;
        const walletDetails = pledgedResults.slice(0, displayLimit);

        if (pledgedResults.length > displayLimit) {
            walletDetails.push({ wallet: `...and ${pledgedResults.length - displayLimit} more`, pledged: null });
        }

        return {
            pointsBalance,
            totalPledged,
            wallets: walletDetails
        };
    } catch (error) {
        console.error('Error retrieving economy details:', error);
        return null;
    }
}

async function getDiscordVerificationDetails(interaction, sql, kingdomId, cache = new Map()) {
    try {
        const rows = await sql.query(
            'SELECT discordId, name FROM verified WHERE kingdomId = ? AND status = 1 LIMIT 1',
            [kingdomId]
        );

        if (!rows.length) {
            return null;
        }

        const { discordId, name } = rows[0];
        if (!discordId) {
            return null;
        }

        if (cache.has(discordId)) {
            return { discordId, username: cache.get(discordId) };
        }

        let username = name || null;
        try {
            const user = await interaction.client.users.fetch(discordId);
            if (user) {
                const discriminator = user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
                username = user.username ? `${user.username}${discriminator}` : user.tag || username;
            }
        } catch (fetchError) {
            if (fetchError?.code !== 10013) {
                console.error('Error fetching Discord user for verification details:', fetchError);
            }
        }

        const finalUsername = username || 'Unknown';
        cache.set(discordId, finalUsername);

        return { discordId, username: finalUsername };
    } catch (error) {
        console.error('Error retrieving Discord verification details:', error);
        return null;
    }
}

function buildDiscordInfoFieldValue(discordDetails) {
    if (!discordDetails) {
        return '• Status: :x: Not verified';
    }

    const lines = [
        `• Tag: <@${discordDetails.discordId}>`,
        discordDetails.username ? `• Name: ${discordDetails.username}` : null,
        `• ID: ${discordDetails.discordId}`,
        '• Status: ✅ Verified'
    ].filter(Boolean);

    return lines.join('\n');
}

function buildEconomyFieldValue(economyDetails) {
    if (!economyDetails) {
        return '• No economic data available';
    }

    const lines = [
        `• Shop Points: ${formatNumberWithSuffix2(economyDetails.pointsBalance)}`,
        `• Total Pledged: ${formatNumberWithSuffix2(economyDetails.totalPledged)}`
    ];

    return lines.join('\n');
}

function buildWalletsFieldValue(economyDetails) {
    if (!economyDetails || !Array.isArray(economyDetails.wallets) || economyDetails.wallets.length === 0) {
        return '• None on record';
    }

    const seen = new Set();
    const lines = [];

    for (const entry of economyDetails.wallets) {
        const wallet = entry?.wallet;
        if (!wallet) {
            continue;
        }

        const key = typeof wallet === 'string' ? wallet.toLowerCase() : wallet;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);

        if (entry.pledged === null || entry.pledged === 0) {
            lines.push(`• ${wallet}`);
        } else {
            lines.push(`• ${wallet} (${formatNumberWithSuffix2(entry.pledged)})`);
        }
    }

    if (lines.length === 0) {
        return '• None on record';
    }

    return lines.join('\n');
}

function buildDiscordAccountsSummaryEmbed(discordUser, summaryData) {
    if (!summaryData || summaryData.accountEntries.length === 0) {
        return null;
    }

    const summaryTitle = discordUser?.username
        ? `${discordUser.username}'s summary`
        : 'Discord User summary';

    const embed = new EmbedBuilder()
        .setTitle(summaryTitle)
        .setColor("#007ACC")
        .setTimestamp();

    if (typeof discordUser?.displayAvatarURL === 'function') {
        const avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 128 });
        if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
        }
    }

    const discordInfoValue = buildDiscordInfoFieldValue(summaryData.discordDetails);
    embed.addFields({
        name: '__Discord Info__',
        value: discordInfoValue,
        inline: true
    });

    const socialFieldValue = summaryData.socialTotals
        ? buildSocialFieldValue(summaryData.socialTotals)
        : buildSocialFieldValue(null);

    embed.addFields({
        name: '__Social Stats__',
        value: socialFieldValue,
        inline: true
    });

    const walletsFieldValue = buildWalletsFieldValue(summaryData.economyDetails);
    embed.addFields({
        name: '__Wallets__',
        value: walletsFieldValue,
        inline: false
    });

    const maxAccountFields = 22;
    const accountEntries = summaryData.accountEntries.slice(0, maxAccountFields);
    accountEntries.forEach(entry => {
        const fieldName = entry.name
            ? `__${entry.name}__`
            : `__${entry.kingdomId || 'Unknown'}__`;
        embed.addFields({
            name: fieldName,
            value: buildAccountSummaryFieldValue(entry),
            inline: true
        });
    });

    if (summaryData.accountEntries.length > maxAccountFields) {
        embed.addFields({
            name: 'Additional Accounts',
            value: `• ...and ${summaryData.accountEntries.length - maxAccountFields} more`,
            inline: false
        });
    }

    return embed;
}

function buildAccountSummaryFieldValue(entry) {
    const levelDisplay = typeof entry.level === 'number' && Number.isFinite(entry.level)
        ? entry.level
        : (entry.level ?? 'Unknown');

    const powerDisplay = entry.power === null || entry.power === undefined
        ? 'Unknown'
        : formatNumberWithSuffix2(entry.power);

    const lines = [
        `• ID: ${entry.kingdomId || 'Unknown'}`,
        `• Level: ${levelDisplay}`,
        `• Alliance: ${entry.alliance || 'no alliance'}`,
        `• Power: ${powerDisplay}`,
        `• Licenses: ${formatLicenseSummaryForAccount(entry.licenseSummary)}`
    ];

    return lines.join('\n');
}

function formatLicenseSummaryForAccount(licenseSummary) {
    if (!licenseSummary) {
        return 'DSA: None | C-Mine: None';
    }

    const dsaPart = formatIndividualLicenseSummary('DSA', licenseSummary.dsa);
    const cminePart = formatIndividualLicenseSummary('C-Mine', licenseSummary.cmine);

    return `${dsaPart} | ${cminePart}`;
}

function formatIndividualLicenseSummary(label, data) {
    if (!data || !Number.isFinite(Number(data.level)) || Number(data.level) <= 0) {
        return `${label}: None`;
    }

    const levelDisplay = Number(data.level);

    if (!data.expiry) {
        return `${label}: L${levelDisplay} (Permanent)`;
    }

    const relative = formatDiscordRelativeTimestamp(data.expiry);
    return `${label}: L${levelDisplay} (${relative})`;
}

function buildCombatFieldValue(combatStats, playerInfo) {
    if (!combatStats) {
        const fallbackKills = Number(playerInfo.kills) || 0;
        const fallbackDeaths = Number(playerInfo.death) || 0;
        const fallbackKd = fallbackDeaths === 0 ? (fallbackKills > 0 ? Infinity : 0) : fallbackKills / fallbackDeaths;

        return formatCombatLines(fallbackKills, fallbackDeaths, fallbackKd);
    }

    return formatCombatLines(combatStats.kills, combatStats.deaths, combatStats.kd);
}

function formatCombatLines(kills, deaths, kd) {
    const kdDisplay = kd === Infinity ? '∞' : kd.toFixed(2);

    return [
        `• Kills: ${formatNumberWithSuffix2(kills)}`,
        `• Deaths: ${formatNumberWithSuffix2(deaths)}`,
        `• K/D Ratio: ${kdDisplay}`
    ].join('\n');
}

function buildCombatDeltaFields(combatDeltas) {
    if (!combatDeltas) {
        return [
            {
                name: '__Combat Change (7D)__',
                value: '• Data unavailable',
                inline: true
            },
            {
                name: '__Combat Change (30D)__',
                value: '• Data unavailable',
                inline: true
            },
            {
                name: '__Combat Change (90D)__',
                value: '• Data unavailable',
                inline: true
            }
        ];
    }

    return [7, 30, 90].map((days) => {
        const delta = combatDeltas[days];
        if (!delta) {
            return {
                name: `__Combat Change (${days}D)__`,
                value: '• Data unavailable',
                inline: true
            };
        }

        return {
            name: `__Combat Change (${days}D)__`,
            value: buildCombatDeltaFieldValue(delta),
            inline: true
        };
    });
}

function buildCombatDeltaFieldValue(delta) {
    return [
        `• Kills: ${formatSignedNumberWithSuffix(delta.killsChange)}`,
        `• Deaths: ${formatSignedNumberWithSuffix(delta.deathsChange)}`,
        `• K/D Ratio: ${formatSignedRatio(delta.kdChange)}`
    ].join('\n');
}

function computeKdChange(currentKd, pastKd) {
    const normalizedCurrent = Number.isFinite(currentKd) ? currentKd : (currentKd === Infinity ? Infinity : -Infinity);
    const normalizedPast = Number.isFinite(pastKd) ? pastKd : (pastKd === Infinity ? Infinity : -Infinity);

    if (normalizedCurrent === Infinity && normalizedPast === Infinity) {
        return 0;
    }

    if (normalizedCurrent === Infinity) {
        return Infinity;
    }

    if (normalizedPast === Infinity) {
        return -Infinity;
    }

    if (normalizedCurrent === -Infinity && normalizedPast === -Infinity) {
        return 0;
    }

    if (normalizedCurrent === -Infinity) {
        return -Infinity;
    }

    if (normalizedPast === -Infinity) {
        return Infinity;
    }

    return normalizedCurrent - normalizedPast;
}

function formatSignedNumberWithSuffix(value) {
    const numericValue = Number(value) || 0;
    if (numericValue === 0) {
        return '0';
    }

    const prefix = numericValue > 0 ? '+' : '-';
    const formattedMagnitude = formatNumberWithSuffix2(Math.abs(numericValue));
    return `${prefix}${formattedMagnitude}`;
}

function formatSignedRatio(value) {
    if (!Number.isFinite(value)) {
        if (value === Infinity) return '+∞';
        if (value === -Infinity) return '-∞';
        return '0';
    }

    if (value === 0) {
        return '0.00';
    }

    const prefix = value > 0 ? '+' : '-';
    const magnitude = Math.abs(value).toFixed(2);
    return `${prefix}${magnitude}`;
}

function buildSocialFieldValue(socialStats) {
    if (!socialStats) {
        return '• No social data available';
    }

    return [
        `• Illegal Mines (30d): ${formatNumberWithSuffix2(socialStats.illegalMines)}`,
        `• Blacklist Count: ${formatNumberWithSuffix2(socialStats.blacklistCount)}`,
        `• Titles Received: ${formatNumberWithSuffix2(socialStats.titleCount)}`,
        `• Rallies Started (30d): ${formatNumberWithSuffix2(socialStats.ralliesStarted)}`
    ].join('\n');
}

function buildLicenseFieldValue(licenseSummary) {
    if (!licenseSummary) {
        return '• No whitelist licenses found';
    }

    const lines = [];

    if (licenseSummary.dsa?.level > 0) {
        lines.push(`• DSA Level ${licenseSummary.dsa.level} — ${formatLicenseExpiry(licenseSummary.dsa.expiry)}`);
    }

    if (licenseSummary.cmine?.level > 0) {
        lines.push(`• C-Mine Level ${licenseSummary.cmine.level} — ${formatLicenseExpiry(licenseSummary.cmine.expiry)}`);
    }

    if (lines.length === 0) {
        return '• No whitelist licenses found';
    }

    return lines.join('\n');
}

function formatLicenseExpiry(expiryDate) {
    if (!expiryDate) {
        return 'Permanent';
    }

    const epochSeconds = Math.floor(expiryDate.getTime() / 1000);
    if (!Number.isFinite(epochSeconds)) {
        return 'Unknown expiry';
    }

    return `<t:${epochSeconds}:F> (<t:${epochSeconds}:R>)`;
}

function formatDiscordRelativeTimestamp(dateLike) {
    const targetDate = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
        return 'Unknown';
    }

    const epochSeconds = Math.floor(targetDate.getTime() / 1000);
    if (!Number.isFinite(epochSeconds)) {
        return 'Unknown';
    }

    return `<t:${epochSeconds}:R>`;
}

function buildBlacklistFieldValue(entries) {
    if (!entries || entries.length === 0) {
        return '• Status: ✅ Not blacklisted';
    }

    const entry = entries[0];
    const expiration = entry?.expiration ? formatDateTime(entry.expiration) : 'No expiry set';
    const rawReason = typeof entry?.reason === 'string' && entry.reason.trim()
        ? entry.reason.trim()
        : (typeof entry?.description === 'string' && entry.description.trim() ? entry.description.trim() : null);
    const formattedReason = rawReason ? `• Reason: ${rawReason}` : null;

    return ['• Status: ❌ Blacklisted', `• Expires: ${expiration}`, formattedReason].filter(Boolean).join('\n');
}

function buildPastNamesFieldValue(history) {
    if (!history || history.length === 0) {
        return '• None recorded';
    }

    const maxEntries = 5;
    const lines = history.slice(0, maxEntries).map(entry => {
        const relative = formatRelativeTimeFromNow(entry.firstUsed);
        return `• ${entry.name} — first seen ${relative}`;
    });

    if (history.length > maxEntries) {
        lines.push(`• ...and ${history.length - maxEntries} older name(s)`);
    }

    return lines.join('\n');
}

function buildCoordinatesFieldValue(coordinates) {
    if (!coordinates) {
        return '• Not available';
    }

    const xNumber = Number(coordinates.x);
    const yNumber = Number(coordinates.y);

    const xValue = Number.isFinite(xNumber) ? xNumber : 'Unknown';
    const yValue = Number.isFinite(yNumber) ? yNumber : 'Unknown';

    return [`• X: ${xValue}`, `• Y: ${yValue}`].join('\n');
}

async function sendEmbedResponse(interaction, resultEntry, { isEphemeral, isInitial, ephemeralFlags }) {
    const payload = { embeds: [resultEntry.embed] };

    if (resultEntry.attachment) {
        payload.files = [resultEntry.attachment];
    }

    if (Array.isArray(resultEntry.components) && resultEntry.components.length > 0) {
        payload.components = resultEntry.components;
    }

    if (isInitial) {
        Object.assign(payload, ephemeralFlags || {});
        await interaction.editReply(payload);
    } else {
        if (isEphemeral) {
            payload.ephemeral = true;
        }
        await interaction.followUp(payload);
    }

    if (resultEntry.filePath && fs.existsSync(resultEntry.filePath)) {
        try {
            fs.unlinkSync(resultEntry.filePath);
        } catch (error) {
            console.error(`Failed to remove temp file ${resultEntry.filePath}:`, error);
        }
        resultEntry.filePath = null;
    }
}

async function fetchPlayerProfileImageAttachment(api, kingdomId) {
    const tempDir = path.join(__dirname, '../../../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filePath = path.join(tempDir, `player_${kingdomId}_${uniqueSuffix}.png`);
    const url = `https://play.leagueofkingdoms.com/images/face/${kingdomId}`;

    try {
        const response = await api.getStream(url, {});
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (!fs.existsSync(filePath)) {
            console.error(`Player image file missing after download for kingdom ${kingdomId}`);
            return { attachment: null, filePath: null, imageName: null };
        }

        const imageName = path.basename(filePath);
        const attachment = new AttachmentBuilder(filePath);
        return { attachment, filePath, imageName };
    } catch (error) {
        if (error?.response) {
            console.error(`Failed to download player image: ${error.response.status} ${error.response.statusText}`);
        } else {
            console.error('Failed to download player image: Network error');
        }
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (cleanupError) {
                console.error(`Failed to remove temp file ${filePath} after download error:`, cleanupError);
            }
        }
        return { attachment: null, filePath: null, imageName: null };
    }
}

function cleanupTempFiles(files = []) {
    for (const filePath of files) {
        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (error) {
                console.error(`Failed to remove temp file ${filePath}:`, error);
            }
        }
    }
}

function formatRelativeTimeFromNow(dateLike) {
    const targetDate = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
        return 'an unknown time ago';
    }

    const now = new Date();
    const diffMs = now.getTime() - targetDate.getTime();
    if (diffMs <= 0) {
        return 'just now';
    }

    const seconds = Math.floor(diffMs / 1000);
    const intervals = [
        { unit: 'year', seconds: 31536000 },
        { unit: 'month', seconds: 2592000 },
        { unit: 'week', seconds: 604800 },
        { unit: 'day', seconds: 86400 },
        { unit: 'hour', seconds: 3600 },
        { unit: 'minute', seconds: 60 }
    ];

    for (const interval of intervals) {
        const value = Math.floor(seconds / interval.seconds);
        if (value >= 1) {
            const label = value === 1 ? interval.unit : `${interval.unit}s`;
            return `${value} ${label} ago`;
        }
    }

    return 'moments ago';
}

// Include the existing helper functions from playerInfo.on.js
async function getPlayerInfo(kingdomId, token, sql, api, encryption, guildId) {
    const xorPass = (await sql.getXORPass())?.[0]?.value || null;
    const body = await encryption.buildRequestBody({ kingdomId: String(kingdomId) }, xorPass);

    let basicPlayerInfoResponse;
    let historyPlayerInfoResponse;

    try {
        basicPlayerInfoResponse = await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
            body,
            { 'x-access-token': token, 'Content-Type': 'application/json' }
        );
        historyPlayerInfoResponse = await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other/history',
            { kingdomId: kingdomId },
            { 'x-access-token': token, 'Content-Type': 'application/json' }
        );
    } catch (error) {
        console.error('Error getting player info:', error);
        return null;
    }

    const basicPlayerInfo = JSON.parse(await encryption.decryptXorMessage(basicPlayerInfoResponse.data, xorPass)).profile;
    const historyPlayerInfo = historyPlayerInfoResponse.data.history;

    let location = await getMemberLocation(kingdomId, basicPlayerInfo.alliance?._id, token, api, sql);
    const ralliesDone = await sql.getRalliesCount(kingdomId, guildId);
    const pastKingdomNames = await sql.getPastKingdomNames(kingdomId);
    const pastNamesHistory = pastKingdomNames
        .filter(obj => !!obj.name && !!obj.date)
        .map(obj => {
            const firstUsed = new Date(obj.date);
            return Number.isNaN(firstUsed.getTime())
                ? null
                : { name: obj.name, firstUsed };
        })
        .filter(Boolean);

    const formattedPastNames = pastNamesHistory.length > 0
        ? pastNamesHistory
            .map(entry => `${entry.name} - __Date: ${entry.firstUsed.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}__`)
            .join("\n")
        : "None";

    return {
        _id: kingdomId,
        allianceId: basicPlayerInfo.alliance?._id || "",
        allianceTag: basicPlayerInfo.alliance?.tag || "",
        allianceRank: basicPlayerInfo.alliance ? await getAllianceRank(kingdomId, basicPlayerInfo.alliance._id, token, api) : 0,
        kingdomId: kingdomId,
        name: basicPlayerInfo.name,
        level: basicPlayerInfo.level,
        lord: basicPlayerInfo.lord.level,
        power: basicPlayerInfo.power,
        kills: basicPlayerInfo.kill,
        death: historyPlayerInfo.stats.battle.death,
        victory: historyPlayerInfo.stats.battle.victory,
        defeat: historyPlayerInfo.stats.battle.defeated,
        gathering: historyPlayerInfo.stats.economy.gathering,
        continent: basicPlayerInfo.worldId || 0,
        x: location.x,
        y: location.y,
        ralliesDone: ralliesDone,
        pastNamesHistory,
        pastKingdomNames: formattedPastNames
    };
}

async function getMemberLocation(kingdomId, allianceId, token, api, sql) {
    if (!allianceId) return { x: 0, y: 0, continent: 0 };

    const managerToken = (await sql.getManagerToken(allianceId))[0]?.token;

    try {
        const response = await api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/fo",
            { targetId: String(kingdomId) },
            { "x-access-token": managerToken }
        );
        if (response.data.fo?.loc) {
            return {
                x: response.data.fo.loc[1],
                y: response.data.fo.loc[2],
                continent: response.data.fo.loc[0]
            };
        }
    } catch (error) {
        console.error('Error getting member location:', error);
    }
    return { x: 0, y: 0, continent: 0 };
}

async function getAllianceRank(kingdomId, allianceId, token, api) {
    try {
        const response = await api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/alliance/members/list",
            { allianceId: String(allianceId) },
            { "x-access-token": token }
        );
        for (const memberGroup of response.data.members) {
            for (const member of memberGroup.members) {
                if (member.kingdomId === kingdomId) {
                    return member.rank;
                }
            }
        }
    } catch (error) {
        console.error('Error getting alliance rank:', error);
    }
    return 0;
}

async function savePlayerInfo(playerInfo, sql) {
    const values = [
        playerInfo.allianceId,
        playerInfo.allianceTag,
        playerInfo.kingdomId,
        playerInfo.name,
        playerInfo.level,
        playerInfo.lord,
        playerInfo.power,
        playerInfo.kills,
        playerInfo.death,
        playerInfo.victory,
        playerInfo.defeat,
        playerInfo.gathering,
        playerInfo.continent,
        playerInfo.x,
        playerInfo.y
    ];

    await sql.updateFullKingdomInfo(values);
}

function formatNumberWithSuffix2(number) {
    number = Number(number) || 0;
    if (number >= 1e9) return (number / 1e9).toFixed(2) + 'B';
    if (number >= 1e6) return (number / 1e6).toFixed(2) + 'M';
    if (number >= 1e3) return (number / 1e3).toFixed(2) + 'K';
    return number.toFixed(0).toString();
}

function formatDateTime(data) {
    const date = new Date(data);
    const options = { day: '2-digit', month: 'long', year: 'numeric' };
    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    const seconds = ('0' + date.getSeconds()).slice(-2);
    return `${date.toLocaleDateString('en-US', options)} ${hours}:${minutes}:${seconds}`;
}

async function handleNameAutocomplete(interaction, sql) {
    try {
        const focusedValue = interaction.options.getFocused();
        const names = await sql.searchKingdomName(focusedValue);
        const choices = names.slice(0, 25).map(nameObj => ({
            name: nameObj.name || 'Unknown',
            value: nameObj.kingdomId || 'Unknown'
        }));
        await interaction.respond(choices);
    } catch (error) {
        console.error('Error in handleNameAutocomplete:', error);
        await interaction.respond([]);
    }
}

const BL_BUTTON_PREFIX = 'player-info_bl_';
const UBL_BUTTON_PREFIX = 'player-info_ubl_';
const MAIL_BUTTON_PREFIX = 'player-info_mail_';
const INVITE_BUTTON_PREFIX = 'player-info_invite_';
const INVITE_SELECT_PREFIX = 'player-info_invite_select_';
const RANK_BUTTON_PREFIX = 'player-info_rank_';
const RANK_SELECT_PREFIX = 'player-info_rank_select_';
const KICK_BUTTON_PREFIX = 'player-info_kick_';
const BLACKLIST_MODAL_PREFIX = 'player-info_blacklist_modal_';
const MAIL_MODAL_PREFIX = 'player-info_mail_modal_';
const RANK_MODAL_PREFIX = 'player-info_rank_modal_';

const RANK_CHOICES = [
    { label: 'R1', value: 1 },
    { label: 'R2', value: 2 },
    { label: 'R3', value: 3 },
    { label: 'R4', value: 4 },
    { label: 'R5', value: 99 }
];

function buildAccountActionRows(kingdomId) {
    if (!kingdomId) {
        return [];
    }

    const blacklistButton = new ButtonBuilder()
        .setCustomId(`${BL_BUTTON_PREFIX}${kingdomId}`)
        .setLabel('BL')
        .setStyle(ButtonStyle.Danger);

    const unblacklistButton = new ButtonBuilder()
        .setCustomId(`${UBL_BUTTON_PREFIX}${kingdomId}`)
        .setLabel('UBL')
        .setStyle(ButtonStyle.Secondary);

    const kickButton = new ButtonBuilder()
        .setCustomId(`${KICK_BUTTON_PREFIX}${kingdomId}`)
        .setLabel('Kick')
        .setStyle(ButtonStyle.Danger);

    const mailButton = new ButtonBuilder()
        .setCustomId(`${MAIL_BUTTON_PREFIX}${kingdomId}`)
        .setLabel('Mail')
        .setStyle(ButtonStyle.Primary);

    const inviteButton = new ButtonBuilder()
        .setCustomId(`${INVITE_BUTTON_PREFIX}${kingdomId}`)
        .setLabel('Invite')
        .setStyle(ButtonStyle.Primary);

    const rankButton = new ButtonBuilder()
        .setCustomId(`${RANK_BUTTON_PREFIX}${kingdomId}`)
        .setLabel('Rank')
        .setStyle(ButtonStyle.Primary);

    const primaryRow = new ActionRowBuilder().addComponents(blacklistButton, unblacklistButton, kickButton);
    const secondaryRow = new ActionRowBuilder().addComponents(mailButton, inviteButton, rankButton);

    return [primaryRow, secondaryRow];
}

async function handleButtonInteraction(interaction, sql, api) {
    const customId = interaction.customId || '';

    if (customId.startsWith(BL_BUTTON_PREFIX)) {
        const kingdomId = customId.slice(BL_BUTTON_PREFIX.length);
        await handleBlacklistButton(interaction, kingdomId);
        return;
    }

    if (customId.startsWith(UBL_BUTTON_PREFIX)) {
        const kingdomId = customId.slice(UBL_BUTTON_PREFIX.length);
        await handleUnblacklistButton(interaction, kingdomId, sql);
        return;
    }

    if (customId.startsWith(MAIL_BUTTON_PREFIX)) {
        const kingdomId = customId.slice(MAIL_BUTTON_PREFIX.length);
        await handleSendMailButton(interaction, kingdomId, sql);
        return;
    }

    if (customId.startsWith(INVITE_BUTTON_PREFIX)) {
        const kingdomId = customId.slice(INVITE_BUTTON_PREFIX.length);
        await handleInviteButton(interaction, kingdomId, sql, api);
        return;
    }

    if (customId.startsWith(RANK_BUTTON_PREFIX)) {
        const kingdomId = customId.slice(RANK_BUTTON_PREFIX.length);
        await handleRankButton(interaction, kingdomId, sql);
        return;
    }

    if (customId.startsWith(KICK_BUTTON_PREFIX)) {
        const kingdomId = customId.slice(KICK_BUTTON_PREFIX.length);
        await handleKickButton(interaction, kingdomId, sql, api);
        return;
    }

    await interaction.reply({ content: 'Unsupported action for this button.', flags: 64 });
}

async function handleModalSubmission(interaction, sql, api) {
    const customId = interaction.customId || '';

    if (customId.startsWith(BLACKLIST_MODAL_PREFIX)) {
        const kingdomId = customId.slice(BLACKLIST_MODAL_PREFIX.length);
        await handleBlacklistModalSubmission(interaction, kingdomId, sql, api);
        return;
    }

    if (customId.startsWith(MAIL_MODAL_PREFIX)) {
        const kingdomId = customId.slice(MAIL_MODAL_PREFIX.length);
        await handleMailModalSubmission(interaction, kingdomId, sql, api);
        return;
    }

    if (customId.startsWith(RANK_MODAL_PREFIX)) {
        const kingdomId = customId.slice(RANK_MODAL_PREFIX.length);
        await handleRankModalSubmission(interaction, kingdomId, sql, api);
        return;
    }

    await interaction.reply({ content: 'Unsupported modal submission.', flags: 64 });
}

async function handleBlacklistButton(interaction, kingdomId) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to blacklist kingdoms.', flags: 64 });
        return;
    }

    if (!interaction.guild) {
        await interaction.reply({ content: 'This action can only be performed inside a server.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The selected kingdom ID appears to be invalid.', flags: 64 });
        return;
    }

    const modal = buildBlacklistModal(kingdomId);
    await interaction.showModal(modal);
}

async function handleUnblacklistButton(interaction, kingdomId, sql) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to unblacklist kingdoms.', flags: 64 });
        return;
    }

    if (!interaction.guild) {
        await interaction.reply({ content: 'This action can only be performed inside a server.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The selected kingdom ID appears to be invalid.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const guildId = interaction.guild.id;
        const isBlacklisted = await sql.isKingdomBlacklisted(kingdomId, guildId);
        if (!isBlacklisted) {
            await interaction.editReply({ content: 'This kingdom is not currently blacklisted.' });
            return;
        }

        const nameRecord = await sql.getKingdomNameAndAlliance(kingdomId);
        const displayName = nameRecord?.[0]?.name || kingdomId;
        const discordId = (await sql.getVerifiedDiscordId(kingdomId, guildId))?.[0]?.discordId;

        await sql.removeFromBlacklist(kingdomId, guildId);

        const successMessage = `${displayName} (${kingdomId}) has been removed from the blacklist.`;
        await interaction.editReply({ content: successMessage });

        await notifyBlacklistChange(interaction, {
            kingdomId,
            displayName,
            discordId,
            moderatorId: interaction.user.id,
            guildId,
            action: 'unblacklisted'
        });
    } catch (error) {
        console.error('Error while unblacklisting kingdom:', error);
        await interaction.editReply({ content: 'Failed to unblacklist this kingdom. Please try again later.' });
    }
}

async function handleBlacklistModalSubmission(interaction, kingdomId, sql, api) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to blacklist kingdoms.', flags: 64 });
        return;
    }

    const guildId = interaction.guild?.id;
    if (!guildId) {
        await interaction.reply({ content: 'Unable to determine the guild for this request.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The supplied kingdom ID is invalid.', flags: 64 });
        return;
    }

    const reason = interaction.fields.getTextInputValue('desc')?.trim();
    const expiryInput = interaction.fields.getTextInputValue('expir')?.trim();

    if (!reason) {
        await interaction.reply({ content: 'A blacklist reason is required.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const existing = await sql.isKingdomBlacklisted(kingdomId, guildId);
        if (existing) {
            const expiration = existing?.[0]?.expiration
                ? `<t:${Math.floor(new Date(existing[0].expiration).getTime() / 1000)}:f>`
                : 'an unspecified time';
            await interaction.editReply({ content: `This kingdom is already blacklisted until ${expiration}.` });
            return;
        }

        const expirationDate = parseExpirationInput(expiryInput);
        const permanent = !expirationDate;
        const effectiveExpiration = expirationDate || new Date('2030-12-12T00:00:00Z');

        const nameRecord = await sql.getKingdomNameAndAlliance(kingdomId);
        const displayName = nameRecord?.[0]?.name || kingdomId;
        const allianceId = nameRecord?.[0]?.allianceId || null;
        const allianceTag = nameRecord?.[0]?.allianceTag || null;
        const discordId = (await sql.getVerifiedDiscordId(kingdomId, guildId))?.[0]?.discordId;

        await sql.addToBlacklist(interaction.user.id, kingdomId, effectiveExpiration, reason, guildId);

        const baseMessageParts = [
            `${displayName} (${kingdomId}) has been ${permanent ? 'permanently' : 'temporarily'} blacklisted`,
            permanent ? '' : `until <t:${Math.floor(effectiveExpiration.getTime() / 1000)}:f>`,
            `for: ${reason}`
        ].filter(Boolean);

        await interaction.editReply({ content: baseMessageParts.join(' ') });

        await notifyBlacklistChange(interaction, {
            kingdomId,
            displayName,
            discordId,
            moderatorId: interaction.user.id,
            guildId,
            reason,
            expiration: permanent ? null : effectiveExpiration,
            action: 'blacklisted'
        });

        await attemptKickFromAlliance({
            sql,
            api,
            kingdomId,
            displayName,
            allianceId,
            allianceTag,
            guildId,
            interaction
        });
    } catch (error) {
        console.error('Error while blacklisting kingdom:', error);
        await interaction.editReply({ content: 'Failed to blacklist this kingdom. Please try again later.' });
    }
}

function buildBlacklistModal(kingdomId) {
    const modal = new ModalBuilder()
        .setCustomId(`${BLACKLIST_MODAL_PREFIX}${kingdomId}`)
        .setTitle('Blacklist Kingdom');

    const reasonInput = new TextInputBuilder()
        .setCustomId('desc')
        .setLabel('Reason')
        .setRequired(true)
        .setStyle(TextInputStyle.Paragraph);

    const expiryInput = new TextInputBuilder()
        .setCustomId('expir')
        .setLabel('Expiration (hours or YYYY-MM-DD)')
        .setRequired(false)
        .setStyle(TextInputStyle.Short);

    modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput),
        new ActionRowBuilder().addComponents(expiryInput)
    );

    return modal;
}

async function handleSendMailButton(interaction, kingdomId, sql) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to mail kingdoms.', flags: 64 });
        return;
    }

    if (!interaction.guild) {
        await interaction.reply({ content: 'This action can only be performed inside a server.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The selected kingdom ID appears to be invalid.', flags: 64 });
        return;
    }

    let displayName = kingdomId;
    try {
        const nameRecord = await sql.getKingdomNameAndAlliance(kingdomId);
        displayName = nameRecord?.[0]?.name || kingdomId;
    } catch (error) {
        console.error('Failed to resolve kingdom name for mail modal:', error);
    }

    const modal = buildMailModal(kingdomId, displayName);
    await interaction.showModal(modal);
}

function buildMailModal(kingdomId, displayName) {
    const modal = new ModalBuilder()
        .setCustomId(`${MAIL_MODAL_PREFIX}${kingdomId}`)
        .setTitle(`Mail ${displayName}`.slice(0, 45));

    const subjectInput = new TextInputBuilder()
        .setCustomId('mail_subject')
        .setLabel('Subject (optional)')
        .setRequired(false)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Subject line or leave blank');

    const contentInput = new TextInputBuilder()
        .setCustomId('mail_content')
        .setLabel('Message')
        .setRequired(true)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the mail body...');

    modal.addComponents(
        new ActionRowBuilder().addComponents(subjectInput),
        new ActionRowBuilder().addComponents(contentInput)
    );

    return modal;
}

async function handleMailModalSubmission(interaction, kingdomId, sql, api) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to mail kingdoms.', flags: 64 });
        return;
    }

    const guildId = interaction.guild?.id;
    if (!guildId) {
        await interaction.reply({ content: 'Unable to determine the guild for this request.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The supplied kingdom ID is invalid.', flags: 64 });
        return;
    }

    const subjectInput = interaction.fields.getTextInputValue('mail_subject')?.trim() || ''; // optional
    const contentInput = interaction.fields.getTextInputValue('mail_content')?.trim();

    if (!contentInput) {
        await interaction.reply({ content: 'Mail content cannot be empty.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    let mailAccountToken;
    try {
        mailAccountToken = (await sql.getRandomManagerTokenFromGuild(guildId))?.[0]?.token;
    } catch (error) {
        console.error('Failed to retrieve mail token:', error);
    }

    if (!mailAccountToken) {
        await interaction.editReply({ content: 'No mail token is configured for this guild. Manual mail may be required.' });
        return;
    }

    let displayName = kingdomId;
    try {
        const nameRecord = await sql.getKingdomNameAndAlliance(kingdomId);
        displayName = nameRecord?.[0]?.name || kingdomId;
    } catch (error) {
        console.error('Failed to resolve kingdom name while sending mail:', error);
    }

    try {
        const payload = new URLSearchParams({
            json: JSON.stringify({
                toIds: kingdomId,
                subject: subjectInput,
                content: contentInput
            })
        });

        await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/mail/send',
            payload,
            {
                'x-access-token': mailAccountToken,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        );

        const confirmationParts = [
            `Mail sent to ${displayName} (${kingdomId}).`,
            subjectInput ? `Subject: ${subjectInput}` : null
        ].filter(Boolean);

        await interaction.editReply({ content: confirmationParts.join('\n') || 'Mail sent successfully.' });
    } catch (error) {
        console.error('Failed to send alliance mail:', error);
        const errorMessage = error?.response?.data?.message || 'Failed to send mail. Please try again later.';
        await interaction.editReply({ content: errorMessage });
    }
}

async function handleInviteButton(interaction, kingdomId, sql, api) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to invite kingdoms.', flags: 64 });
        return;
    }

    if (!interaction.guild) {
        await interaction.reply({ content: 'This action can only be performed inside a server.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The selected kingdom ID appears to be invalid.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guild.id;

    let allianceRows = [];
    try {
        const rows = await sql.getAllGuildAlliances(guildId);
        if (Array.isArray(rows)) {
            allianceRows = rows.filter(row => row?.allianceId);
        }
    } catch (error) {
        console.error('Failed to retrieve guild alliances for invite:', error);
    }

    if (!allianceRows.length) {
        await interaction.editReply({ content: 'No alliances are linked to this guild.', components: [] });
        return;
    }

    const uniqueAlliances = new Map();
    for (const entry of allianceRows) {
        const allianceIdKey = String(entry.allianceId);
        if (!uniqueAlliances.has(allianceIdKey)) {
            uniqueAlliances.set(allianceIdKey, {
                allianceId: allianceIdKey,
                tag: entry.tag || 'Unknown'
            });
        }
    }

    const alliances = Array.from(uniqueAlliances.values());

    if (alliances.length === 1) {
        const result = await processAllianceInvite({
            sql,
            api,
            kingdomId,
            allianceId: alliances[0].allianceId
        });

        await interaction.editReply({ content: result.message, components: [] });
        return;
    }

    const maxOptions = 25;
    const options = [];

    for (const alliance of alliances.slice(0, maxOptions)) {
        const cleanedLabel = (alliance.tag || 'Alliance').toString();
        const label = cleanedLabel.length > 95 ? cleanedLabel.slice(0, 95) : cleanedLabel;

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(label || 'Alliance')
                .setValue(alliance.allianceId)
                .setDescription(alliance.allianceId)
        );
    }

    if (!options.length) {
        await interaction.editReply({ content: 'No alliances with available manager accounts found.', components: [] });
        return;
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`${INVITE_SELECT_PREFIX}${kingdomId}`)
        .setPlaceholder('Select the alliance to send the invite from')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
        content: 'Choose which alliance should send the invitation:',
        components: [row]
    });
}

async function handleKickButton(interaction, kingdomId, sql, api) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to kick kingdoms.', flags: 64 });
        return;
    }

    if (!interaction.guild) {
        await interaction.reply({ content: 'This action can only be performed inside a server.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The selected kingdom ID appears to be invalid.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guild.id;

    let nameRecord;
    try {
        nameRecord = await sql.getKingdomNameAndAlliance(kingdomId);
    } catch (error) {
        console.error('Failed to resolve kingdom information for kick request:', error);
    }

    const recordEntry = Array.isArray(nameRecord) ? nameRecord[0] : null;
    const displayName = recordEntry?.name || kingdomId;
    const allianceId = recordEntry?.allianceId || null;
    const allianceTag = recordEntry?.allianceTag || null;

    if (!allianceId) {
        await interaction.editReply({ content: `${displayName} (${kingdomId}) is not currently a member of an alliance.` });
        return;
    }

    await interaction.editReply({ content: `Attempting to remove ${displayName} (${kingdomId}) from the alliance...` });

    await attemptKickFromAlliance({
        sql,
        api,
        kingdomId,
        displayName,
        allianceId,
        allianceTag,
        guildId,
        interaction
    });

    await interaction.editReply({ content: `Kick attempt processed for ${displayName} (${kingdomId}). Check the follow-up message for the result.` });
}

async function handleRankButton(interaction, kingdomId, sql) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to change ranks.', flags: 64 });
        return;
    }

    if (!interaction.guild) {
        await interaction.reply({ content: 'This action can only be performed inside a server.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The selected kingdom ID appears to be invalid.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    let displayName = kingdomId;
    try {
        const nameRecord = await sql.getKingdomNameAndAlliance(kingdomId);
        displayName = nameRecord?.[0]?.name || kingdomId;
    } catch (error) {
        console.error('Failed to resolve kingdom name for rank selection:', error);
    }

    const options = RANK_CHOICES.map(choice => {
        const value = choice.label;
        const description = choice.label === 'R5'
            ? 'Alliance leader'
            : `Set member to ${choice.label}`;

        return new StringSelectMenuOptionBuilder()
            .setLabel(choice.label)
            .setValue(value)
            .setDescription(description);
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`${RANK_SELECT_PREFIX}${kingdomId}`)
        .setPlaceholder('Choose the new rank')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
        content: `Select a new rank for ${displayName} (${kingdomId}):`,
        components: [row]
    });
}

async function handleRankSelect(interaction, sql, api) {
    const customId = interaction.customId || '';
    if (!customId.startsWith(RANK_SELECT_PREFIX)) {
        return;
    }

    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to change ranks.', flags: 64 });
        return;
    }

    const guildId = interaction.guild?.id;
    if (!guildId) {
        await interaction.reply({ content: 'Unable to determine the guild for this request.', flags: 64 });
        return;
    }

    const kingdomId = customId.slice(RANK_SELECT_PREFIX.length);
    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The supplied kingdom ID is invalid.', flags: 64 });
        return;
    }

    const selectedValue = interaction.values?.[0];
    const resolvedRank = resolveRankInput(selectedValue);
    if (!resolvedRank) {
        await interaction.reply({ content: 'Invalid rank selection.', flags: 64 });
        return;
    }

    await interaction.deferUpdate();
    await interaction.editReply({ content: 'Updating rank...', components: [] });

    await processRankChange({
        interaction,
        sql,
        api,
        guildId,
        kingdomId,
        resolvedRank
    });
}

async function handleRankModalSubmission(interaction, kingdomId, sql, api) {
    if (!memberHasKickPermission(interaction)) {
        await interaction.reply({ content: 'You need Kick Members permission to change ranks.', flags: 64 });
        return;
    }

    const guildId = interaction.guild?.id;
    if (!guildId) {
        await interaction.reply({ content: 'Unable to determine the guild for this request.', flags: 64 });
        return;
    }

    if (!isValidKingdomId(kingdomId)) {
        await interaction.reply({ content: 'The supplied kingdom ID is invalid.', flags: 64 });
        return;
    }

    const rankInput = (interaction.fields.getTextInputValue('rank_value') || '').trim().toUpperCase();
    const resolvedRank = resolveRankInput(rankInput);

    if (!resolvedRank) {
        await interaction.reply({ content: 'Invalid rank. Please enter R1, R2, R3, R4, or R5.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });
    await processRankChange({
        interaction,
        sql,
        api,
        guildId,
        kingdomId,
        resolvedRank
    });
}

async function processRankChange({ interaction, sql, api, guildId, kingdomId, resolvedRank }) {
    if (!guildId) {
        await interaction.editReply({ content: 'Unable to determine the guild for this request.', components: [] });
        return;
    }

    const encryption = new Encryption();

    let tokenResult;
    try {
        tokenResult = await sql.getRandomNonIdleTokenFromGuild(guildId);
    } catch (error) {
        console.error('Failed to fetch non-idle token for rank change:', error);
    }

    const token = tokenResult?.[0]?.token;
    if (!token) {
        await interaction.editReply({ content: 'No valid bot token found for this guild.', components: [] });
        return;
    }

    let xorPass;
    try {
        xorPass = (await sql.getXORPass())?.[0]?.value || null;
    } catch (error) {
        console.error('Failed to retrieve XOR password for rank change:', error);
    }

    try {
        const body = await encryption.buildRequestBody({ kingdomId: String(kingdomId) }, xorPass);
        const basicPlayerInfoResponse = await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
            body,
            { 'x-access-token': token, 'Content-Type': 'application/json' }
        );

        const decrypted = JSON.parse(await encryption.decryptXorMessage(basicPlayerInfoResponse.data, xorPass));
        const profile = decrypted?.profile;

        if (!profile) {
            await interaction.editReply({ content: 'Player not found or invalid kingdom ID.', components: [] });
            return;
        }

        const playerContinentRaw = profile.worldId ?? profile.continent ?? profile.world ?? profile.location?.continent ?? null;
        const playerContinent = playerContinentRaw !== null && playerContinentRaw !== undefined ? Number(playerContinentRaw) : null;

        let guildContinents = [];
        try {
            const worldIds = await sql.getGuildWorldIds(guildId);
            if (Array.isArray(worldIds)) guildContinents = worldIds;
        } catch (continentError) {
            console.error('Failed to fetch guild continents for rank change:', continentError);
        }

        if (!guildContinents.length) {
            await interaction.editReply({ content: 'No continents are linked to this guild. Configure a continent before changing ranks.', components: [] });
            return;
        }

        if (!Number.isFinite(playerContinent) || !guildContinents.includes(playerContinent)) {
            await interaction.editReply({ content: 'This player is not on a continent linked to this guild.', components: [] });
            return;
        }

        const allianceId = profile.alliance?._id;
        if (!allianceId) {
            await interaction.editReply({ content: 'This player is not currently in an alliance.', components: [] });
            return;
        }

        let guildAllianceRows = [];
        try {
            const rows = await sql.getAllGuildAlliances(guildId);
            if (Array.isArray(rows)) {
                guildAllianceRows = rows;
            }
        } catch (alliancesError) {
            console.error('Failed to fetch guild alliances for rank change:', alliancesError);
        }

        const guildAllianceIds = new Set(guildAllianceRows.map(row => String(row?.allianceId)));

        if (!guildAllianceIds.has(String(allianceId))) {
            await interaction.editReply({ content: 'This player is not part of an alliance linked to this guild.', components: [] });
            return;
        }

        let managerInfoResult = [];
        try {
            const rows = await sql.getManagerInfoByAllianceId(allianceId);
            if (Array.isArray(rows)) {
                managerInfoResult = rows;
            }
        } catch (managerInfoError) {
            console.error('Failed to fetch manager info for rank change:', managerInfoError);
        }

        if (!managerInfoResult || managerInfoResult.length === 0) {
            await interaction.editReply({ content: 'No manager bot found for this player\'s alliance.', components: [] });
            return;
        }

        const managerInfo = managerInfoResult[0];
        const managerToken = managerInfo.token;
        const managerKingdomId = managerInfo.kingdomId;

        if (!managerToken || !managerKingdomId) {
            await interaction.editReply({ content: 'Manager account data is incomplete for this alliance.', components: [] });
            return;
        }

        const managerBody = await encryption.buildRequestBody({ kingdomId: String(managerKingdomId) }, xorPass);
        const managerProfileResponse = await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
            managerBody,
            { 'x-access-token': token, 'Content-Type': 'application/json' }
        );

        const managerDecrypted = JSON.parse(await encryption.decryptXorMessage(managerProfileResponse.data, xorPass));
        const managerProfile = managerDecrypted?.profile;

        const managerRank = managerProfile?.alliance?.rank ?? 99;

        if (!canManagerAssignRank(managerRank, resolvedRank.value)) {
            await interaction.editReply({ content: `Manager (rank R${managerRank === 99 ? 5 : managerRank}) cannot assign the requested rank.`, components: [] });
            return;
        }

        const rankBody = await encryption.buildRequestBody(
            { memberKingdomId: String(kingdomId), rank: Number(resolvedRank.value), title: 0 },
            xorPass
        );
        await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/alliance/member/rank',
            rankBody,
            { 'x-access-token': managerToken, 'Content-Type': 'application/json' }
        );

        const playerName = profile.name || kingdomId;
        const previousRank = profile.alliance?.rank ?? null;
        const previousRankLabel = formatRankLabel(previousRank);
        const newRankLabel = resolvedRank.label;

        const confirmationLines = [
            `Rank updated for ${playerName} (${kingdomId}).`,
            previousRankLabel ? `Previous Rank: ${previousRankLabel}` : null,
            `New Rank: ${newRankLabel}`
        ].filter(Boolean);

        await interaction.editReply({ content: confirmationLines.join('\n'), components: [] });
    } catch (error) {
        console.error('Error processing rank change:', error);
        await interaction.editReply({ content: 'An error occurred while changing the rank. Please try again later.', components: [] });
    }
}

async function handleInviteSelect(interaction, sql, api) {
    const customId = interaction.customId || '';
    if (!customId.startsWith(INVITE_SELECT_PREFIX)) {
        return;
    }

    const kingdomId = customId.slice(INVITE_SELECT_PREFIX.length);
    const allianceId = interaction.values?.[0];

    if (!allianceId) {
        await interaction.reply({ content: 'No alliance was selected.', flags: 64 });
        return;
    }

    await interaction.deferUpdate();

    const result = await processAllianceInvite({ sql, api, kingdomId, allianceId });

    await interaction.editReply({ content: result.message, components: [] });
}

async function processAllianceInvite({ sql, api, kingdomId, allianceId }) {
    let managerInfoRows = [];
    try {
        const rows = await sql.getManagerInfoByAllianceId(allianceId);
        if (Array.isArray(rows)) {
            managerInfoRows = rows;
        }
    } catch (error) {
        console.error('Failed to fetch manager info for alliance invite:', error);
    }

    const managerInfo = managerInfoRows?.[0];
    if (!managerInfo?.token) {
        return {
            success: false,
            message: 'No manager token is configured for the selected alliance. Manual invite may be required.'
        };
    }

    const managerToken = managerInfo.token;
    const allianceTag = managerInfo.allianceTag || '';

    let displayName = kingdomId;
    try {
        const nameRecord = await sql.getKingdomNameAndAlliance(kingdomId);
        displayName = nameRecord?.[0]?.name || kingdomId;
    } catch (error) {
        console.error('Failed to resolve kingdom name while inviting:', error);
    }

    try {
        const payload = new URLSearchParams({
            json: JSON.stringify({ kingdomId })
        });

        await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/alliance/invite',
            payload,
            {
                'x-access-token': managerToken,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        );

        const allianceLabel = allianceTag ? `[${allianceTag}]` : 'the selected alliance';

        return {
            success: true,
            message: `${displayName} (${kingdomId}) has been invited by ${allianceLabel}.`
        };
    } catch (error) {
        console.error('Failed to send alliance invite:', error);
        const apiMessage = error?.response?.data?.message || 'Failed to send invite. Please try again later.';
        return {
            success: false,
            message: apiMessage
        };
    }
}

function resolveRankInput(input) {
    if (!input) {
        return null;
    }

    const normalized = input.startsWith('R') ? input : `R${input}`;
    const match = RANK_CHOICES.find(choice => choice.label === normalized);
    if (match) {
        return match;
    }

    const numeric = Number(input);
    if (Number.isFinite(numeric)) {
        const matchedNumeric = RANK_CHOICES.find(choice => choice.value === numeric);
        return matchedNumeric || null;
    }

    return null;
}

function canManagerAssignRank(managerRank, targetRankValue) {
    if (managerRank === 99) {
        return true; // R5 manager can assign any rank
    }

    if (managerRank === 4) {
        return targetRankValue < 4; // R4 can assign R1-R3 only
    }

    return false; // R1-R3 cannot assign ranks
}

function formatRankLabel(rankValue) {
    if (rankValue === null || rankValue === undefined) {
        return null;
    }

    const numeric = Number(rankValue);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    if (numeric === 99) {
        return 'R5';
    }

    if (numeric >= 1 && numeric <= 4) {
        return `R${numeric}`;
    }

    return null;
}

function formatAllianceWithRank(tag, rankValue) {
    const normalizedTag = typeof tag === 'string' ? tag.trim() : '';
    const hasAllianceTag = normalizedTag.length > 0;
    const rankLabel = formatRankLabel(rankValue);

    if (!hasAllianceTag) {
        return 'no alliance';
    }

    return rankLabel ? `${normalizedTag} (${rankLabel})` : normalizedTag;
}

function memberHasKickPermission(interaction) {
    return Boolean(interaction?.memberPermissions?.has(PermissionFlagsBits.KickMembers));
}

function isValidKingdomId(id) {
    return /^[a-f0-9]{24}$/i.test(id);
}

function parseExpirationInput(input) {
    if (!input) {
        return null;
    }

    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(trimmed)) {
        const date = new Date(`${trimmed}T00:00:00Z`);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
        const now = new Date();
        now.setHours(now.getHours() + numeric);
        return now;
    }

    return null;
}

async function notifyBlacklistChange(interaction, details) {
    const sql = module.exports.sql;
    const guildId = details.guildId;

    try {
        const logChannel = (await sql.getGuildLogChannels(guildId))?.[0]?.accept_log_channel;
        const blacklistChannel = (await sql.getGuildBlacklistLogChannel(guildId))?.[0]?.blacklist_log_channel;

        const actionSummary = details.action === 'blacklisted'
            ? `${details.displayName} (${details.kingdomId}) has been blacklisted${details.reason ? ` for ${details.reason}` : ''}`
            : `${details.displayName} (${details.kingdomId}) has been unblacklisted`;

        const moderatorMention = `<@${details.moderatorId}>`;
        const targetMention = details.discordId ? `<@${details.discordId}>` : '<Unknown User>';
        const expirationText = details.action === 'blacklisted' && details.expiration
            ? ` until <t:${Math.floor(details.expiration.getTime() / 1000)}:f>`
            : '';

        const composed = `${actionSummary}${expirationText} by ${moderatorMention} (${targetMention}).`;

        if (logChannel) {
            await safeChannelSend(interaction.client, logChannel, composed);
        }

        if (blacklistChannel) {
            await safeChannelSend(interaction.client, blacklistChannel, composed);
        }

        if (details.discordId && details.action === 'blacklisted') {
            await safeUserDM(interaction.client, details.discordId, composed);
        }

        if (details.discordId && details.action === 'unblacklisted') {
            await safeUserDM(interaction.client, details.discordId, `${details.displayName} (${details.kingdomId}) has been removed from the blacklist.`);
        }
    } catch (error) {
        console.error('Failed to send blacklist notifications:', error);
    }
}

async function attemptKickFromAlliance({
    sql,
    api,
    kingdomId,
    displayName,
    allianceId,
    allianceTag,
    guildId,
    interaction
}) {
    if (!allianceId) {
    await interaction.followUp({ content: 'No alliance information was found. Manual kick may be required.', flags: 64 });
        return;
    }

    let kingdomContinent = null;
    try {
        const kingdomContinentRows = await sql.getKingdomContinent(kingdomId);
        if (Array.isArray(kingdomContinentRows) && kingdomContinentRows.length > 0) {
            const parsedContinent = Number(kingdomContinentRows[0]?.continent);
            if (!Number.isNaN(parsedContinent)) {
                kingdomContinent = parsedContinent;
            }
        }
    } catch (error) {
        console.error('Error fetching kingdom continent:', error);
    }

    let guildContinents = [];
    try {
        const worldIds = await sql.getGuildWorldIds(guildId);
        if (Array.isArray(worldIds)) guildContinents = worldIds;
    } catch (error) {
        console.error('Error fetching guild continents:', error);
    }

    const canAttemptKick = kingdomContinent !== null && guildContinents.includes(kingdomContinent);
    if (!canAttemptKick) {
        const reasonText = kingdomContinent === null
            ? 'Unable to determine the kingdom continent. Manual kick may be required.'
            : `Continent ${kingdomContinent} is not linked to this server. Manual kick may be required.`;
    await interaction.followUp({ content: reasonText, flags: 64 });
        return;
    }

    let managerToken;
    try {
        managerToken = (await sql.getManagerToken(allianceId))?.[0]?.token;
    } catch (error) {
        console.error('Error fetching manager token:', error);
    }

    if (!managerToken) {
    await interaction.followUp({ content: `Unable to locate a manager token for alliance ${allianceTag || allianceId}. Manual kick may be required.`, flags: 64 });
        return;
    }

    try {
        const response = await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/alliance/member/disband',
            { memberKingdomId: kingdomId },
            { 'x-access-token': managerToken, 'Content-Type': 'application/json' }
        );
        console.log('Kick API response:', response?.data);

        if (response?.data?.result) {
            await interaction.followUp({ content: `${displayName} (${kingdomId}) has been removed from the alliance.`, flags: 64 });
        } else {
            await interaction.followUp({ content: 'Alliance kick attempt returned an unexpected response. Manual kick may be required.', flags: 64 });
        }
    } catch (error) {
        console.error('Kick API error:', error);
    await interaction.followUp({ content: 'Failed to automatically kick the kingdom. Manual kick may be required.', flags: 64 });
    }
}

async function safeChannelSend(client, channelId, message) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            return;
        }
        await channel.send(message);
    } catch (error) {
        console.error(`Failed to send message to channel ${channelId}:`, error);
    }
}

async function safeUserDM(client, userId, message) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) {
            return;
        }
        await user.send(message);
    } catch (error) {
        console.error(`Failed to DM user ${userId}:`, error);
    }
}