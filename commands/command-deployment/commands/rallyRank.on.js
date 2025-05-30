const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rallyrank")
        .setDescription("Display ranking of players by number of rallies in the guild")
        .addIntegerOption((option) =>
            option
                .setName("period")
                .setDescription("Number of days to look back (e.g., 30 for last 30 days)")
                .setRequired(false)
                .setMinValue(1)
        )
        .addStringOption((option) =>
            option
                .setName("startperiod")
                .setDescription("Start date (YYYY-MM-DD, e.g., 2025-01-01)")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("endperiod")
                .setDescription("End date (YYYY-MM-DD, e.g., 2025-05-30)")
                .setRequired(false)
        ),

    async execute(interaction) {
        const sql = module.exports.sql;
        const { guildId } = interaction;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        try {
            await interaction.deferReply({ ...ephemeral });

            // Check subscription
            const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "3");
            if (!subscriptionFlagInfo) {
                await interaction.editReply({
                    content: "Your guild needs a valid subscription to use this command. Use `/subscribe` to get a new subscription.",
                    flags: 64,
                });
                return;
            }

            // Get options
            const period = interaction.options.getInteger("period");
            const startPeriodInput = interaction.options.getString("startperiod");
            const endPeriodInput = interaction.options.getString("endperiod");

            // Validate and parse dates
            const now = new Date(); // Current date: 2025-05-30 14:16:00 CEST
            let startDate, endDate;

            if (startPeriodInput) {
                startDate = new Date(startPeriodInput);
                if (isNaN(startDate)) {
                    await interaction.editReply({
                        content: "Invalid startperiod format. Please use YYYY-MM-DD (e.g., 2025-01-01).",
                        ...ephemeral,
                    });
                    return;
                }
            }

            if (endPeriodInput) {
                endDate = new Date(endPeriodInput);
                endDate.setHours(23, 59, 59, 999); // Set to end of day for inclusivity
                if (isNaN(endDate)) {
                    await interaction.editReply({
                        content: "Invalid endperiod format. Please use YYYY-MM-DD (e.g., 2025-05-30).",
                        ...ephemeral,
                    });
                    return;
                }
            }

            // Determine date range based on options
            let description = "";
            if (period && !startPeriodInput && !endPeriodInput) {
                // Period only: From now back X days
                endDate = new Date(now);
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - period);
                description = `Last ${period} days (from ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]})`;
            } else if (startPeriodInput && !period && !endPeriodInput) {
                // Startperiod only: From start date to now
                startDate = new Date(startDate);
                endDate = new Date(now);
                description = `From ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`;
            } else if (endPeriodInput && !period && !startPeriodInput) {
                // Endperiod only: From beginning to end date
                endDate = new Date(endDate);
                description = `Up to ${endDate.toISOString().split("T")[0]}`;
            } else if (period && startPeriodInput && !endPeriodInput) {
                // Period + Startperiod: From start date for period days forward
                startDate = new Date(startDate);
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + period);
                if (endDate > now) endDate = new Date(now); // Don't exceed current date
                description = `${period} days starting from ${startDate.toISOString().split("T")[0]} (to ${endDate.toISOString().split("T")[0]})`;
            } else if (period && endPeriodInput && !startPeriodInput) {
                // Period + Endperiod: From end date for period days backward
                endDate = new Date(endDate);
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - period);
                description = `${period} days ending on ${endDate.toISOString().split("T")[0]} (from ${startDate.toISOString().split("T")[0]})`;
            } else if (startPeriodInput && endPeriodInput && !period) {
                // Startperiod + Endperiod: Between the two dates
                startDate = new Date(startDate);
                endDate = new Date(endDate);
                if (startDate > endDate) {
                    await interaction.editReply({
                        content: "Startperiod must be before endperiod.",
                        ...ephemeral,
                    });
                    return;
                }
                description = `From ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`;
            } else if (period && startPeriodInput && endPeriodInput) {
                // All three: From start date for period days, but not past end date
                startDate = new Date(startDate);
                endDate = new Date(endDate);
                if (startDate > endDate) {
                    await interaction.editReply({
                        content: "Startperiod must be before endperiod.",
                        ...ephemeral,
                    });
                    return;
                }
                let calculatedEndDate = new Date(startDate);
                calculatedEndDate.setDate(calculatedEndDate.getDate() + period);
                if (calculatedEndDate < endDate) endDate = calculatedEndDate;
                description = `${period} days starting from ${startDate.toISOString().split("T")[0]} (to ${endDate.toISOString().split("T")[0]})`;
            } else {
                // No options: All time 
                description = "All time since start of subscription";
            }

            // Build SQL query
            let rallyData;
            if (startDate && endDate) {
                rallyData = await sql.getRalliesRankByStartAndEndDate(guildId, startDate, endDate);
            } else if (startDate) {
                rallyData = await sql.getRalliesRankByStartDate(guildId, startDate);
            } else if (endDate) {
                rallyData = await sql.getRalliesRankByEndDate(guildId, endDate);
            } else {
                rallyData = await sql.getRalliesRankAllTime(guildId);
            }

            if (rallyData.length === 0) {
                await interaction.editReply({
                    content: `No rallies have been recorded for this guild (${description}).`,
                    ...ephemeral,
                });
                return;
            }

            // Create embeds for the rankings
            const embeds = createEmbeds(rallyData, description);

            // Send the response
            for (let i = 0; i < embeds.length; i++) {
                if (i === 0) {
                    await interaction.editReply({ embeds: [embeds[i]], ...ephemeral });
                } else {
                    await interaction.followUp({ embeds: [embeds[i]], ...ephemeral });
                }
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content: "An error occurred while fetching the rally rankings.",
                ...ephemeral,
            });
        }
    },
};

function createEmbeds(rows, description) {
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
                    `${!embed ? "🏆 " : ""}Top ${fieldCount + 1} - ${Math.min(fieldCount + 25, rows.length)} Rally Leaders`
                )
                .setDescription(description)
                .setColor("#FF4500");
        }

        const row = rows[i];
        const playerId = row.by_kingdom_id;
        const playerName = row.name || playerId; // Use name if available, otherwise fall back to by_kingdom_id
        const rallyCount = row.rally_count;

        const rankDisplay = fieldCount + 1;
        let entry = "";
        if (rankDisplay === 1) entry += "👑 ";
        else if (rankDisplay === 2) entry += "🥈 ";
        else if (rankDisplay === 3) entry += "🥉 ";
        entry += `#${rankDisplay} - ${playerName} - ${rallyCount} rallies`;

        if (fieldCount % 25 === 0) {
            embed.addFields({
                name: `Top ${fieldCount + 1} - ${Math.min(fieldCount + 25, rows.length)} Rally Leaders`,
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