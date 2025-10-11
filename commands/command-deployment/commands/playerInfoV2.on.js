const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder } = require("discord.js");
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
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const encryption = new Encryption();

        try {
            if (!interaction.guild) {
                await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
                return;
            }

            const guildId = interaction.guild.id;
            const ephemeralFlag = await sql.getEphemeral(guildId);
            const ephemeral = ephemeralFlag ? { flags: 64 } : {};

            // Check subscription
            const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "3");
            if (!subscriptionFlagInfo) {
                await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription. ", flags: 64 });
                return;
            }

            await interaction.deferReply(ephemeral);

            const playerOption = interaction.options.getString("player");
            const discordOption = interaction.options.getUser("discord");

            if (playerOption) {
                // Handle specific kingdom
                await handleKingdomInfo(interaction, playerOption, sql, api, encryption, ephemeral, guildId);
            } else if (discordOption) {
                // Handle all kingdoms for a discord user
                await handleDiscordUserInfo(interaction, discordOption, sql, api, encryption, ephemeral, guildId);
            } else {
                // No options provided - show user's own kingdoms
                await handleOwnKingdomsSelection(interaction, sql, ephemeral, guildId);
            }
        } catch (error) {
            console.error('Error in player-info execute:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "An error occurred while processing your request.", ephemeral: true });
            } else {
                await interaction.editReply({ content: "An error occurred while processing your request." });
            }
        }
    },

    async autocomplete(interaction) {
        await handleNameAutocomplete(interaction, module.exports.sql);
    },

    async stringselect(interaction) {
        if (!interaction.customId.startsWith("player-info_selectkingdom")) return;

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

        const discordDetails = await getDiscordVerificationDetails(interaction, sql, playerInfo.kingdomId);
        const economyDetails = discordDetails
            ? await getEconomyDetails(sql, effectiveGuildId, discordDetails.discordId)
            : null;
        const combatStats = await getCombatStats(sql, playerInfo.kingdomId);
        const combatDeltas = await getCombatDeltaStats(sql, playerInfo.kingdomId, combatStats);
        const socialStats = await getSocialStats(sql, playerInfo.kingdomId, effectiveGuildId);
        const licenseSummary = await getKingdomLicenseSummary(sql, playerInfo.kingdomId, playerInfo.continent, effectiveGuildId);
        const blacklistEntries = await getBlacklistStatus(sql, playerInfo.kingdomId, effectiveGuildId);
        const pastNamesHistory = await getPastNamesHistory(sql, playerInfo.kingdomId);
        const embed = buildPlayerEmbed(playerInfo, discordDetails, economyDetails, combatStats, combatDeltas, socialStats, licenseSummary, blacklistEntries, pastNamesHistory);

        let imageArtifacts = null;
        try {
            if (playerInfo.kingdomId) {
                imageArtifacts = await fetchPlayerProfileImageAttachment(api, playerInfo.kingdomId);
                if (imageArtifacts?.attachment && imageArtifacts?.imageName) {
                    embed.setThumbnail(`attachment://${imageArtifacts.imageName}`);
                }
            }

            const replyPayload = { embeds: [embed], ...ephemeral };
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

async function handleDiscordUserInfo(interaction, discordUser, sql, api, encryption, ephemeral, guildId) {
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

    const embedResults = [];
    const verificationCache = new Map();
    const economyCache = new Map();
    const summaryData = {
        discordDetails: null,
        economyDetails: null,
        socialTotals: null,
        accountEntries: []
    };
    for (const kingdom of kingdoms) {
        const token = (await sql.getRandomManagerTokenFromGuild(effectiveGuildId))[0]?.token;
        if (!token) continue;

        const playerInfo = await getPlayerInfo(kingdom.kingdomId, token, sql, api, encryption, effectiveGuildId);
        if (!playerInfo) continue;

        const discordDetails = await getDiscordVerificationDetails(interaction, sql, playerInfo.kingdomId, verificationCache);
        let economyDetails = null;
        if (discordDetails) {
            if (economyCache.has(discordDetails.discordId)) {
                economyDetails = economyCache.get(discordDetails.discordId);
            } else {
                economyDetails = await getEconomyDetails(sql, effectiveGuildId, discordDetails.discordId);
                economyCache.set(discordDetails.discordId, economyDetails);
            }
        }

        const combatStats = await getCombatStats(sql, playerInfo.kingdomId);
        const combatDeltas = await getCombatDeltaStats(sql, playerInfo.kingdomId, combatStats);
        const socialStats = await getSocialStats(sql, playerInfo.kingdomId, effectiveGuildId);
        const licenseSummary = await getKingdomLicenseSummary(sql, playerInfo.kingdomId, playerInfo.continent, effectiveGuildId);
        const blacklistEntries = await getBlacklistStatus(sql, playerInfo.kingdomId, effectiveGuildId);
        const pastNamesHistory = await getPastNamesHistory(sql, playerInfo.kingdomId);

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

        const allianceTag = playerInfo.allianceTag && playerInfo.allianceTag.trim() !== ''
            ? playerInfo.allianceTag.trim()
            : 'no alliance';

        summaryData.accountEntries.push({
            name: playerInfo.name || playerInfo.kingdomId || 'Unknown',
            kingdomId: playerInfo.kingdomId || 'Unknown',
            level: Number.isFinite(Number(playerInfo.level)) ? Number(playerInfo.level) : 'Unknown',
            alliance: allianceTag,
            power: Number.isFinite(Number(playerInfo.power)) ? Number(playerInfo.power) : null,
            licenseSummary
        });

        const embed = buildPlayerEmbed(playerInfo, discordDetails, economyDetails, combatStats, combatDeltas, socialStats, licenseSummary, blacklistEntries, pastNamesHistory);

        const resultEntry = { embed, attachment: null, filePath: null };

        if (playerInfo.kingdomId) {
            const imageArtifacts = await fetchPlayerProfileImageAttachment(api, playerInfo.kingdomId);
            if (imageArtifacts?.attachment && imageArtifacts?.imageName) {
                embed.setThumbnail(`attachment://${imageArtifacts.imageName}`);
                resultEntry.attachment = imageArtifacts.attachment;
                resultEntry.filePath = imageArtifacts.filePath || null;
            } else if (imageArtifacts?.filePath) {
                resultEntry.filePath = imageArtifacts.filePath;
            }
        }
        console.log(`Prepared embed result for kingdom ID: ${playerInfo.kingdomId}`);

        embedResults.push(resultEntry);
    }

    if (embedResults.length === 0) {
        cleanupTempFiles(embedResults.map(entry => entry.filePath));
        await interaction.editReply({ content: "Unable to retrieve information for the linked kingdoms at this time.", ...ephemeral });
        return;
    }

    const isEphemeral = Boolean(ephemeral?.flags);
    const [firstResult, ...remainingResults] = embedResults;

    try {
        await sendEmbedResponse(interaction, firstResult, { isEphemeral, isInitial: true, ephemeralFlags: ephemeral });

        for (const result of remainingResults) {
            await sendEmbedResponse(interaction, result, { isEphemeral, isInitial: false });
        }

        const summaryEmbed = buildDiscordAccountsSummaryEmbed(discordUser, summaryData);
        if (summaryEmbed) {
            const summaryPayload = { embeds: [summaryEmbed] };
            if (isEphemeral) {
                summaryPayload.ephemeral = true;
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

async function getAdditionalKingdomData(kingdomId, guildId, sql) {
    const data = {};

    try {
        // Blacklist status
        const blacklist = await sql.isKingdomBlacklisted(kingdomId, guildId);
        data.blacklist = blacklist;
    } catch (error) {
        console.error('Error getting blacklist status:', error);
        data.blacklist = null;
    }

    try {
        // Past names
        data.pastNames = await sql.getPastKingdomNames(kingdomId);
    } catch (error) {
        console.error('Error getting past names:', error);
        data.pastNames = [];
    }
    return data;
}

function calculateStatsChange(latest, older) {
    if (!latest || !older) return null;

    return {
        powerChange: (latest.power || 0) - (older.power || 0),
        killsChange: (latest.kills || 0) - (older.kills || 0),
        gatheringChange: (latest.gathering || 0) - (older.gathering || 0)
    };
}

function buildPlayerEmbed(playerInfo, discordDetails, economyDetails, combatStats, combatDeltas, socialStats, licenseSummary, blacklistEntries, pastNamesHistory) {
    const safeName = playerInfo.name || "Unknown";

    const embed = new EmbedBuilder()
        .setTitle(`${safeName}'s information`)
        .setColor("#007ACC")
        .setTimestamp();

    const allianceTag = playerInfo.allianceTag && playerInfo.allianceTag.trim() !== ''
        ? playerInfo.allianceTag.trim()
        : 'no alliance';

    const accountInfoValue = [
        `• Kingdom ID: ${playerInfo.kingdomId || 'Unknown'}`,
        `• Continent: ${playerInfo.continent ?? 'Unknown'}`,
        `• Level: ${playerInfo.level ?? 'Unknown'}`,
        `• Alliance: ${allianceTag}`,
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

async function getPastNamesHistory(sql, kingdomId) {
    try {
        const rows = await sql.getPastKingdomNames(kingdomId);
        if (!rows || rows.length === 0) {
            return [];
        }

        return rows
            .filter(entry => entry?.name && entry?.date)
            .map(entry => {
                const firstUsed = new Date(entry.date);
                return Number.isNaN(firstUsed.getTime())
                    ? null
                    : { name: entry.name, firstUsed };
            })
            .filter(Boolean);
    } catch (error) {
        console.error('Error retrieving past kingdom names:', error);
        return [];
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

    return ['• Status: ❌ Blacklisted', `• Expires: ${expiration}`].join('\n');
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

async function sendEmbedResponse(interaction, resultEntry, { isEphemeral, isInitial, ephemeralFlags }) {
    const payload = { embeds: [resultEntry.embed] };

    if (resultEntry.attachment) {
        payload.files = [resultEntry.attachment];
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
    const xorPass = (await sql.getXORPass())[0].value;
    const b64EncryptedKingdomId = await encryption.createXorMessage(`{"kingdomId":"${kingdomId}"}`, xorPass);

    let basicPlayerInfoResponse;
    let historyPlayerInfoResponse;

    try {
        basicPlayerInfoResponse = await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
            { json: b64EncryptedKingdomId },
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
        pastKingdomNames: pastKingdomNames
            .filter(obj => !!obj.name && !!obj.date)
            .map(obj => `${obj.name} - __Date: ${new Date(obj.date).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}__`)
            .join("\n") || "None"
    };
}

async function getMemberLocation(kingdomId, allianceId, token, api, sql) {
    if (!allianceId) return { x: 0, y: 0, continent: 0 };

    const managerToken = (await sql.getManagerToken(allianceId))[0]?.token;

    try {
        const response = await api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/fo",
            { json: `{"targetId":"${kingdomId}"}` },
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
            { json: `{"allianceId":"${allianceId}"}` },
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