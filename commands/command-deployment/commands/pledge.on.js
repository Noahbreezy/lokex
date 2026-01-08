const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pledge")
        .setDescription("Display pledge rankings for continents or individuals")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("continents")
                .setDescription("Show the ranking of continents by total pledged A2Z")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("players")
                .setDescription("Show the ranking of individual pledgers for the guild's continent or a selected continent")
                .addIntegerOption((option) =>
                    option
                        .setName("continent")
                        .setDescription("Select merged continent (101-108); defaults to guild's")
                        .addChoices(
                            { name: "101", value: 101 },
                            { name: "102", value: 102 },
                            { name: "103", value: 103 },
                            { name: "104", value: 104 },
                            { name: "105", value: 105 },
                            { name: "106", value: 106 },
                            { name: "107", value: 107 },
                            { name: "108", value: 108 },
                        )
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const sql = module.exports.sql;
        const { options, guildId } = interaction;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        try {
            await interaction.deferReply({ ...ephemeral });

            const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "2");
            if (!subscriptionFlagInfo) {
                await interaction.editReply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription.", flags: 64 });
                return;
            }

            switch (options.getSubcommand()) {
                case "continents": {
                    // Fetch continent totals using merged mapping (pre/post Sept 1 rules)
                    const continentData = await sql.getMergedNetStaking();

                    if (!continentData || continentData.length === 0) {
                        await interaction.editReply({
                            content: "No continent pledge data found in the database.",
                            ...ephemeral,
                        });
                        return;
                    }

                    // Filter continents with at least 40,000 A2Z and sort by total amount (already sorted DESC by SQL)
                    const filteredContinents = continentData.filter(
                        (continent) => continent.total_amount >= 0
                    );

                    if (filteredContinents.length === 0) {
                        await interaction.editReply({
                            content: "No continents have pledged at least 40,000 A2Z.",
                            ...ephemeral,
                        });
                        return;
                    }

                    let rankingMessage = "**Top Continents by Net Pledged A2Z**\n\n";
                    filteredContinents.forEach((continent, index) => {
                        const rank = index + 1;
                        const formattedValue = formatNumberWithSuffix(continent.total_amount);
                        rankingMessage += `#${rank} - C${continent.continent} pledged ${formattedValue} A2Z\n`;
                    });

                    const embed = new EmbedBuilder()
                        .setTitle("🏆 Pledge Rankings - Continents")
                        .setDescription(rankingMessage)
                        .setColor("#1a73e8")
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed], ...ephemeral });
                    break;
                }

                case "players": {
                    // Optional continent override (101-108) for merged mapping
                    const selectedContinent = options.getInteger("continent");
                    let continent;
                    let individualPledgers;

                    if (selectedContinent) {
                        continent = selectedContinent;
                        individualPledgers = await sql.getIndividualPledgeTotalMergedByContinent(continent);
                    } else {
                        // Fallback to guild-linked continent
                        const guildWorldIds = await sql.getGuildWorldIds(guildId);
                        if (!guildWorldIds || guildWorldIds.length === 0) {
                            await interaction.editReply({
                                content: "This guild is not linked to any continent.",
                                ...ephemeral,
                            });
                            return;
                        }
                        continent = guildWorldIds[0];
                        individualPledgers = await sql.getIndividualPledgeTotalMerged(guildId);
                    }

                    if (individualPledgers.length === 0) {
                        await interaction.editReply({
                            content: `No individuals have pledged in continent ${continent}.`,
                            ...ephemeral,
                        });
                        return;
                    }

                    // Step 3: Create embeds for the pledgers
                    const embeds = createEmbeds(individualPledgers, continent);

                    // Step 4: Send the response
                    for (let i = 0; i < embeds.length; i++) {
                        if (i === 0) {
                            await interaction.editReply({ embeds: [embeds[i]], ...ephemeral });
                        } else {
                            await interaction.followUp({ embeds: [embeds[i]], ...ephemeral });
                        }
                    }
                    break;
                }

                default: {
                    await interaction.editReply({
                        content: "Unknown subcommand. Please try again.",
                        ...ephemeral,
                    });
                    break;
                }
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content: "An error occurred while fetching the pledge rankings.",
                ...ephemeral,
            });
        }
    },
};

function createEmbeds(rows, continent) {
    const embeds = [];
    let embed;
    let fieldCount = 0;

    for (let i = 0; i < rows.length; i++) {
        if (fieldCount % 25 === 0) {
            if (embed) {
                embeds.push(embed);
            }
            embed = new EmbedBuilder()
                .setTitle(
                    `${!embed ? "🚀 " : ""}Top ${fieldCount + 1} - ${Math.min(fieldCount + 25, rows.length)} Pledgers`
                )
                .setColor(0x00AE86);
        }

        const row = rows[i];
        // Clean the comment by removing all newline characters (\n)
        const cleanComment = row.comment ? row.comment.replace(/\n/g, '') : null;
        // Use cleaned comment if available, otherwise truncate from_address, or use "Unknown" as fallback
        const name = cleanComment ||
            (row.from_address ? `${row.from_address.slice(0, 4)}...${row.from_address.slice(-6)}` : "Unknown");
        const amount = row.sum; // Use 'sum' from the query result

        const rankDisplay = fieldCount + 1;
        let entry = "";
        if (rankDisplay === 1) entry += "👑 ";
        else if (rankDisplay === 2) entry += "🥈 ";
        else if (rankDisplay === 3) entry += "🥉 ";
        entry += `#${rankDisplay} - ${name} - ${formatNumberWithSuffix(amount)} A2Z`;

        // Add the entry to the current embed
        if (fieldCount % 25 === 0) {
            embed.addFields({
                name: `Top ${fieldCount + 1} - ${Math.min(fieldCount + 25, rows.length)} Pledgers`,
                value: entry,
                inline: false,
            });
        } else {
            const currentField = embed.data.fields[embed.data.fields.length - 1];
            currentField.value += `\n${entry}`;
        }

        fieldCount++;
    }

    if (embed) {
        embeds.push(embed);
    }
    embeds[embeds.length - 1].setTimestamp();
    return embeds;
}


function formatNumberWithSuffix(number) {
    if (number >= 1e6) {
        return (number / 1e6).toFixed(2) + "M";
    } else if (number >= 1e3) {
        return (number / 1e3).toFixed(2) + "K";
    }
    return (number / 1).toFixed(2).toString();
}