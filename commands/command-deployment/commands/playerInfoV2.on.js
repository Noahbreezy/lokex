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
    const socialStats = await getSocialStats(sql, playerInfo.kingdomId, effectiveGuildId);
    const embed = buildPlayerEmbed(playerInfo, discordDetails, economyDetails, combatStats, socialStats);

        await interaction.editReply({ embeds: [embed], ...ephemeral });

        await savePlayerInfo(playerInfo, sql);
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

    const embeds = [];
    const verificationCache = new Map();
    const economyCache = new Map();
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
    const socialStats = await getSocialStats(sql, playerInfo.kingdomId, effectiveGuildId);

    embeds.push(buildPlayerEmbed(playerInfo, discordDetails, economyDetails, combatStats, socialStats));
    }

    if (embeds.length === 0) {
        await interaction.editReply({ content: "Unable to retrieve information for the linked kingdoms at this time.", ...ephemeral });
        return;
    }

    await interaction.editReply({ embeds, ...ephemeral });
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

function buildPlayerEmbed(playerInfo, discordDetails, economyDetails, combatStats, socialStats) {
    const safeName = playerInfo.name || "Unknown";

    const embed = new EmbedBuilder()
        .setTitle(`${safeName}'s information`)
        .setColor("#007ACC")
        .setTimestamp();

    const accountInfoValue = [
        `• Kingdom ID: ${playerInfo.kingdomId || 'Unknown'}`,
        `• Continent: ${playerInfo.continent ?? 'Unknown'}`,
        `• Level: ${playerInfo.level ?? 'Unknown'}`,
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

    const economyInfoValue = buildEconomyFieldValue(economyDetails);

    embed.addFields({
        name: '__Economy Info__',
        value: economyInfoValue,
        inline: true
    });

    const combatInfoValue = buildCombatFieldValue(combatStats, playerInfo);

    embed.addFields({
        name: '__Combat Stats__',
        value: combatInfoValue,
        inline: true
    });

    const socialInfoValue = buildSocialFieldValue(socialStats);

    embed.addFields({
        name: '__Social Stats__',
        value: socialInfoValue,
        inline: true
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

async function getEconomyDetails(sql, guildId, discordId) {
    try {
        const [pointsBalance, wallets] = await Promise.all([
            sql.getUserPointsBalance(discordId, guildId),
            sql.getVerifiedWallets(discordId, guildId)
        ]);

        const filteredWallets = (wallets || []).filter(wallet => wallet && wallet !== '0' && wallet !== 0);

        if (filteredWallets.length === 0) {
            return {
                pointsBalance,
                totalPledged: 0,
                wallets: []
            };
        }

        const pledgedResults = await Promise.all(
            filteredWallets
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
        `• Link: <@${discordDetails.discordId}>`,
        discordDetails.username ? `• Username: ${discordDetails.username}` : null,
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

    if (economyDetails.wallets && economyDetails.wallets.length > 0) {
        lines.push('• Wallets:');
        economyDetails.wallets.forEach(({ wallet, pledged }) => {
            if (pledged === null || pledged === 0) {
                lines.push(`-${wallet}`);
            } else {
                lines.push(`-${wallet} (${formatNumberWithSuffix2(pledged)})`);
            }
        });
    } else {
        lines.push('• Wallets: None');
    }

    return lines.join('\n');
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