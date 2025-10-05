const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder } = require("discord.js");
const path = require('path');
const fs = require('fs');
const Encryption = require("../../../encryption/encryption.js");
const { log } = require("console");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("playerinfo")
        .setDescription("Get information about a single kingdom or player")
        .addStringOption(option =>
            option.setName("player")
                .setDescription("Search the name of the player or paste their kingdom ID")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async execute(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const encryption = new Encryption();
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

        await interaction.deferReply();
        const kingdomId = interaction.options.getString("player");

        // Get player information
        const token = (await sql.getRandomManagerTokenFromGuild(guildId))[0]?.token;
        if (!token) {
            return interaction.editReply({ content: "No valid manager token found", flags: 64 });
        }

        const playerInfo = await getPlayerInfo(kingdomId, token, sql, api, encryption, guildId);
        if (!playerInfo) {
            return interaction.editReply({ content: "Player not found or invalid kingdom ID.", flags: 64 });
        }

        // Check blacklist status
        let blacklisted = false;
        let blmess = "";
        const blist = await sql.isKingdomBlacklisted(kingdomId, guildId);
        if (blist) {
            blacklisted = true;
            const ex = blist[0].expiration;
            blmess = new Date(ex) > new Date("01-01-2030")
                ? "**PERMANENT BLACKLISTED**"
                : `**BLACKLISTED UNTIL ${formatDateTime(ex)}**`;
            blmess += `\n${blist[0].description}\n\nBlacklisted by <@${blist[0].discordId}> on ${formatDateTime(blist[0].date)}\n\n\n\n`;
        }

        // Get admin note
        // let adminnote = "";
        // const adminNoteResult = await sql.query('SELECT note FROM adminnote WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
        // if (adminNoteResult[0].length > 0) {
        //     adminnote = `\n\n**Admin Note**\n${adminNoteResult[0][0].note}`;
        // }

        // Get warning counter
        // let adminnotew = "";
        // const warningResult = await sql.query('SELECT num FROM warnings WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
        // if (warningResult[0].length > 0 && warningResult[0][0].num > 0) {
        //     adminnotew = `\n\n**__Warning counter: ${warningResult[0][0].num}__**`;
        // }

        // Get Discord verification
        // let discordid = "Not Verified";
        // let shoplist = "\n\n**No Shop Access**";
        // const discordResult = await sql.query('SELECT discordId FROM verified WHERE kingdomid = ?', [kingdomId]);
        // if (discordResult[0].length > 0) {
        //     discordid = `<@${discordResult[0][0].discordId}>`;
        //     const shopAccessResult = await sql.query(
        //         'SELECT v.kingdomid, v.type, v.expiration, i.name FROM whitelist v, info i WHERE v.kingdomid = ? AND i.id = (SELECT i1.id FROM info i1 WHERE i1.kingdomid = v.kingdomid ORDER BY i1.date DESC LIMIT 1) AND expiration > NOW()',
        //         [kingdomId]
        //     );
        //     if (shopAccessResult[0].length > 0) {
        //         shoplist = "\n\n**Shop Access:**\n";
        //         shopAccessResult[0].forEach((row, i) => {
        //             const type = row.type;
        //             const name = row.name;
        //             const expiration = row.expiration;
        //             shoplist += `${i + 1}) ${name}`;
        //             if ([1, 2, 3, 4, 5].includes(type)) {
        //                 shoplist += ` DSA lv. ${type}`;
        //             } else if ([11, 12, 13, 14, 15].includes(type)) {
        //                 shoplist += ` Cmine lv. ${type - 10}`;
        //             }
        //             shoplist += ` Expire: ${formatDateTime(expiration)}\n`;
        //         });
        //     }
        // }

        // Get discord verification
        let discordid = "Not Linked";
        const discordResult = await sql.isKingdomVerifiedAnyGuild(kingdomId);
        // Build action rows
        const components = [];
        if (discordResult) {
            discordid = `<@${discordResult.discordId}>`;

            const mail = new ButtonBuilder()
                .setCustomId(`playerinfo_mail_${kingdomId}`)
                .setLabel('Mail')
                .setStyle(ButtonStyle.Primary);
            // const warning = new ButtonBuilder()
            //     .setCustomId(`playerinfo_warnp_${kingdomId}`)
            //     .setLabel('Warn +1')
            //     .setStyle(ButtonStyle.Primary);
            // const warning2 = new ButtonBuilder()
            //     .setCustomId(`playerinfo_warnn_${kingdomId}`)
            //     .setLabel('Warn -1')
            //     .setStyle(ButtonStyle.Primary);
            // const note = new ButtonBuilder()
            //     .setCustomId(`playerinfo_note_${kingdomId}`)
            //     .setLabel('Note')
            //     .setStyle(ButtonStyle.Primary);
            const invite = new ButtonBuilder()
                .setCustomId(`playerinfo_invite_${kingdomId}`)
                .setLabel('Invite')
                .setStyle(ButtonStyle.Primary);
            const kick = new ButtonBuilder()
                .setCustomId(`playerinfo_kick_${kingdomId}`)
                .setLabel('Kick')
                .setStyle(ButtonStyle.Primary);
            const rank = new ButtonBuilder()
                .setCustomId(`playerinfo_rank_${kingdomId}`)
                .setLabel('Rank')
                .setStyle(ButtonStyle.Primary);


            if (playerInfo.allianceRank !== "4" && playerInfo.allianceRank !== "5" && playerInfo.allianceTag) {
                components.push(new ActionRowBuilder().addComponents(kick, rank));
            }
            if (!playerInfo.allianceTag && Number(playerInfo.continent) > 0) {
                components.push(new ActionRowBuilder().addComponents(invite));
            }

            components.push(new ActionRowBuilder().addComponents(mail));
        }

        // Check if the continent linked to the guild is equal to the guild of the player
        const continents = await sql.getGuildContinent(guildId);
        console.log(Number(playerInfo.continent), Number(continents[0].continent));
        if (Number(playerInfo.continent) === Number(continents[0].continent)) {

            const blacklist = new ButtonBuilder()
                .setCustomId(blacklisted ? `playerinfo_ubl_${kingdomId}` : `playerinfo_bl_${kingdomId}`)
                .setLabel(blacklisted ? 'UBL' : 'BL')
                .setStyle(ButtonStyle.Primary);

            components.push(new ActionRowBuilder().addComponents(blacklist));
        }

        console.log("Player Info:", playerInfo);

        // Build embed with all fields
        const embed = new EmbedBuilder()
            .setTitle(playerInfo.name || "Unknown Player")
            .setColor(blacklisted ? "#ff0000" : "#00b0f4")
            .setFooter({ text: playerInfo._id || "Unknown ID" })
            .setTimestamp()
            .addFields([
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
                { name: 'Rallies Started (Last 30 days)', value: String(playerInfo.ralliesDone || 0), inline: true },
                { name: 'Past Kingdom Names', value: playerInfo.pastKingdomNames || "None", inline: false }
            ] // Flatten to ensure proper field addition
            )
            .setDescription(`${blmess}Discord: ${discordid}`);

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
            await interaction.editReply({ embeds: [embed], files: [attachment], components });
        } catch (error) {
            if (error.response) {
                console.error(`Failed to download player image: ${error.response.status} ${error.response.statusText}`);
            } else {
                console.error('Failed to download player image: Network error');
            }
            await interaction.editReply({ embeds: [embed], components });
        } finally {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Save to database
        await savePlayerInfo(playerInfo, sql);
    },

    async autocomplete(interaction) {
        await handleNameAutocomplete(interaction, module.exports.sql);
    },

    async buttons(interaction) {
        const guildMember = interaction.guild.members.cache.get(interaction.user.id);
        if (!guildMember.permissions.has("Administrator")) {
            return interaction.reply({
                content: `You don't have the permission to use this command`,
                flags: 64,
            });
        }
        await commands(interaction, module.exports.sql, module.exports.api);
    },

    async modals(interaction) {
        const guildMember = interaction.guild.members.cache.get(interaction.user.id);
        if (!guildMember.permissions.has("Administrator")) {
            return interaction.reply({
                content: `You don't have the permission to use this command`,
                flags: 64,
            });
        }
        await modals(interaction, module.exports.sql, module.exports.api);
    },

    async stringselect(interaction) {
        const guildMember = interaction.guild.members.cache.get(interaction.user.id);
        if (!guildMember.permissions.has("Administrator")) {
            return interaction.reply({
                content: `You don't have the permission to use this command`,
                flags: 64,
            });
        }
        await sselect(interaction, module.exports.sql, module.exports.api);
    }
};

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
    // console.log('Basic Player Info:', basicPlayerInfo);
    // console.log('History Player Info:', historyPlayerInfo);

    let location = await getMemberLocation(kingdomId, basicPlayerInfo.alliance?._id, token, api, sql);
    const ralliesDone = await sql.getRalliesCount(kingdomId, guildId);
    const pastKingdomNames = await sql.getPastKingdomNames(kingdomId);

    console.log(ralliesDone);

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
        console.log("Member location response:", response.data);
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
        playerInfo.allianceId,      // allianceId
        playerInfo.allianceTag,     // allianceTag
        playerInfo.kingdomId,       // kingdomid
        playerInfo.name,            // name
        playerInfo.level,           // level
        playerInfo.lord,            // lord
        playerInfo.power,           // power
        playerInfo.kills,           // kills
        playerInfo.defeat,          // defeat
        playerInfo.victory,         // victory
        playerInfo.death,           // death
        playerInfo.gathering,       // gathering
        playerInfo.continent,       // continent
        playerInfo.x,               // x
        playerInfo.y                // y
    ];

    await sql.updateFullKingdomInfo(values);
}

