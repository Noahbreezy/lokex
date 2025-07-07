const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pledge")
        .setDescription("Display pledge rankings for continents or individuals")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("continents")
                .setDescription("Show the ranking of continents by total pledged LOKA")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("players")
                .setDescription("Show the ranking of individual pledgers for the guild's continent")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("simulate-invasion")
                .setDescription("Simulate a 64-continent tournament based on pledge wealth and battle strength")
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
                    // Fetch continent totals from the local database
                    const continentData = await sql.getNetStakingByContinent();

                    if (!continentData || continentData.length === 0) {
                        await interaction.editReply({
                            content: "No continent pledge data found in the database.",
                            ...ephemeral,
                        });
                        return;
                    }

                    // Filter continents with at least 40,000 LOKA and sort by total amount (already sorted DESC by SQL)
                    const filteredContinents = continentData.filter(
                        (continent) => continent.total_amount >= 0
                    );

                    if (filteredContinents.length === 0) {
                        await interaction.editReply({
                            content: "No continents have pledged at least 40,000 LOKA.",
                            ...ephemeral,
                        });
                        return;
                    }

                    let rankingMessage = "**Top Continents by Net Pledged LOKA**\n\n";
                    filteredContinents.forEach((continent, index) => {
                        const rank = index + 1;
                        const formattedValue = continent.total_amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        });
                        rankingMessage += `#${rank} - C${continent.continent} pledged ${formattedValue} LOKA\n`;
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
                    // Step 1: Get the continent associated with the guild
                    const guildContinents = await sql.getGuildContinent(guildId);
                    if (!guildContinents || guildContinents.length === 0) {
                        await interaction.editReply({
                            content: "This guild is not linked to any continent.",
                            ...ephemeral,
                        });
                        return;
                    }

                    const continent = guildContinents[0].continent;

                    // Step 2: Query the staking_transactions table
                    const individualPledgers = await sql.getIndividualPledgeTotal(guildId);

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

                case "simulate-invasion": {
                    // Fetch continent totals from the local database
                    const continentData = await sql.getNetStakingByContinent();

                    if (!continentData || continentData.length === 0) {
                        await interaction.editReply({
                            content: "No continent pledge data found in the database.",
                            ...ephemeral,
                        });
                        return;
                    }

                    // Define continent strength ranking (strongest to weakest)
                    const strengthRanking = [
                        'C24', 'C17', 'C60', 'C59', 'C20', 'C9', 'C2', 'C25', 'C50', 'C23', 
                        'C11', 'C45', 'C69', 'C29', 'C19', 'C41', 'C40', 'C10', 'C28', 'C22', 
                        'C3', 'C1', 'C51', 'C27', 'C48', 'C34', 'C31', 'C38', 'C67', 'C55', 'C26', 
                        'C70', 'C63', 'C32', 'C65', 'C33', 'C16', 'C54', 'C66', 'C14', 'C4', 
                        'C13', 'C47', 'C12', 'C57', 'C49', 'C64', 'C6', 'C15', 'C61', 
                        'C7', 'C35', 'C58', 'C46', 'C43', 'C39', 'C18', 'C68', 'C5', 'C37', 
                        'C53', 'C30', 'C36', 'C56', 'C8', 'C44', 'C62', 'C42', 'C21', 'C52'
                    ];

                    // Normalize continent names to ensure they have 'C' prefix
                    const normalizedData = continentData.map(continent => ({
                        ...continent,
                        continent: continent.continent.toString().startsWith('C') ? 
                            continent.continent : `C${continent.continent}`
                    }));

                    // Sort by pledge amount (descending) and take top 64
                    normalizedData.sort((a, b) => b.total_amount - a.total_amount);
                    const top64 = normalizedData.slice(0, 64);

                    if (top64.length < 64) {
                        await interaction.editReply({
                            content: `Only ${top64.length} continents found with pledge data. Need at least 64 for tournament.`,
                            ...ephemeral,
                        });
                        return;
                    }

                    // Create matchups: richest vs poorest, 2nd richest vs 2nd poorest, etc.
                    const matchups = [];
                    for (let i = 0; i < 32; i++) {
                        const richContinent = top64[i];
                        const poorContinent = top64[63 - i];
                        matchups.push([richContinent, poorContinent]);
                    }

                    // Simulate tournament rounds
                    const tournamentResults = simulateTournament(matchups, strengthRanking);

                    // Create embed with results
                    const embed = new EmbedBuilder()
                        .setTitle("🏛️ Continental Invasion Tournament Simulation")
                        .setDescription("*Based on pledge wealth matchups and continental battle strength*")
                        .setColor("#ff6b35")
                        .setTimestamp();

                    // Add final 8 quarterfinalists
                    embed.addFields(
                        {
                            name: "🏆 FINAL 8 QUARTERFINALISTS",
                            value: tournamentResults.quarterfinalists.map((continent, index) => 
                                `#${index + 1} - **${continent}**`
                            ).join('\n'),
                            inline: false
                        }
                    );

                    // Add some round details
                    embed.addFields({
                        name: "📊 Tournament Format",
                        value: `• **64 continents** (eliminated 6 poorest)\n• **Bracket seeding**: Richest vs Poorest pledge amounts\n• **Battle outcomes**: Based on continental strength rankings\n• **Tournament ends** at Final 8 quarterfinalists`,
                        inline: false
                    });

                    // Send the final result first
                    await interaction.editReply({ embeds: [embed], ...ephemeral });

                    // Create and send round-by-round embeds
                    const roundEmbeds = createRoundEmbeds(matchups, strengthRanking);
                    for (let i = 0; i < roundEmbeds.length; i++) {
                        await interaction.followUp({ embeds: [roundEmbeds[i]], ...ephemeral });
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

function createRoundEmbeds(matchups, strengthRanking) {
    const embeds = [];
    
    // Helper function to determine winner based on strength ranking
    function getWinner(continent1, continent2) {
        const index1 = strengthRanking.indexOf(continent1.continent);
        const index2 = strengthRanking.indexOf(continent2.continent);
        
        // Lower index = stronger (earlier in ranking list)
        // If continent not in ranking, treat as weakest
        if (index1 === -1 && index2 === -1) return continent1; // arbitrary
        if (index1 === -1) return continent2;
        if (index2 === -1) return continent1;
        
        return index1 < index2 ? continent1 : continent2;
    }

    // Round 1: 64 -> 32
    let currentRound = matchups.map(matchup => getWinner(matchup[0], matchup[1]));
    
    const round1Embed = new EmbedBuilder()
        .setTitle("⚔️ Round 1: 64 → 32 Continents")
        .setDescription("*First elimination round results*")
        .setColor("#e74c3c");
    
    let round1Results = "";
    matchups.forEach((matchup, index) => {
        const winner = getWinner(matchup[0], matchup[1]);
        const loser = winner.continent === matchup[0].continent ? matchup[1] : matchup[0];
        round1Results += `**${winner.continent}** defeats ${loser.continent}\n`;
        if ((index + 1) % 16 === 0 && index < matchups.length - 1) {
            round1Results += "\n";
        }
    });
    
    round1Embed.setDescription(round1Results);
    embeds.push(round1Embed);
    
    // Round 2: 32 -> 16 (re-sort and match richest vs poorest)
    currentRound.sort((a, b) => b.total_amount - a.total_amount);
    const round2Matchups = [];
    for (let i = 0; i < 16; i++) {
        const richContinent = currentRound[i];
        const poorContinent = currentRound[31 - i];
        round2Matchups.push([richContinent, poorContinent]);
    }
    currentRound = round2Matchups.map(matchup => getWinner(matchup[0], matchup[1]));
    
    const round2Embed = new EmbedBuilder()
        .setTitle("⚔️ Round 2: 32 → 16 Continents")
        .setDescription("*Second elimination round results*")
        .setColor("#f39c12");
    
    let round2Results = "";
    round2Matchups.forEach((matchup, index) => {
        const winner = getWinner(matchup[0], matchup[1]);
        const loser = winner.continent === matchup[0].continent ? matchup[1] : matchup[0];
        round2Results += `**${winner.continent}** defeats ${loser.continent}\n`;
        if ((index + 1) % 8 === 0 && index < round2Matchups.length - 1) {
            round2Results += "\n";
        }
    });
    
    round2Embed.setDescription(round2Results);
    embeds.push(round2Embed);
    
    // Round 3: 16 -> 8 (re-sort and match richest vs poorest)
    currentRound.sort((a, b) => b.total_amount - a.total_amount);
    const round3Matchups = [];
    for (let i = 0; i < 8; i++) {
        const richContinent = currentRound[i];
        const poorContinent = currentRound[15 - i];
        round3Matchups.push([richContinent, poorContinent]);
    }
    const finalRound = round3Matchups.map(matchup => getWinner(matchup[0], matchup[1]));
    
    const round3Embed = new EmbedBuilder()
        .setTitle("⚔️ Round 3: 16 → 8 Continents (FINAL)")
        .setDescription("*Final elimination round - determining the elite 8*")
        .setColor("#27ae60");
    
    let round3Results = "";
    round3Matchups.forEach((matchup, index) => {
        const winner = getWinner(matchup[0], matchup[1]);
        const loser = winner.continent === matchup[0].continent ? matchup[1] : matchup[0];
        round3Results += `**${winner.continent}** defeats ${loser.continent}\n`;
    });
    
    round3Embed.setDescription(round3Results);
    embeds.push(round3Embed);
    
    return embeds;
}

function simulateTournament(matchups, strengthRanking) {
    // Helper function to determine winner based on strength ranking
    function getWinner(continent1, continent2) {
        const index1 = strengthRanking.indexOf(continent1.continent);
        const index2 = strengthRanking.indexOf(continent2.continent);
        
        // Lower index = stronger (earlier in ranking list)
        // If continent not in ranking, treat as weakest
        if (index1 === -1 && index2 === -1) return continent1; // arbitrary
        if (index1 === -1) return continent2;
        if (index2 === -1) return continent1;
        
        return index1 < index2 ? continent1 : continent2;
    }

    // Round 1: 64 -> 32
    let currentRound = matchups.map(matchup => getWinner(matchup[0], matchup[1]));
    
    // Round 2: 32 -> 16 (re-sort and match richest vs poorest)
    currentRound.sort((a, b) => b.total_amount - a.total_amount);
    const round2Matchups = [];
    for (let i = 0; i < 16; i++) {
        const richContinent = currentRound[i];
        const poorContinent = currentRound[31 - i];
        round2Matchups.push([richContinent, poorContinent]);
    }
    currentRound = round2Matchups.map(matchup => getWinner(matchup[0], matchup[1]));
    
    // Round 3: 16 -> 8 (re-sort and match richest vs poorest)
    currentRound.sort((a, b) => b.total_amount - a.total_amount);
    const round3Matchups = [];
    for (let i = 0; i < 8; i++) {
        const richContinent = currentRound[i];
        const poorContinent = currentRound[15 - i];
        round3Matchups.push([richContinent, poorContinent]);
    }
    currentRound = round3Matchups.map(matchup => getWinner(matchup[0], matchup[1]));
    
    // Don't simulate further - return the 8 quarterfinalists
    const quarterfinalists = currentRound;
    
    return {
        quarterfinalists: quarterfinalists.map(c => c.continent)
    };
}

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
        entry += `#${rankDisplay} - ${name} - ${formatNumberWithSuffix(amount)} LOKA`;

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