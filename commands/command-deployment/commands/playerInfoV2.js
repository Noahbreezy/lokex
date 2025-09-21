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
        try {
            await interaction.deferUpdate();
            if (interaction.customId.startsWith("player-info_selectkingdom")) {
                const kingdomId = interaction.values[0];
                await handleKingdomInfo(interaction, kingdomId, module.exports.sql, module.exports.api, new (require("../../../encryption/encryption.js"))(), { flags: 64 }, interaction.guild.id);
            }
        } catch (error) {
            console.error('Error in stringselect handler:', error);
            await interaction.editReply({ content: "An error occurred while processing your selection." });
        }
    }
};

async function handleKingdomInfo(interaction, kingdomId, sql, api, encryption, ephemeral, guildId) {
    try {
        // Get basic player info
        const token = (await sql.getRandomManagerTokenFromGuild(interaction.guild.id))[0]?.token;
        if (!token) {
            return interaction.editReply({ content: "No valid manager token found", ...ephemeral });
        }

        const playerInfo = await getPlayerInfo(kingdomId, token, sql, api, encryption, interaction.guild.id);
        if (!playerInfo) {
            return interaction.editReply({ content: "Player not found or invalid kingdom ID.", ...ephemeral });
        }

        // Get additional data
        const additionalData = await getAdditionalKingdomData(kingdomId, interaction.guild.id, sql);

        // Build embed
        const embed = await buildKingdomEmbed(playerInfo, additionalData, sql, interaction.guild.id);

        // Handle image
        const tempDir = path.join(__dirname, '../../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const filePath = path.join(tempDir, `player_${playerInfo._id}.png`);
        const url = `https://play.leagueofkingdoms.com/images/face/${playerInfo._id}`;

        try {
            const response = await api.getStream(url, {});
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            const attachment = new AttachmentBuilder(filePath);
            embed.setImage('attachment://' + path.basename(filePath));
            await interaction.editReply({ embeds: [embed], files: [attachment], ...ephemeral });
        } catch (error) {
            console.error('Error downloading player image:', error);
            await interaction.editReply({ embeds: [embed], ...ephemeral });
        } finally {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Save to database
        await savePlayerInfo(playerInfo, sql);
    } catch (error) {
        console.error('Error in handleKingdomInfo:', error);
        await interaction.editReply({ content: "An error occurred while fetching player information.", ...ephemeral });
    }
}

async function handleDiscordUserInfo(interaction, discordUser, sql, api, encryption, ephemeral, guildId) {
    try {
        // Get user's verified kingdoms
        const kingdoms = await sql.checkVerifiedKingdoms(discordUser.id, interaction.guild.id);
        if (!kingdoms || kingdoms.length === 0) {
            return interaction.editReply({ content: `${discordUser.username} has no verified kingdoms in this guild.`, ...ephemeral });
        }

        const embeds = [];
        for (const kingdom of kingdoms.slice(0, 5)) { // Limit to 5 kingdoms
            const token = (await sql.getRandomManagerTokenFromGuild(interaction.guild.id))[0]?.token;
            if (!token) continue;

            const playerInfo = await getPlayerInfo(kingdom.kingdomId, token, sql, api, encryption, interaction.guild.id);
            if (!playerInfo) continue;

            const additionalData = await getAdditionalKingdomData(kingdom.kingdomId, interaction.guild.id, sql);
            const embed = await buildKingdomEmbed(playerInfo, additionalData, sql, interaction.guild.id);
            embeds.push(embed);
        }

        if (embeds.length === 0) {
            return interaction.editReply({ content: "Could not fetch information for any kingdoms.", ...ephemeral });
        }

        await interaction.editReply({ embeds, ...ephemeral });
    } catch (error) {
        console.error('Error in handleDiscordUserInfo:', error);
        await interaction.editReply({ content: "An error occurred while fetching user information.", ...ephemeral });
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

    try {
        // Stats changes (compare latest_info with older info)
        const latestInfo = await sql.query('SELECT * FROM latest_info WHERE kingdomId = ?', [kingdomId]);
        const olderInfo = await sql.query('SELECT * FROM info WHERE kingdomId = ? ORDER BY date DESC LIMIT 2', [kingdomId]);
        data.statsChange = calculateStatsChange(latestInfo[0][0], olderInfo[0][1]);
    } catch (error) {
        console.error('Error getting stats changes:', error);
        data.statsChange = null;
    }

    try {
        // Licenses (whitelist)
        const licenses = await sql.query('SELECT * FROM whitelist WHERE kingdomId = ? AND expiry > NOW()', [kingdomId]);
        data.licenses = licenses[0];
    } catch (error) {
        console.error('Error getting licenses:', error);
        data.licenses = [];
    }

    try {
        // Points balance
        const points = await sql.query('SELECT SUM(amount) as balance FROM points_transactions WHERE discord_id = (SELECT discordId FROM verified WHERE kingdomId = ? AND guild = ? AND status = 1)', [kingdomId, guildId]);
        data.pointsBalance = points[0][0]?.balance || 0;
    } catch (error) {
        console.error('Error getting points balance:', error);
        data.pointsBalance = 0;
    }

    try {
        // Rally participation
        const ralliesStarted = await sql.query('SELECT COUNT(*) as count FROM rallies WHERE by_kingdom_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)', [kingdomId]);
        const ralliesJoined = await sql.query('SELECT COUNT(*) as count FROM rally_joiners WHERE joiner_kingdom_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)', [kingdomId]);
        data.ralliesStarted = ralliesStarted[0][0]?.count || 0;
        data.ralliesJoined = ralliesJoined[0][0]?.count || 0;
    } catch (error) {
        console.error('Error getting rally participation:', error);
        data.ralliesStarted = 0;
        data.ralliesJoined = 0;
    }

    try {
        // Staking
        const staking = await sql.query('SELECT SUM(amount) as total FROM staking_transactions WHERE from_address = (SELECT wallet FROM verified WHERE kingdomId = ? AND guild = ? AND status = 1) AND is_staking = 1', [kingdomId, guildId]);
        data.stakingAmount = staking[0][0]?.total || 0;
    } catch (error) {
        console.error('Error getting staking amount:', error);
        data.stakingAmount = 0;
    }

    try {
        // Linked accounts
        const linkedKingdoms = await sql.query('SELECT kingdomId, name FROM verified WHERE discordId = (SELECT discordId FROM verified WHERE kingdomId = ? AND guild = ?) AND guild = ?', [kingdomId, guildId, guildId]);
        data.linkedKingdoms = linkedKingdoms[0];
    } catch (error) {
        console.error('Error getting linked accounts:', error);
        data.linkedKingdoms = [];
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

async function buildKingdomEmbed(playerInfo, additionalData, sql, guildId) {
    const embed = new EmbedBuilder()
        .setTitle(playerInfo.name || "Unknown Player")
        .setColor(additionalData.blacklist ? "#ff0000" : "#00b0f4")
        .setFooter({ text: playerInfo._id || "Unknown ID" })
        .setTimestamp();

    let description = "";

    // Blacklist status
    if (additionalData.blacklist) {
        const ex = additionalData.blacklist[0].expiration;
        const blmsg = new Date(ex) > new Date("2035-01-01")
            ? "**PERMANENT BLACKLIST**"
            : `**BLACKLISTED UNTIL ${formatDateTime(ex)}**`;
        description += `${blmsg}\n${additionalData.blacklist[0].description}\n\n`;
    }

    // Discord verification
    try {
        const discordResult = await sql.isKingdomVerifiedAnyGuild(playerInfo._id);
        description += `Discord: ${discordResult ? `<@${discordResult.discordId}>` : "Not Linked"}\n\n`;
    } catch (error) {
        console.error('Error getting Discord verification:', error);
        description += `Discord: Not Linked\n\n`;
    }

    embed.setDescription(description);

    // Basic info fields
    embed.addFields([
        { name: 'Alliance Tag', value: playerInfo.allianceTag || "N/A", inline: true },
        { name: 'Alliance Rank', value: `R${playerInfo.allianceRank === "99" ? "5" : playerInfo.allianceRank || "N/A"}`, inline: true },
        { name: 'Player Level', value: String(playerInfo.level || 0), inline: true },
        { name: 'Power', value: formatNumberWithSuffix2(playerInfo.power || 0), inline: true },
        { name: 'Kills', value: formatNumberWithSuffix2(playerInfo.kills || 0), inline: true },
        { name: 'Deaths', value: formatNumberWithSuffix2(playerInfo.death || 0), inline: true },
        { name: 'Victories', value: formatNumberWithSuffix2(playerInfo.victory || 0), inline: true },
        { name: 'Defeats', value: formatNumberWithSuffix2(playerInfo.defeat || 0), inline: true },
        { name: 'Lord Level', value: String(playerInfo.lord || 0), inline: true },
        { name: 'Gathering', value: formatNumberWithSuffix2(playerInfo.gathering || 0), inline: true },
        { name: 'Continent', value: String(playerInfo.continent || 0), inline: true },
        { name: 'Coordinates', value: playerInfo.x > 0 ? `X: ${playerInfo.x}, Y: ${playerInfo.y}` : 'Unknown', inline: true },
        { name: 'Points Balance', value: formatNumberWithSuffix2(additionalData.pointsBalance), inline: true }
    ]);

    // Stats changes
    if (additionalData.statsChange) {
        const change = additionalData.statsChange;
        embed.addFields({
            name: 'Stats Changes (Last Update)',
            value: `Power: ${change.powerChange >= 0 ? '+' : ''}${formatNumberWithSuffix2(change.powerChange)}\nKills: ${change.killsChange >= 0 ? '+' : ''}${formatNumberWithSuffix2(change.killsChange)}\nGathering: ${change.gatheringChange >= 0 ? '+' : ''}${formatNumberWithSuffix2(change.gatheringChange)}`,
            inline: true
        });
    }

    // Licenses
    if (additionalData.licenses && additionalData.licenses.length > 0) {
        let licenseText = "";
        additionalData.licenses.forEach(license => {
            if (license.dsa > 0) licenseText += `DSA Lv.${license.dsa} `;
            if (license.cmine > 0) licenseText += `CMine Lv.${license.cmine} `;
            licenseText += `Expires: ${formatDateTime(license.expiry)}\n`;
        });
        embed.addFields({ name: 'Active Licenses', value: licenseText || "None", inline: false });
    }

    // Rally activity
    embed.addFields({
        name: 'Rally Activity (30 days)',
        value: `Started: ${additionalData.ralliesStarted}\nJoined: ${additionalData.ralliesJoined}`,
        inline: true
    });

    // Staking
    if (additionalData.stakingAmount > 0) {
        embed.addFields({
            name: 'Staking Amount',
            value: formatNumberWithSuffix2(additionalData.stakingAmount),
            inline: true
        });
    }

    // Past names
    if (additionalData.pastNames && additionalData.pastNames.length > 0) {
        const pastNamesText = additionalData.pastNames
            .filter(obj => !!obj.name && !!obj.date)
            .slice(0, 5)
            .map(obj => `${obj.name} - ${new Date(obj.date).toLocaleDateString()}`)
            .join("\n") || "None";
        embed.addFields({ name: 'Past Kingdom Names', value: pastNamesText, inline: false });
    }

    // Linked accounts
    if (additionalData.linkedKingdoms && additionalData.linkedKingdoms.length > 1) {
        const linkedText = additionalData.linkedKingdoms
            .filter(k => k.kingdomId !== playerInfo._id)
            .slice(0, 5)
            .map(k => `${k.name} (${k.kingdomId})`)
            .join("\n") || "None other";
        embed.addFields({ name: 'Linked Accounts', value: linkedText, inline: false });
    }

    return embed;
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
        playerInfo.defeat,
        playerInfo.victory,
        playerInfo.death,
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