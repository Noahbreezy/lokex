const {
    SlashCommandBuilder,
    Events,
    ActionRowBuilder,
    ModalBuilder,
    ButtonStyle,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    ButtonBuilder,
    PermissionFlagsBits,
} = require("discord.js");

const hidden = "||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​||||​|| _ _ _ _ _ _"

async function handleNameAutocomplete(interaction, sql) {
    const focusedValue = interaction.options.getFocused();
    const names = await sql.searchKingdomName(focusedValue);

    // Ensure each alliance object has both name and value properties
    const choices = names.slice(0, 25).map(nameObj => ({
        name: nameObj.name || 'Unknown',
        value: nameObj.kingdomId || 'Unknown'
    }));

    // console.log(choices);
    await interaction.respond(choices);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blacklist")
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDescription("Manage Blacklist")
        .addSubcommand((subcommand) =>
            subcommand.setName("list").setDescription("List Blacklist")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Blacklist a user")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription(
                            "The user's ingame name (select from the list) or kingdomid"
                        )
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Unblacklist a user")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription(
                            "The user's ingame name (select from the list) or kingdomid"
                        )
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const sql = module.exports.sql;
        if (!interaction.guild) {
            await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
            return;
        }
        const { commandName, options } = interaction;
        const guild = interaction.guild.id;
        const ephemeralFlag = await sql.getEphemeral(guild);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        let logChannel;
        try {
            logChannel = (await sql.getGuildLogChannels(guild))[0].accept_log_channel;
        } catch (error) {
            logChannel = "1064289954739523654";
        }

        const subscriptionFlagInfo = await sql.checkSubscriptionValid(guild, "1");
        if (!subscriptionFlagInfo) {
            await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription.", flags: 64 });
            return;
        }


        const blacklistChannel = (await sql.getGuildBlacklistLogChannel(guild))[0]?.blacklist_log_channel;


        switch (options.getSubcommand()) {
            case "remove": {
                const kingdomId = interaction.options.getString("name");

                // Check if the kingdom is already blacklisted before removing
                const alreadybs = await sql.isKingdomBlacklisted(kingdomId, guild);
                // console.log(alreadybs);

                if (!alreadybs) {
                    return await interaction.reply({
                        content: "This kingdom is not blacklisted",
                        flags: 64,
                    });
                }

                // Check if we can find a name for the kingdomId
                const nameList = await sql.getKingdomName(kingdomId);
                let name = kingdomId;
                if (nameList.length > 0) {
                    name = nameList[0].name;
                }

                const discordId = (await sql.getVerifiedDiscordId(kingdomId, guild))[0]?.discordId;

                await sql.removeFromBlacklist(kingdomId, guild);
                await interaction.reply({
                    content: name + (kingdomId ? " (" + kingdomId + ")" : "") + ` from ` + (discordId ? `<@${discordId}>` : `<Unknown User>`) + " has been unblacklisted",
                    ...ephemeral,
                });

                const discordList = await sql.getVerifiedDiscordId(kingdomId, guild);

                if (discordList.length > 0) {
                    try {
                        await interaction.client.users.send(
                            discordList[0].discordId,
                            name + (kingdomId ? " (" + kingdomId + ")" : "") + " has been unblacklisted"
                        );

                        // const queryally11 =
                        //     'SELECT token FROM botAccounts where alliancetag="66M1"';

                        // // Execute the query and get the results
                        // const [rowsalliance11] = await con.promise().query(queryally11);

                        // var token11 = rowsalliance11[0].token;

                        // var headers211 = {
                        //     "x-access-token": token11,
                        // };
                        // var response = await axios.post(
                        //     "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                        //     new URLSearchParams({
                        //         json: JSON.stringify({
                        //             toName: name,
                        //             subject: "You have been unblacklisted",
                        //             content: "You aren't blacklisted anymore",
                        //         }),
                        //     }),
                        //     { headers: headers211 }
                        // );
                    } catch (error) { }
                }

                const logChannelCache = interaction.client.channels.cache.get(logChannel);

                if (logChannelCache) {
                    await logChannelCache.send(
                        name + (kingdomId ? " (" + kingdomId + ")" : "") + ` from ` + (discordId ? `<@${discordId}>` : `<Unknown User>`) +
                        ` has been ` +
                        "unblacklisted by <@" +
                        interaction.user.id +
                        ">"
                    );
                } else {
                    console.error("Log channel not found or bot lacks permissions.");
                }

                if (blacklistChannel) {
                    const blacklistChannelCache = interaction.client.channels.cache.get(blacklistChannel);
                    if (blacklistChannelCache) {
                        await blacklistChannelCache.send(
                            name + (kingdomId ? " (" + kingdomId + ")" : "") + ` from ` + (discordId ? `<@${discordId}>` : `<Unknown User>`) +
                            ` has been ` +
                            "unblacklisted by <@" +
                            interaction.user.id +
                            ">"
                        );
                    } else {
                        console.error("Blacklist channel not found or bot lacks permissions.");
                    }
                }
                break;
            }
            case "add": {
                const modal = new ModalBuilder()
                    .setCustomId("blacklist_blm_" + interaction.options.getString("name"))
                    .setTitle("Blacklist");

                // Add components to modal
                const name = interaction.options.getString("name");
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
            }
            case "list": {
                const blacklisted = await sql.getBlacklistedFromGuild(guild);
                const maxMessageLength = 2000; // Discord message character limit
                let messages = [];
                let currentMessage = "";

                if (blacklisted.length > 0) {
                    for (let i = 0; i < blacklisted.length; i++) {
                        let blacklistMessage = "";
                        let ex = blacklisted[i].expiration;

                        if (new Date(ex) > new Date("01-01-2030")) {
                            blacklistMessage = "**PERMANENT BLACKLISTED**";
                        } else {
                            blacklistMessage = "**BLACKLISTED UNTIL " + formatDateTime(ex) + "**";
                        }

                        let rowMessage =
                            `${i + 1}. ${(blacklisted[i].name) ? (blacklisted[i].name) : ""} (${(blacklisted[i].kingdomid)}) is ${blacklistMessage} by <@${blacklisted[i].discordid
                            }> ` +
                            `on: ${formatDateTime(blacklisted[i].date)} for: ${blacklisted[i].description
                            }\n`;

                        if ((currentMessage + rowMessage).length > maxMessageLength) {
                            messages.push(currentMessage);
                            currentMessage = rowMessage;
                        } else {
                            currentMessage += rowMessage;
                        }
                    }

                    if (currentMessage.length > 0) {
                        messages.push(currentMessage);
                    }
                } else {
                    messages.push("Blacklist is empty");
                }

                // Send the first message as a reply
                if (messages.length > 0) {
                    await interaction.reply({
                        content: messages[0],
                        ...ephemeral,
                    });

                    // Send the rest of the messages as follow-ups
                    for (let i = 1; i < messages.length; i++) {
                        await interaction.followUp({
                            content: messages[i],
                            ...ephemeral,
                        });
                    }
                }

                break;
            }
        }
    },
    async modals(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const guild = interaction.guild.id;
        const ephemeralFlag = await sql.getEphemeral(guild);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};
        await handleBlacklistModal(interaction, sql, api, ephemeral);
    },
    async autocomplete(interaction) {
        const sql = module.exports.sql;
        await handleNameAutocomplete(interaction, sql);
    },
};
function formatDateTime(data) {
    var date = new Date(data);

    // Format day with leading zero
    const options = { day: "2-digit", month: "long", year: "numeric" };

    // Format hours with leading zero
    var hours = ("0" + date.getHours()).slice(-2);

    // Format minutes with leading zero
    var minutes = ("0" + date.getMinutes()).slice(-2);

    // Format seconds with leading zero
    var seconds = ("0" + date.getSeconds()).slice(-2);

    return (
        date.toLocaleDateString("en-US", options) +
        ` ${hours}:${minutes}:${seconds}`
    );
}

