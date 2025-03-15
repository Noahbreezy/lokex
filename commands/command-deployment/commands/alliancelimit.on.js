const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");


async function handleAllianceAutocomplete(interaction, sql) {
    const focusedValue = interaction.options.getFocused();
    const guildId = interaction.guild.id;
    const alliances = await sql.getGuildAlliances(focusedValue, guildId);

    // Ensure each alliance object has both name and value properties
    const choices = alliances.map(nameObj => ({
        name: nameObj.tag || 'Unknown',
        value: nameObj.allianceId || 'Unknown'
    }));

    console.log(choices);
    await interaction.respond(choices);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("alliance")
        .setDescription("Manage Alliance")
        .addSubcommand(subcommand =>
            subcommand
                .setName('setlimit')
                .setDescription('Change an alliance auto-acceptance limit')
                .addStringOption(option =>
                    option.setName('alliance')
                        .setDescription('Alliance Tag')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addIntegerOption(option =>
                    option.setName('power')
                        .setDescription('Power limit (1=1M)')
                )
                .addIntegerOption(option =>
                    option.setName('kills')
                        .setDescription('Kills limit (1=1M)')
                )
                .addIntegerOption(option =>
                    option.setName('speed')
                        .setDescription('Speed limit % (Cav speed + Troop speed treasures)')
                )
                .addIntegerOption(option =>
                    option.setName('combat')
                        .setDescription('Combat mastery point limit')
                )
                .addIntegerOption(option =>
                    option.setName('monster')
                        .setDescription('Monster mastery point limit')
                )
                .addIntegerOption(option =>
                    option.setName('infantry')
                        .setDescription('Infantry mastery point limit')
                )
                .addIntegerOption(option =>
                    option.setName('cavalry')
                        .setDescription('Cavalry mastery point limit')
                )
                .addIntegerOption(option =>
                    option.setName('ranged')
                        .setDescription('Ranged mastery point limit')
                )
                .addIntegerOption(option =>
                    option.setName('governor')
                        .setDescription('Governor mastery point limit')
                )
                .addBooleanOption(option =>
                    option.setName('verified')
                        .setDescription('If need to be verified on discord')
                )
                .addIntegerOption(option =>
                    option.setName('interval')
                        .setDescription('Interval in seconds in which the bot will accept new players. (30s min.)')
                )
                .addBooleanOption(option =>
                    option.setName('accept')
                        .setDescription('If the bot should accept or not')
                )
                .addBooleanOption(option =>
                    option.setName('kick')
                        .setDescription('If the bot should kick or not')
                )
                .addIntegerOption(option =>
                    option.setName('maxkick')
                        .setDescription('Max number of kicks at a time (recommended 3)')
                )
                .addBooleanOption(option =>
                    option.setName('cvcmode')
                        .setDescription('Turn on/off aggressive kicking')
                )
                .addIntegerOption(option =>
                    option.setName('titlegrace')
                        .setDescription('Title grace period in minutes (0=disabled)')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetlimit')
                .setDescription('Reset an alliance auto-acceptance limit')
                .addStringOption(option =>
                    option.setName('alliance')
                        .setDescription('Alliance Tag')
                        .setRequired(true)
                        .setAutocomplete(true))

        ).addSubcommand(subcommand =>
            subcommand
                .setName('limitinfo')
                .setDescription('Get Auto-acceptance limits info of all alliances')
        ),
    async execute(interaction) {
        const { commandName, options } = interaction;
        const sql = module.exports.sql; // Access the sql instance
        const guildId = interaction.guild.id;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? {flags:64} : {};

        switch (options.getSubcommand()) {
            case "setlimit":
                {
                    const alliance = options.getString('alliance');
                    const columns = ['castle', 'power', 'kills', 'speed', 'combat', 'monster', 'infantry', 'cavalry', 'ranged', 'governor', 'verified', 'interval', 'accept', 'kick', 'maxkick', 'cvcmode', 'titlegrace'];
                    const updates = [];

                    for (const column of columns) {
                        var value;
                        if (column === 'verified' || column === 'accept' || column === 'kick' || column === 'cvcmode') {
                            value = options.getBoolean(column);
                        } else {
                            value = options.getInteger(column);
                        }
                        if (value !== null) {
                            if (column === "power" || column === "kills")
                                value = value * 1000000;
                            updates.push({ column, value });
                        }
                    }

                    if (updates.length === 0) {
                        await interaction.reply({ content: 'No columns to update.', flags: 64 });
                        return;
                    }

                    try {
                        for (const { column, value } of updates) {
                            await sql.updateAllianceSetting(column, value, alliance);
                        }
                        await interaction.reply({ content: 'Alliance information updated successfully!', ...ephemeral });
                    } catch (error) {
                        console.error(error);
                        await interaction.reply({ content: 'There was an error updating the alliance information.', flags: 64 });
                    }
                }
                break;
            case "resetlimit":
                {
                    const alliance = options.getString('alliance');

                    // const columns = ['power', 'kills', 'speed', 'combat', 'monster', 'infantry', 'cavalry', 'ranged', 'governor', 'verified', '`interval`', 'accept', 'kick', 'maxkick', 'cvcmode', 'titlegrace'];
                    // const setClause = columns.map(column => {
                    //     if (column === '`interval`') return `${column} = 60`;
                    //     if (column === 'accept' || column === 'kick' || column === 'verified' ) return `${column} = 1`;
                    //     if (column === 'maxkick') return `${column} = 3`;
                    //     return `${column} = 0`;
                    // }).join(', ');

                    await sql.resetAllianceSettings(alliance);
                    await interaction.reply({ content: 'Alliance limit has been resetted!', ...ephemeral });
                }
                break;
            case "limitinfo":
                {
                    const rows = await sql.getAllAllianceSettings(guildId);
                    console.log(rows);

                    const embeds = [];
                    // Process the rows to create embeds for each alliance
                    rows.forEach(row => {
                        const allianceInfo = {
                            tag: row.tag,
                            castle: row.castle,
                            power: row.power,
                            kills: row.kills,
                            speed: row.speed,
                            combat: row.combat,
                            monster: row.monster,
                            infantry: row.infantry,
                            cavalry: row.cavalry,
                            ranged: row.ranged,
                            governor: row.governor,
                            verified: row.verified,
                            interval: row.interval,
                            accept: row.accept,
                            kick: row.kick,
                            maxkick: row.maxkick,
                            cvcmode: row.cvcmode,
                            titlegrace: row.titlegrace
                        };

                        const embed = createAllianceEmbed(allianceInfo);
                        embeds.push(embed);
                    });

                    if (embeds.length > 10) {
                        const chunks = [];
                        for (let i = 0; i < embeds.length; i += 10) {
                            chunks.push(embeds.slice(i, i + 10));
                        }
                        await interaction.reply({ embeds: chunks[0], ...ephemeral });
                        // Send each chunk of embeds as a separate message
                        chunks.slice(1).forEach(async chunk => {
                            await interaction.followUp({ embeds: chunk, ...ephemeral });
                        });
                    } else {
                        // Send all embeds in a single message
                        await interaction.reply({ embeds: embeds, ...ephemeral });
                    }
                }
        }
    },
    async autocomplete(interaction) {
        const sql = module.exports.sql; // Access the sql instance
        try {
            switch (interaction.options.getSubcommand()) {
                case "setlimit":
                    {
                        if (interaction.options.getFocused(true).name === "alliance") {
                            await handleAllianceAutocomplete(interaction, sql);
                        }
                    }
                    break;
                case "resetlimit":
                    {
                        if (interaction.options.getFocused(true).name === "alliance") {
                            await handleAllianceAutocomplete(interaction, sql);
                        }
                    }
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.error(error);
        }
    }
};

function createAllianceEmbed(allianceInfo) {
    const embed = new EmbedBuilder()
        .setTitle(`Alliance Info: ${allianceInfo.tag}`)
        .setColor('#0099ff');

    embed.addFields({ name: 'Castle', value: allianceInfo.castle > 0 ? allianceInfo.castle.toString() : 'no limits', inline: true });
    embed.addFields({ name: 'Power', value: allianceInfo.power > 0 ? formatNumberWithSuffix(allianceInfo.power) : 'no limits', inline: true });
    embed.addFields({ name: 'Kills', value: allianceInfo.kills > 0 ? formatNumberWithSuffix(allianceInfo.kills) : 'no limits', inline: true });
    embed.addFields({ name: 'Speed', value: allianceInfo.speed > 0 ? allianceInfo.speed.toString() + "%" : 'no limits', inline: true });
    embed.addFields({ name: 'Combat', value: allianceInfo.combat > 0 ? allianceInfo.combat.toString() : 'no limits', inline: true });
    embed.addFields({ name: 'Monster', value: allianceInfo.monster > 0 ? allianceInfo.monster.toString() : 'no limits', inline: true });
    embed.addFields({ name: 'Infantry', value: allianceInfo.infantry > 0 ? allianceInfo.infantry.toString() : 'no limits', inline: true });
    embed.addFields({ name: 'Cavalry', value: allianceInfo.cavalry > 0 ? allianceInfo.cavalry.toString() : 'no limits', inline: true });
    embed.addFields({ name: 'Ranged', value: allianceInfo.archers > 0 ? allianceInfo.archers.toString() : 'no limits', inline: true });
    embed.addFields({ name: 'Governor', value: allianceInfo.governor > 0 ? allianceInfo.governor.toString() : 'no limits', inline: true });
    embed.addFields({ name: 'Discord', value: allianceInfo.verified > 0 ? "Yes" : 'No', inline: true });
    embed.addFields({ name: 'Interval', value: allianceInfo.interval > 0 ? allianceInfo.interval.toString() : '30 sec', inline: true });
    embed.addFields({ name: 'Accept', value: allianceInfo.accept > 0 ? "Yes" : 'No', inline: true });
    embed.addFields({ name: 'Kick', value: allianceInfo.kick > 0 ? "Yes" : 'No', inline: true });
    embed.addFields({ name: 'Max Kick', value: allianceInfo.maxkick > 0 ? allianceInfo.maxkick.toString() : 'no kicking', inline: true });
    embed.addFields({ name: 'CvC Mode', value: allianceInfo.cvcmode > 0 ? "Yes" : 'No', inline: true });
    embed.addFields({ name: 'Title Grace', value: allianceInfo.titlegrace > 0 ? allianceInfo.titlegrace.toString() : 'no grace', inline: true });

    return embed;
}

function formatNumberWithSuffix(number) {
    if (number >= 1e6) {
        return (number / 1e6).toFixed(2) + 'M';
    } else if (number >= 1e3) {
        return (number / 1e3).toFixed(2) + 'K';
    }
    return (number / 1).toFixed(2).toString();
}