async function commands(interaction, sql, api) {
    const kingdomId = interaction.customId.split("_")[2];

    switch (interaction.customId.split("_")[1]) {
        case "mail":
            const mailModal = new ModalBuilder()
                .setCustomId(`playerinfo_mailm_${kingdomId}`)
                .setTitle('Mail')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('title')
                            .setLabel("Title")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('desc')
                            .setLabel("Description")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
                );
            await interaction.showModal(mailModal);
            break;

        case "bl":
            const modal = new ModalBuilder()
                .setCustomId("blacklist_blm_" + kingdomId)
                .setTitle("Blacklist");

            // Create the text input components

            const desc = new TextInputBuilder()
                .setCustomId("desc")
                // The label is the prompt the user sees for this input
                .setLabel("Reason to blacklist")
                .setRequired(true)
                // Short means only a single line of text
                .setStyle(TextInputStyle.Paragraph);
            const expir = new TextInputBuilder()
                .setCustomId("expir")
                .setRequired(false)
                // The label is the prompt the user sees for this input
                .setLabel("Expiration of blacklist (in hours)")
                // Short means only a single line of text
                .setStyle(TextInputStyle.Short);

            // An action row only holds one text input,
            // so you need one action row per text input.

            const firstActionRow1 = new ActionRowBuilder().addComponents(desc);
            const firstActionRow2 = new ActionRowBuilder().addComponents(expir);

            // Add inputs to the modal
            modal.addComponents(firstActionRow1, firstActionRow2);

            // Show the modal to the user
            return await interaction.showModal(modal);
            break;

        case "ubl":
            const alreadybl = await sql.isKingdomBlacklisted(kingdomId, interaction.guild.id);
            if (!alreadybl) {
                return await interaction.reply({ content: "This kingdom is not blacklisted", flags: 64 });
            }
            const logChannel = (await sql.getGuildLogChannels(interaction.guild.id))[0].accept_log_channel;
            const name = (await sql.getKingdomName(kingdomId))[0].name;
            await sql.removeFromBlacklist(kingdomId, interaction.guild.id);

            await interaction.client.channels.cache.get(logChannel)
                .send(`${name} (${kingdomId}) has been unblacklisted by <@${interaction.user.id}>`);
            break;

        case "note":
            const noteResult = await sql.query('SELECT note FROM adminnote WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
            const noteModal = new ModalBuilder()
                .setCustomId(`playerinfo_notem_${kingdomId}`)
                .setTitle('Admin Note')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('desc')
                            .setLabel("Note")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                            .setValue(noteResult[0].length ? noteResult[0][0].note : "")
                    )
                );
            await interaction.showModal(noteModal);
            break;

        case "warnp":
            const warnPModal = new ModalBuilder()
                .setCustomId(`playerinfo_warnm_p_${kingdomId}`)
                .setTitle('Warn')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('desc')
                            .setLabel("Reason to warn")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
                );
            await interaction.showModal(warnPModal);
            break;

        case "warnn":
            const warnResult = await sql.query('SELECT num FROM warnings WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
            const precnum = warnResult[0].length ? warnResult[0][0].num : 0;
            if (precnum <= 0) {
                return await interaction.reply({ content: "Warning counter already at 0", flags: 64 });
            }
            const warnNModal = new ModalBuilder()
                .setCustomId(`playerinfo_warnm_n_${kingdomId}`)
                .setTitle('Warn')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('desc')
                            .setLabel("Reason to remove the warn")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
                );
            await interaction.showModal(warnNModal);
            break;

        case "rank":
            const rankSelect = new StringSelectMenuBuilder()
                .setCustomId('playerinfo_chgrank')
                .setPlaceholder('Rank')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel("R1").setDescription("Rank 1").setValue(`${kingdomId},1`),
                    new StringSelectMenuOptionBuilder().setLabel("R2").setDescription("Rank 2").setValue(`${kingdomId},2`),
                    new StringSelectMenuOptionBuilder().setLabel("R3").setDescription("Rank 3").setValue(`${kingdomId},3`)
                );
            await interaction.reply({
                content: 'Choose the rank',
                components: [new ActionRowBuilder().addComponents(rankSelect)],
                flags: 64
            });
            break;

        case "kick":
            const kickInfo = await sql.query('SELECT name, allianceTag FROM info WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
            if (!kickInfo[0].length) {
                return await interaction.reply({ content: "Can't find this kingdom", flags: 64 });
            }
            const { name: kickName, allianceTag } = kickInfo[0][0];
            const kickToken = (await sql.query('SELECT token FROM botAccounts WHERE alliancetag = ?', [allianceTag]))[0][0]?.token;
            if (!kickToken) {
                return await interaction.reply({ content: `Can't kick in this alliance (${allianceTag})`, flags: 64 });
            }
            try {
                await api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/disband",
                    { memberKingdomId: kingdomId },
                    { "x-access-token": kickToken, "Content-Type": "application/json" }
                );
                await interaction.reply({ content: "Kicked successfully", flags: 64 });
                await interaction.client.channels.cache.get("1248750084376760451")
                    .send(`**${allianceTag}**\n${kickName} has been kicked by <@${interaction.user.id}>`);
            } catch (error) {
                console.error('Error kicking member:', error);
                return await interaction.reply({ content: "There has been an error", flags: 64 });
            }
            break;

        case "invite":
            const inviteSelect = new StringSelectMenuBuilder()
                .setCustomId('playerinfo_chinvite')
                .setPlaceholder('Alliance')
                .addOptions([
                    { label: "LGN0", description: "LGN0", value: `${kingdomId},61dd869a1192ef591323694a` },
                    { label: "LGN3", description: "LGN3", value: `${kingdomId},61e0854ec2da8511aa78fcff` },
                    { label: "LGN1", description: "LGN1", value: `${kingdomId},61d288f2f8777c3f5d77a5d4` },
                    { label: "C24L", description: "C24L", value: `${kingdomId},61dd7fe74be1d946995d7f94` },
                    { label: "LGN6", description: "LGN6", value: `${kingdomId},63bc352b847b4249dc1418eb` },
                    { label: "LGN2", description: "LGN2", value: `${kingdomId},61d241f12d8f553d30f70c53` },
                    { label: "LGN4", description: "LGN4", value: `${kingdomId},61d5b9455f787410603e9736` },
                    { label: "LGN7", description: "LGN7", value: `${kingdomId},61d44cddfa662a328c3ac9bd` },
                    { label: "LGN8", description: "LGN8", value: `${kingdomId},61e05fcd832622210be15c7d` },
                    { label: "LGNc", description: "LGNc", value: `${kingdomId},62d0682da127296cf065c039` },
                    { label: "LG10", description: "LG10", value: `${kingdomId},61e13e74495c9f11703bffd4` },
                    { label: "LG11", description: "LG11", value: `${kingdomId},61dd3f52cf78261127a3de1f` },
                    { label: "LGN9", description: "LGN9", value: `${kingdomId},656e422cab3370670050b96a` }
                ].map(opt => new StringSelectMenuOptionBuilder().setLabel(opt.label).setDescription(opt.description).setValue(opt.value)));
            await interaction.reply({
                content: 'Choose the alliance',
                components: [new ActionRowBuilder().addComponents(inviteSelect)],
                flags: 64
            });
            break;
    }
}