async function handleBlacklistModal(interaction, sql, api, ephemeral) {
    await interaction.deferReply({ ...ephemeral });
    const userId = interaction.user.id;
    const guild = interaction.guild.id;
    let logChannel;
    try {
        logChannel = (await sql.getGuildLogChannels(guild))[0].accept_log_channel;
    } catch (error) {
        logChannel = "1064289954739523654";
    }


    const blacklistChannel = (await sql.getGuildBlacklistLogChannel(guild))[0]?.blacklist_log_channel;

    if (interaction.customId.startsWith("blacklist_blm_")) {
        let kingdomId = interaction.customId.split("_")[2];
        const isBlacklisted = await sql.isKingdomBlacklisted(kingdomId, guild)

        if (isBlacklisted) {
            let date = new Date(isBlacklisted[0].expiration);
            return await interaction.followUp({
                content:
                    "This kingdom is already blacklisted until " +
                    "<t:" +
                    Math.floor(date.getTime() / 1000) +
                    ":f> for the reason: " +
                    isBlacklisted[0].description,
                ...ephemeral,
            });
        }
        const nameList = await sql.getKingdomNameAndAlliance(kingdomId);
        let name = kingdomId;
        if (nameList.length > 0) {
            name = nameList[0].name;
        }
        const desc = interaction.fields.getTextInputValue("desc");
        const exp = interaction.fields.getTextInputValue("expir");
        let dateexp = new Date("2030-12-12");
        let permanent = true;
        let ditim = "";
        if (exp.trim() != "")
            if (parseString(exp)) {
                dateexp = parseString(exp);
                permanent = false;
                ditim = "<t:" + Math.floor(dateexp.getTime() / 1000) + ":f>";
            }
        const discordList = await sql.getVerifiedDiscordId(kingdomId, guild);
        console.log(userId, kingdomId, dateexp, desc, guild);
        const discordId = (await sql.getVerifiedDiscordId(kingdomId, guild))[0]?.discordId;
        await sql.addToBlacklist(userId, kingdomId, dateexp, desc, guild);
        await interaction.followUp({
            content:
                name + (kingdomId ? " (" + kingdomId + ")" : "") + ` from ` + (discordId ? `<@${discordId}>` : `<Unknown User>`) +
                ` has been ` +
                (permanent ? "permanent " : "") + "blacklisted" +
                (!permanent ? " until " + ditim : "") +
                " for the reason: " +
                desc,
            ...ephemeral,
        });
        if (discordList.length > 0) {
            try {
                await interaction.client.users.send(
                    discordList[0].discordId,
                    name + (kingdomId ? " (" + kingdomId + ")" : "") +
                    ` has been ` +
                    (permanent ? "permanent " : "") + "blacklisted" +
                    (!permanent ? " until " + ditim : "") +
                    " for the reason: " +
                    desc +
                    ">\n\n" + hidden + "https://tenor.com/view/blacklist-blacklist-nft-gif-24682375"
                );

                // const queryally11 =
                //     'SELECT token FROM botAccounts where allianceId=?';

                // // Execute the query and get the results
                // const [rowsalliance11] = await con.promise().query(queryally11);

                // var token11 = rowsalliance11[0].token;

                // var headers211 = {
                //     "x-access-token": token11,
                // };
                // var response = await axios.post(
                //     "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                //     new URLSearchParams({
                //         json: JSON.stringify({
                //             toName: name,
                //             subject: "You have been blacklisted!",
                //             content:
                //                 `You have been ` +
                //                 (permanent ? "permanent " : "") + "blacklisted" +
                //                 (!permanent ? " until " + ditim : "") +
                //                 " for the reason: " +
                //                 desc +
                //                 "\n\n",
                //         }),
                //     }),
                //     { headers: headers211 }
                // );
            } catch (error) { }
        }

        const logChannelCache = interaction.client.channels.cache.get(logChannel);
        if (logChannelCache) {
            await logChannelCache.send(
                name + (kingdomId ? " (" + kingdomId + ")" : "") + ` from ` + (discordId ? `<@${discordId}>` : `<Unknown User>`) +
                ` has been ` +
                (permanent ? "permanent " : "") + "blacklisted" +
                (!permanent ? " until " + ditim : "") +
                " by <@" +
                interaction.user.id +
                "> for the reason: " +
                desc
            );
        } else {
            console.error("Log channel not found or bot lacks permissions.");
        }

        if (blacklistChannel) {
            const blacklistChannelCache = interaction.client.channels.cache.get(blacklistChannel);
            if (blacklistChannelCache) {
                await blacklistChannelCache.send(
                    name + (kingdomId ? " (" + kingdomId + ")" : "") + ` from ` + (discordId ? `<@${discordId}>` : `<Unknown User>`) +
                    ` has been ` +
                    (permanent ? "permanent " : "") + "blacklisted" +
                    (!permanent ? " until " + ditim : "") +
                    " for the reason: " +
                    desc
                );
            } else {
                console.error("Blacklist channel not found or bot lacks permissions.");
            }
        }

        if (nameList.length > 0 || nameList[0]?.allianceId) {
            // console.log("namelist: ", nameList);
            let allianceId = nameList[0].allianceId;
            let allianceTag = nameList[0].allianceTag;
            if (!allianceId) {
                return;
            }
            console.log("alliance ID: ", allianceId);
            const managerToken = (await sql.getManagerToken(allianceId));
            console.log("token: ", managerToken[0].token);
            if (!managerToken.length > 0) {
                return await interaction.followUp({
                    content: "Can't kick from alliance " + (allianceTag ? allianceTag : "") + " (no manager bot) or user is not in an alliance.",
                    flags: 64,
                });
            }

            let token11 = managerToken[0].token;
            try {
                var response = await api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/disband",
                    { memberKingdomId: kingdomId },
                    {
                        "x-access-token": token11,
                        "Content-Type": "application/json",
                    }
                );
                if (response.data.result) {
                    await interaction.followUp({
                        content: "Kicked successfully",
                        ...ephemeral,
                    });
                    await interaction.client.channels.cache
                        .get(logChannel)
                        .send(
                            "**" +
                            allianceTag +
                            "**\n" +
                            name + (kingdomId ? " (" + kingdomId + ")" : "") + ` from ` + (discordId ? `<@${discordId}>` : `<Unknown User>`) +
                            " has been kicked by <@" +
                            interaction.user.id +
                            "> (blacklisted)"
                        );
                } else {
                    console.error(response);
                    return await interaction.followUp({
                        content: "Couldn't kick player, manual kick needed",
                        flags: 64,
                    });
                }
            } catch (error) {
                console.log(error);
                return await interaction.followUp({
                    content: "There has been an error",
                    flags: 64,
                });
            }
        } else {
            return await interaction.followUp({
                content: "User needs manual kick.",
                flags: 64,
            });
        }
    }
}

function parseString(input) {
    // Regular expression to match the format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Check if the input matches the date format
    if (dateRegex.test(input)) {
        const date = new Date(input);
        const timestamp = date.getTime();

        // Validate if the date object is a valid date
        if (typeof timestamp === "number" && !isNaN(timestamp)) {
            const [year, month, day] = input.split("-").map(Number);
            if (
                date.getUTCFullYear() === year &&
                date.getUTCMonth() + 1 === month &&
                date.getUTCDate() === day
            ) {
                return date;
            }
        }
    }

    // Check if the input is a number
    const number = Number(input);
    if (!isNaN(number)) {
        const now = new Date();
        now.setHours(now.getHours() + number);
        return now;
    }

    // If the input is neither a valid date nor a number, return null
    return null;
}
