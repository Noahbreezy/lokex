const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const Encryption = require("../../../encryption/encryption.js");

async function handleNameAutocomplete(interaction, sql) {
    const focusedValue = interaction.options.getFocused();
    const names = await sql.searchKingdomName(focusedValue);
    const choices = names.slice(0, 25).map(nameObj => ({
        name: nameObj.name || 'Unknown',
        value: nameObj.kingdomId || 'Unknown'
    }));
    await interaction.respond(choices);
}

const ranks = [
    { name: "R1", value: 1 },
    { name: "R2", value: 2 },
    { name: "R3", value: 3 },
    { name: "R4", value: 4 },
    { name: "R5", value: 99 }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Manage player ranks")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("change")
                .setDescription("Change a player's rank")
                .addStringOption((option) =>
                    option
                        .setName("player")
                        .setDescription("The player to change the rank of")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("rank")
                        .setDescription("The new rank to assign to the player")
                        .setRequired(true)
                        .addChoices(...ranks.map(rank => ({ name: rank.name, value: rank.name })))
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("view")
                .setDescription("View a player's current rank")
                .addStringOption((option) =>
                    option
                        .setName("player")
                        .setDescription("The player to view the rank of")
                        .setRequired(true)
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

        const subcommand = options.getSubcommand();

        switch (subcommand) {
            case 'change':
                await handleChangeRank(interaction, sql, ephemeral);
                break;
            case 'view':
                await handleViewRank(interaction, sql, ephemeral);
                break;
            default:
                await interaction.reply({
                    content: 'Unknown subcommand.',
                    ...ephemeral
                });
                break;
        }
    },
    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === 'player') {
            await handleNameAutocomplete(interaction, module.exports.sql);
        } else {
            await interaction.respond([]);
        }
    }
};