async function modals(interaction, sql, api) {
    const kingdomId = interaction.customId.split("_")[2] || interaction.customId.split("_")[3];
    const nameResult = await sql.query('SELECT name, allianceTag FROM info WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
    if (!nameResult[0].length) {
        return await interaction.reply({ content: "Can't find this kingdom", flags: 64 });
    }
    const name = nameResult[0][0].name;
    const allianceTag = nameResult[0][0].allianceTag;

    if (interaction.customId.startsWith("playerinfo_mailm_")) {
        const desc = interaction.fields.getTextInputValue('desc');
        const title = interaction.fields.getTextInputValue('title');
        const token = (await sql.query('SELECT token FROM botAccounts WHERE alliancetag = "LGN1"'))[0][0]?.token;
        try {
            await api.request(
                "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                { json: JSON.stringify({ toName: name, subject: title, content: desc }) },
                { "x-access-token": token }
            );
            await interaction.reply({ content: "Mail sent successfully", flags: 64 });
        } catch (error) {
            console.error('Error sending mail:', error);
            await interaction.reply({ content: "There was a problem with the email", flags: 64 });
        }
    } else if (interaction.customId.startsWith("playerinfo_blm_")) {
        const desc = interaction.fields.getTextInputValue('desc');
        const exp = interaction.fields.getTextInputValue('expir');
        const alreadybl = await sql.query('SELECT kingdomid, expiration, description FROM blacklist WHERE kingdomid = ? AND valid = 1 AND expiration > NOW()', [kingdomId]);
        if (alreadybl[0].length) {
            const dd = new Date(alreadybl[0][0].expiration);
            return await interaction.reply({ content: `This kingdom is already blacklisted until <t:${Math.floor(dd.getTime() / 1000)}:f> for the reason: ${alreadybl[0][0].description}`, flags: 64 });
        }
        const dateexp = exp.trim() && parseString(exp) ? parseString(exp) : new Date("2030-12-12");
        const permanent = !exp.trim() || !parseString(exp);
        const ditim = permanent ? "" : `<t:${Math.floor(dateexp.getTime() / 1000)}:f>`;
        await sql.query('INSERT INTO blacklist (discordid, kingdomid, expiration, valid, description) VALUES (?, ?, ?, 1, ?)',
            [interaction.user.id, kingdomId, dateexp, desc]);
        await interaction.reply({
            content: `${name} (${kingdomId}) has been ${permanent ? "permanently " : ""}blacklisted${!permanent ? ` until ${ditim}` : ""} for the reason: ${desc}`,
            flags: 64
        });

        const discordResult = await sql.query('SELECT discordId FROM verified WHERE kingdomid = ?', [kingdomId]);
        const token = (await sql.query('SELECT token FROM botAccounts WHERE alliancetag = "LGN1"'))[0][0]?.token;
        if (discordResult[0].length && token) {
            try {
                await api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                    {
                        json: JSON.stringify({
                            toName: name,
                            subject: "You have been blacklisted!",
                            content: `You have been ${permanent ? "permanently " : ""}blacklisted${!permanent ? ` until ${ditim}` : ""} for the reason: ${desc}\n\nGo to https://discord.com/channels/933398849849020517/1213959542296158228 and tag @${interaction.member.displayName}`
                        })
                    },
                    { "x-access-token": token }
                );
                await interaction.client.users.send(discordResult[0][0].discordId,
                    `${name} has been ${permanent ? "permanently " : ""}blacklisted${!permanent ? ` until ${ditim}` : ""} for the reason: ${desc}\n\nGo to <#1213959542296158228> and tag <@${interaction.user.id}>\n\nhttps://tenor.com/view/blacklist-blacklist-nft-gif-24682375`);
            } catch (error) {
                console.error('Error sending blacklist notification:', error);
            }
        }
        await interaction.client.channels.cache.get(logChannel)
            .send(`${name} (${kingdomId}) (${kingdomId}) has been ${permanent ? "permanently " : ""}blacklisted${!permanent ? ` until ${ditim}` : ""} by <@${interaction.user.id}> for the reason: ${desc}`);

        if (allianceTag) {
            const kickToken = (await sql.query('SELECT token FROM botAccounts WHERE alliancetag = ?', [allianceTag]))[0][0]?.token;
            if (kickToken) {
                try {
                    await api.request(
                        "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/disband",
                        { memberKingdomId: kingdomId },
                        { "x-access-token": kickToken, "Content-Type": "application/json" }
                    );
                    await interaction.followUp({ content: "Kicked successfully", flags: 64 });
                    await interaction.client.channels.cache.get("1248750084376760451")
                        .send(`**${allianceTag}**\n${name} (${kingdomId}) has been kicked by <@${interaction.user.id}> (blacklisted)`);
                } catch (error) {
                    console.error('Error kicking blacklisted member:', error);
                    await interaction.followUp({ content: "There has been an error", flags: 64 });
                }
            }
        }
    } else if (interaction.customId.startsWith("playerinfo_notem_")) {
        const desc = interaction.fields.getTextInputValue('desc');
        await sql.query('INSERT INTO adminnote (discordid, kingdomid, note) VALUES (?, ?, ?)',
            [interaction.user.id, kingdomId, desc]);
        await interaction.reply({ content: "Note has been set correctly", flags: 64 });
    } else if (interaction.customId.startsWith("playerinfo_warnm_p_")) {
        const desc = interaction.fields.getTextInputValue('desc');
        const warnResult = await sql.query('SELECT num FROM warnings WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
        const precnum = warnResult[0].length ? warnResult[0][0].num : 0;
        await sql.query('INSERT INTO warnings (discordid, kingdomid, num, description) VALUES (?, ?, ?, ?)',
            [interaction.user.id, kingdomId, precnum + 1, desc]);
        await interaction.reply({ content: `Warning counter of ${name} (${kingdomId}) increased to ${precnum + 1} with the reason:\n${desc}`, flags: 64 });

        const discordResult = await sql.query('SELECT discordId FROM verified WHERE kingdomid = ?', [kingdomId]);
        const token = (await sql.query('SELECT token FROM botAccounts WHERE alliancetag = "LGN1"'))[0][0]?.token;
        if (discordResult[0].length && token) {
            try {
                await api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                    {
                        json: JSON.stringify({
                            toName: name,
                            subject: "Warning!",
                            content: `Your warning counter increased to ${precnum + 1} with the reason:\n${desc}`
                        })
                    },
                    { "x-access-token": token }
                );
                await interaction.client.users.send(discordResult[0][0].discordId,
                    `Warning counter of ${name} (${kingdomId}) increased to ${precnum + 1} with the reason:\n${desc}`);
            } catch (error) {
                console.error('Error sending warning notification:', error);
            }
        }
    } else if (interaction.customId.startsWith("playerinfo_warnm_n_")) {
        const desc = interaction.fields.getTextInputValue('desc');
        const warnResult = await sql.query('SELECT num FROM warnings WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
        const precnum = warnResult[0].length ? warnResult[0][0].num : 0;
        if (precnum <= 0) {
            return await interaction.reply({ content: "Warning counter already at 0", flags: 64 });
        }
        await sql.query('INSERT INTO warnings (discordid, kingdomid, num, description) VALUES (?, ?, ?, ?)',
            [interaction.user.id, kingdomId, precnum - 1, desc]);
        await interaction.reply({ content: `Warning counter of ${name} (${kingdomId}) decreased to ${precnum - 1} with the reason:\n${desc}`, flags: 64 });

        const discordResult = await sql.query('SELECT discordId FROM verified WHERE kingdomid = ?', [kingdomId]);
        const token = (await sql.query('SELECT token FROM botAccounts WHERE alliancetag = "LGN1"'))[0][0]?.token;
        if (discordResult[0].length && token) {
            try {
                await api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                    {
                        json: JSON.stringify({
                            toName: name,
                            subject: "Warning!",
                            content: `Your warning counter decreased to ${precnum - 1} with the reason:\n${desc}`
                        })
                    },
                    { "x-access-token": token }
                );
                await interaction.client.users.send(discordResult[0][0].discordId,
                    `Warning counter of ${name} (${kingdomId}) decreased to ${precnum - 1} with the reason:\n${desc}`);
            } catch (error) {
                console.error('Error sending warning notification:', error);
            }
        }
    }
}