async function handleChangeRank(interaction, sql, ephemeral) {
    const api = module.exports.api;
    const encryption = new Encryption();
    const guildId = interaction.guild.id;
    const kingdomId = interaction.options.getString('player'); // This comes from autocomplete as kingdomId
    const newRankInput = interaction.options.getString('rank');

    const deferOptions = ephemeral.flags === 64 ? { ephemeral: true } : {};
    await interaction.deferReply(deferOptions);

    try {
        // Parse the new rank - convert rank name to number using the ranks array
        const rankObj = ranks.find(r => r.name === newRankInput);
        const newRank = rankObj ? rankObj.value : parseInt(newRankInput);
        
        if (!newRank || ![1, 2, 3, 4, 99].includes(newRank)) {
            return await interaction.editReply({
                content: 'Invalid rank. Please use R1, R2, R3, R4, or R5.',
                ...ephemeral
            });
        }

        // Step 1: Get a random non-idle token from the guild
        const tokenResult = await sql.getRandomNonIdleTokenFromGuild(guildId);
        if (!tokenResult || tokenResult.length === 0) {
            return await interaction.editReply({
                content: 'No valid bot token found for this guild.',
                ...ephemeral
            });
        }
        const token = tokenResult[0].token;

        // Step 2: Get XOR password for encryption
        const xorPass = (await sql.getXORPass())?.[0]?.value || null;
        const body = await encryption.buildRequestBody({ kingdomId: String(kingdomId) }, xorPass);

        // Step 3: Get basic player info
        const basicPlayerInfoResponse = await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
            body,
            { 'x-access-token': token, 'Content-Type': 'application/json' }
        );

        if (!basicPlayerInfoResponse || !basicPlayerInfoResponse.data) {
            return await interaction.editReply({
                content: 'Player not found or invalid kingdom ID.',
                ...ephemeral
            });
        }

        const basicPlayerInfo = JSON.parse(await encryption.decryptXorMessage(basicPlayerInfoResponse.data, xorPass)).profile;
        console.log('Basic Player Info:', basicPlayerInfo);

        // Step 4: Ensure the player belongs to one of this guild's linked continents
        const playerContinentRaw = basicPlayerInfo.worldId ?? basicPlayerInfo.continent ?? basicPlayerInfo.world ?? basicPlayerInfo.location?.continent ?? null;
        const playerContinent = playerContinentRaw !== null && playerContinentRaw !== undefined ? Number(playerContinentRaw) : null;
        const allowedWorldIds = await sql.getGuildWorldIds(guildId);

        if (!allowedWorldIds.length) {
            return await interaction.editReply({
                content: 'No continents are linked to this guild. Please configure a continent before changing ranks.',
                ...ephemeral
            });
        }

        if (playerContinent === null || Number.isNaN(playerContinent) || !allowedWorldIds.includes(playerContinent)) {
            return await interaction.editReply({
                content: 'This player is not on a continent linked to this guild.',
                ...ephemeral
            });
        }
        
        // Step 5: Check if player is in an alliance
        if (!basicPlayerInfo.alliance || !basicPlayerInfo.alliance._id) {
            return await interaction.editReply({
                content: 'This player is not currently in an alliance.',
                ...ephemeral
            });
        }

        const playerAllianceId = basicPlayerInfo.alliance._id;
        const guildAllianceRows = await sql.getAllGuildAlliances(guildId);
        const guildAllianceIds = new Set(guildAllianceRows.map(row => String(row.allianceId)));

        if (!guildAllianceIds.has(String(playerAllianceId))) {
            return await interaction.editReply({
                content: 'This player is not part of an alliance linked to this guild.',
                ...ephemeral
            });
        }
        const playerName = basicPlayerInfo.name;
        const currentRank = basicPlayerInfo.alliance.rank || 0;

        // Step 6: Get manager info for the player's alliance
        const managerInfoResult = await sql.getManagerInfoByAllianceId(playerAllianceId);
        if (!managerInfoResult || managerInfoResult.length === 0) {
            return await interaction.editReply({
                content: 'No manager bot found for this player\'s alliance.',
                ...ephemeral
            });
        }

        const managerInfo = managerInfoResult[0];
        const managerToken = managerInfo.token;
        const managerKingdomId = managerInfo.kingdomId;

        // Step 7: Get manager's basic player info to check their rank
        const managerBody = await encryption.buildRequestBody({ kingdomId: String(managerKingdomId) }, xorPass);
        const managerPlayerInfoResponse = await api.request(
            'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
            managerBody,
            { 'x-access-token': token, 'Content-Type': 'application/json' }
        );

        const managerPlayerInfo = JSON.parse(await encryption.decryptXorMessage(managerPlayerInfoResponse.data, xorPass)).profile;
        const managerRank = managerPlayerInfo.alliance?.rank || 99;
        console.log(`Manager Rank: ${managerRank}, Player Rank: ${currentRank}, New Rank: ${newRank}`);

        // Step 8: Check if manager can assign the requested rank 
        // In this system: R1 (value 1) is highest, R5 (value 99) is lowest
        // Only R4 and R5 managers can assign ranks
        // R5 managers can assign all ranks
        // R4 managers can only assign ranks R1, R2, R3
        // R1, R2, R3 managers cannot assign any ranks
        if (managerRank < 4) {
            // R1, R2, R3 managers cannot assign any ranks
            return await interaction.editReply({
                content: `Manager (rank R${managerRank}) cannot assign ranks. Only R4 and R5 managers can change player ranks.`,
                ...ephemeral
            });
        } else if (managerRank === 99) {
            // R5 manager can assign all ranks (no restrictions)
        } else if (managerRank === 4) {
            // R4 manager can only assign ranks R1, R2, R3 (values 1, 2, 3)
            if (newRank >= 4) {
                return await interaction.editReply({
                    content: `Manager (rank R4) cannot assign rank ${newRank === 99 ? 'R5' : 'R' + newRank}. R4 managers can only assign ranks R1, R2, or R3.`,
                    ...ephemeral
                });
            }
        }

        // Step 9: Change the player's rank
        const rankBody = await encryption.buildRequestBody(
            { memberKingdomId: String(kingdomId), rank: Number(newRank), title: 0 },
            xorPass
        );
        await api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/rank",
            rankBody,
            { "x-access-token": managerToken }
        );

        // Step 10: Success response
        const rankDisplayName = newRank === 99 ? 'R5' : `R${newRank}`;
        const previousRankDisplayName = currentRank === 99 ? 'R5' : `R${currentRank}`;
        
        const embed = new EmbedBuilder()
            .setTitle('Rank Changed Successfully')
            .setDescription(`**${playerName}**'s rank has been changed to **${rankDisplayName}**`)
            .setColor(0x00AE86)
            .addFields([
                { name: 'Player', value: playerName, inline: true },
                { name: 'Alliance', value: basicPlayerInfo.alliance.tag || 'Unknown', inline: true },
                { name: 'New Rank', value: rankDisplayName, inline: true }
            ])
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            ...ephemeral
        });

    } catch (error) {
        console.error('Error changing rank:', error);
        await interaction.editReply({
            content: 'An error occurred while changing the rank. Please try again later.',
            ...ephemeral
        });
    }
}

async function handleViewRank(interaction, sql, ephemeral) {
    const player = interaction.options.getString('player');

    try {
        // TODO: Implement rank view logic
        // This would typically involve:
        // 1. Validating the user exists
        // 2. Querying the database for user's current rank
        // 3. Displaying the rank information

        const embed = new EmbedBuilder()
            .setTitle('Player Rank')
            .setDescription(`${player}'s current rank: **[Rank Name]** command under construction.`)
            .setColor(0x0099FF)
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ...ephemeral
        });
    } catch (error) {
        console.error('Error viewing rank:', error);
        await interaction.reply({
            content: 'An error occurred while viewing the rank.',
            ...ephemeral
        });
    }
};