async function sselect(interaction, sql, api) {
    if (interaction.customId.startsWith("playerinfo_chgrank")) {
        const [kingdomId, rank] = interaction.values[0].split(",");
        const nameResult = await sql.query('SELECT name, allianceTag FROM info WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
        if (!nameResult[0].length) {
            return await interaction.reply({ content: "Can't find this kingdom", flags: 64 });
        }
        const { name, allianceTag } = nameResult[0][0];
        const token = (await sql.query('SELECT token FROM botAccounts WHERE alliancetag = ?', [allianceTag]))[0][0]?.token;
        if (!token) {
            return await interaction.reply({ content: `Can't change rank in this alliance (${allianceTag})`, flags: 64 });
        }
        try {
            await api.request(
                "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/rank",
                { json: `{"memberKingdomId":"${kingdomId}","rank":${rank},"title":0}` },
                { "x-access-token": token }
            );
            await interaction.reply({ content: "Rank changed successfully", flags: 64 });
            await interaction.client.channels.cache.get("1248750084376760451")
                .send(`**${allianceTag}**\nRank of ${name} (${kingdomId}) changed to R${rank} by <@${interaction.user.id}>`);
        } catch (error) {
            console.error('Error changing rank:', error);
            return await interaction.reply({ content: "There has been an error", flags: 64 });
        }
    } else if (interaction.customId.startsWith("playerinfo_chinvite")) {
        const [kingdomId, allianceId] = interaction.values[0].split(",");
        const nameResult = await sql.query('SELECT name FROM info WHERE kingdomid = ? ORDER BY date DESC LIMIT 1', [kingdomId]);
        const allianceResult = await sql.query('SELECT allianceTag FROM info WHERE alliance = ? ORDER BY date DESC LIMIT 1', [allianceId]);
        if (!nameResult[0].length) {
            return await interaction.reply({ content: "Can't find this kingdom", flags: 64 });
        }
        if (!allianceResult[0].length) {
            return await interaction.reply({ content: "Can't find this alliance", flags: 64 });
        }
        const name = nameResult[0][0].name;
        const allianceTag = allianceResult[0][0].allianceTag;
        const token = (await sql.query('SELECT token FROM botAccounts WHERE alliancetag = ?', [allianceTag]))[0][0]?.token;
        if (!token) {
            return await interaction.reply({ content: `Can't invite in this alliance (${allianceTag})`, flags: 64 });
        }
        try {
            await api.request(
                "https://api-lok-live.leagueofkingdoms.com/api/alliance/invite",
                { kingdomId: kingdomId },
                { "x-access-token": token, "Content-Type": "application/json" }
            );
            await interaction.reply({ content: "Invite sent!", flags: 64 });
            await interaction.client.channels.cache.get("1248750084376760451")
                .send(`**${allianceTag}**\n${name} (${kingdomId}) has been invited by <@${interaction.user.id}>`);
        } catch (error) {
            console.error('Error sending invite:', error);
            return await interaction.reply({ content: "There has been an error", flags: 64 });
        }
    }
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

function parseString(input) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(input)) {
        const date = new Date(input);
        const timestamp = date.getTime();
        if (typeof timestamp === 'number' && !isNaN(timestamp)) {
            const [year, month, day] = input.split('-').map(Number);
            if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day) {
                return date;
            }
        }
    }
    const number = Number(input);
    if (!isNaN(number)) {
        const now = new Date();
        now.setHours(now.getHours() + number);
        return now;
    }
    return null;
}

async function handleNameAutocomplete(interaction, sql) {
    const focusedValue = interaction.options.getFocused();
    const names = await sql.searchKingdomName(focusedValue);
    const choices = names.slice(0, 25).map(nameObj => ({
        name: nameObj.name || 'Unknown',
        value: nameObj.kingdomId || 'Unknown'
    }));
    await interaction.respond(choices);
}