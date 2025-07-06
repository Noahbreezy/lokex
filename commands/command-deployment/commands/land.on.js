const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('land')
        .setDescription('Get land contribution data for specified land IDs and date range')
        .addStringOption(option =>
            option.setName('landids')
                .setDescription('Comma-separated list of land IDs (e.g., 157357,123456,789012)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('from')
                .setDescription('Start date in YYYY-MM-DD format')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('to')
                .setDescription('End date in YYYY-MM-DD format')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('format')
                .setDescription('Output format')
                .addChoices(
                    { name: 'CSV', value: 'csv' },
                    { name: 'Embed (Discord)', value: 'embed' }
                )
                .setRequired(false))
        .addStringOption(option =>
            option.setName('continent')
                .setDescription('Filter by continent(s) - comma-separated list (e.g., 24,25,26) or leave empty for all')
                .setRequired(false)),

    async execute(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const guildId = interaction.guild.id;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        // Check subscription
        const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "3");
        if (!subscriptionFlagInfo) {
            await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription. ", ...ephemeral });
            return;
        }

        await interaction.deferReply();

        try {
            const landIdsInput = interaction.options.getString('landids');
            const fromDate = interaction.options.getString('from');
            const toDate = interaction.options.getString('to');
            const format = interaction.options.getString('format') || 'csv';
            const continentFilter = interaction.options.getString('continent');

            // Parse continent filter if provided
            let continentList = null;
            if (continentFilter) {
                continentList = continentFilter.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c));
                if (continentList.length === 0) {
                    return await interaction.editReply('❌ Invalid continent filter. Please provide numeric continent IDs (e.g., 24,25,26).');
                }
            }

            // Validate and parse land IDs
            const landIds = landIdsInput.split(',').map(id => id.trim()).filter(id => id);
            if (landIds.length === 0) {
                return await interaction.editReply('❌ Please provide at least one valid land ID.');
            }

            // Validate land IDs are numeric
            for (const landId of landIds) {
                if (!/^\d+$/.test(landId)) {
                    return await interaction.editReply(`❌ Invalid land ID: ${landId}. Land IDs must be numeric.`);
                }
            }

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
                return await interaction.editReply('❌ Invalid date format. Please use YYYY-MM-DD format.');
            }

            // Validate date range (max 7 days)
            const startDate = new Date(fromDate);
            const endDate = new Date(toDate);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return await interaction.editReply('❌ Invalid date values. Please check your dates.');
            }

            if (startDate > endDate) {
                return await interaction.editReply('❌ Start date cannot be after end date.');
            }


            const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
            if (daysDiff > 56) {
                return await interaction.editReply('❌ Date range cannot exceed 8 weeks (56 days).');
            }


            // Fetch data for all land IDs and all 7-day chunks
            await interaction.editReply(`🔄 Fetching contribution data for ${landIds.length} land(s) from ${fromDate} to ${toDate} (may take a while for large ranges)...`);

            const allContributions = [];
            const errors = [];

            // Helper to format date as YYYY-MM-DD
            function formatDate(date) {
                return date.toISOString().slice(0, 10);
            }

            // For each landId, split the date range into 7-day chunks and fetch each chunk
            const allRequests = [];
            for (const landId of landIds) {
                let chunkStart = new Date(startDate);
                while (chunkStart <= endDate) {
                    const chunkEnd = new Date(Math.min(
                        chunkStart.getTime() + 6 * 24 * 60 * 60 * 1000,
                        endDate.getTime()
                    ));
                    allRequests.push({
                        landId,
                        from: formatDate(chunkStart),
                        to: formatDate(chunkEnd)
                    });
                    chunkStart = new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000);
                }
            }

            // Make parallel requests for all landId/date chunks
            const chunkResults = await Promise.all(allRequests.map(async ({ landId, from, to }) => {
                try {
                    const url = `https://api-lok-live.leagueofkingdoms.com/api/stat/land/contribution?from=${from}&to=${to}&landId=${landId}`;
                    const headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    };
                    const response = await api.get(url, headers);
                    if (response.data && response.data.result && response.data.contribution) {
                        const contributions = response.data.contribution.map(contrib => ({
                            landId: landId,
                            owner: response.data.owner,
                            kingdomId: contrib.kingdomId,
                            kingdomName: contrib.name,
                            continent: contrib.continent,
                            contribution: contrib.total,
                            dateRange: `${from} to ${to}`
                        }));
                        return contributions;
                    } else {
                        errors.push(`Land ID ${landId} (${from} to ${to}): No contribution data found`);
                        return [];
                    }
                } catch (error) {
                    console.error(`Error fetching data for land ID ${landId} (${from} to ${to}):`, error);
                    errors.push(`Land ID ${landId} (${from} to ${to}): ${error.message || 'Unknown error'}`);
                    return [];
                }
            }));

            // Flatten all contributions into a single array
            chunkResults.forEach(contributions => {
                allContributions.push(...contributions);
            });

            // Aggregate contributions by kingdom ID to avoid duplicates
            const kingdomContributions = new Map();
            
            for (const contrib of allContributions) {
                const key = `${contrib.kingdomId}-${contrib.landId}`;
                
                if (kingdomContributions.has(key)) {
                    // Add to existing entry
                    const existing = kingdomContributions.get(key);
                    existing.contribution += contrib.contribution;
                    // Keep the most recent date range or combine them
                    if (!existing.dateRange.includes(contrib.dateRange)) {
                        existing.dateRange = `${existing.dateRange}, ${contrib.dateRange}`;
                    }
                } else {
                    // Create new entry
                    kingdomContributions.set(key, {
                        landId: contrib.landId,
                        owner: contrib.owner,
                        kingdomId: contrib.kingdomId,
                        kingdomName: contrib.kingdomName,
                        continent: contrib.continent,
                        contribution: contrib.contribution,
                        dateRange: contrib.dateRange
                    });
                }
            }

            // Convert back to array
            const aggregatedContributions = Array.from(kingdomContributions.values());

            // Apply continent filter if specified
            let filteredContributions = aggregatedContributions;
            if (continentList && continentList.length > 0) {
                filteredContributions = aggregatedContributions.filter(contrib => 
                    continentList.includes(contrib.continent)
                );
                
                if (filteredContributions.length === 0) {
                    let errorMessage = `❌ No contribution data found for continent(s): ${continentList.join(', ')}.`;
                    if (aggregatedContributions.length > 0) {
                        const availableContinents = [...new Set(aggregatedContributions.map(c => c.continent))].sort((a, b) => a - b);
                        errorMessage += `\n\n**Available continents in data:** ${availableContinents.join(', ')}`;
                    }
                    if (errors.length > 0) {
                        errorMessage += '\n\n**Errors:**\n' + errors.join('\n');
                    }
                    return await interaction.editReply(errorMessage);
                }
            }

            if (filteredContributions.length === 0) {
                let errorMessage = '❌ No contribution data found for any of the specified lands.';
                if (errors.length > 0) {
                    errorMessage += '\n\n**Errors:**\n' + errors.join('\n');
                }
                return await interaction.editReply(errorMessage);
            }

            // Sort by contribution amount (highest first)
            filteredContributions.sort((a, b) => b.contribution - a.contribution);

            // Handle embed format
            if (format === 'embed') {
                return await this.sendEmbedResponse(interaction, filteredContributions, fromDate, toDate, errors, continentList);
            }

            // Generate CSV file (can be opened in Excel)
            const fileName = `land_contributions_${fromDate}_to_${toDate}${continentList ? '_c' + continentList.join('-') : ''}.csv`;
            const fileContent = this.generateCSV(filteredContributions);

            // Write file temporarily
            const tempFilePath = path.join(__dirname, '..', '..', '..', 'temp', fileName);

            // Ensure temp directory exists
            const tempDir = path.dirname(tempFilePath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            fs.writeFileSync(tempFilePath, fileContent);

            // Create attachment
            const attachment = new AttachmentBuilder(tempFilePath, { name: fileName });

            // Prepare summary message
            const totalContribution = filteredContributions.reduce((sum, contrib) => sum + contrib.contribution, 0);
            const uniqueLands = new Set(filteredContributions.map(contrib => contrib.landId)).size;
            const uniqueContinents = new Set(filteredContributions.map(contrib => contrib.continent)).size;

            let summaryMessage = `✅ **Land Contribution Report**\n`;
            summaryMessage += `📅 **Date Range:** ${fromDate} to ${toDate}\n`;
            summaryMessage += `🏰 **Lands Analyzed:** ${uniqueLands}\n`;
            summaryMessage += `👑 **Contributing Kingdoms:** ${filteredContributions.length}\n`;
            summaryMessage += `🌍 **Continents:** ${uniqueContinents}${continentList ? ` (filtered: ${continentList.join(', ')})` : ''}\n`;
            summaryMessage += `💰 **Total Contribution Amount:** ${totalContribution.toFixed(2)}\n`;
            summaryMessage += `\n📄 **File Format:** CSV (can be opened in Excel or any spreadsheet application)\n`;

            if (errors.length > 0) {
                summaryMessage += `\n⚠️ **Warnings:**\n${errors.join('\n')}`;
            }

            await interaction.editReply({
                content: summaryMessage,
                files: [attachment]
            });

            // Clean up temp file
            setTimeout(() => {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }, 60000); // Delete after 1 minute

        } catch (error) {
            console.error('Error in land command:', error);
            await interaction.editReply('❌ An error occurred while fetching land contribution data. Please try again later.');
        }
    },

    generateCSV(contributions) {
        const headers = [
            'Land ID',
            'Owner Address',
            'Kingdom ID',
            'Kingdom Name',
            'Continent',
            'Total Contribution',
            'Date Ranges'
        ];

        let csv = headers.join(',') + '\n';

        for (const contrib of contributions) {
            const row = [
                contrib.landId,
                `"${contrib.owner}"`,
                contrib.kingdomId,
                `"${contrib.kingdomName.replace(/"/g, '""')}"`, // Escape quotes in kingdom names
                contrib.continent,
                contrib.contribution.toFixed(2),
                `"${contrib.dateRange}"`
            ];
            csv += row.join(',') + '\n';
        }

        return csv;
    },

    async sendEmbedResponse(interaction, allContributions, fromDate, toDate, errors, continentFilter = null) {
        const { EmbedBuilder } = require('discord.js');

        // Calculate summary statistics
        const totalContribution = allContributions.reduce((sum, contrib) => sum + contrib.contribution, 0);
        const uniqueLands = new Set(allContributions.map(contrib => contrib.landId)).size;
        const uniqueContinents = new Set(allContributions.map(contrib => contrib.continent)).size;

        // Create main summary embed
        const summaryEmbed = new EmbedBuilder()
            .setTitle('🏰 Land Contribution Report')
            .setColor(0x00AE86)
            .addFields(
                { name: '📅 Date Range', value: `${fromDate} to ${toDate}`, inline: true },
                { name: '🏰 Lands Analyzed', value: uniqueLands.toString(), inline: true },
                { name: '👑 Contributing Kingdoms', value: allContributions.length.toString(), inline: true },
                { name: '🌍 Continents', value: `${uniqueContinents}${continentFilter ? ` (filtered: ${continentFilter.join(', ')})` : ''}`, inline: true },
                { name: '💰 Total Amount', value: totalContribution.toFixed(2), inline: true },
                { name: '⏰ Generated', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setTimestamp();

        // Add warnings to summary embed if any errors occurred
        if (errors.length > 0) {
            const errorText = errors.slice(0, 5).join('\n');
            const truncatedErrorText = errorText.length > 1024 ? errorText.substring(0, 1020) + '...' : errorText;
            summaryEmbed.addFields({
                name: '⚠️ Warnings',
                value: truncatedErrorText,
                inline: false
            });
        }

        // Show up to 100 contributors split across multiple embeds
        const maxTotalContributions = 100;
        const contributionsToShow = Math.min(maxTotalContributions, allContributions.length);
        const topContributions = allContributions.slice(0, contributionsToShow);

        // Send the summary embed first
        await interaction.editReply({ embeds: [summaryEmbed] });

        // Process contributors and send embeds one by one
        let currentEmbedText = '';
        let currentStartRank = 1;
        let currentRank = 1;

        for (const contrib of topContributions) {
            const truncatedName = contrib.kingdomName.length > 15
                ? contrib.kingdomName.substring(0, 12) + '...'
                : contrib.kingdomName;
            const entry = `\`${currentRank.toString().padStart(3, ' ')}.\` **${truncatedName}** - ${contrib.contribution.toFixed(2)}\n     Land: ${contrib.landId} | Continent: ${contrib.continent}\n`;

            // Check if adding this entry would exceed description limit (use 3800 for safety)
            if ((currentEmbedText + entry).length > 3800) {
                // Send current embed if it has content
                if (currentEmbedText.length > 0) {
                    const contributorEmbed = new EmbedBuilder()
                        .setTitle(`🏆 Top Contributors (${currentStartRank}-${currentRank - 1})`)
                        .setDescription(currentEmbedText)
                        .setColor(0x00AE86);
                    
                    await interaction.followUp({ embeds: [contributorEmbed] });
                    // Small delay to be respectful to Discord's API
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                // Start new embed
                currentEmbedText = '';
                currentStartRank = currentRank;
            }

            currentEmbedText += entry;
            currentRank++;
        }

        // Send the last embed if it has content
        if (currentEmbedText.length > 0) {
            const contributorEmbed = new EmbedBuilder()
                .setTitle(`🏆 Top Contributors (${currentStartRank}-${currentRank - 1})`)
                .setDescription(currentEmbedText)
                .setColor(0x00AE86);
            
            // Add footer only to the last embed
            if (allContributions.length > maxTotalContributions) {
                contributorEmbed.setFooter({ 
                    text: `Showing top ${contributionsToShow} of ${allContributions.length} contributors. Use CSV format for complete data.` 
                });
            } else {
                contributorEmbed.setFooter({ 
                    text: `Showing all ${contributionsToShow} contributors.` 
                });
            }
            
            await interaction.followUp({ embeds: [contributorEmbed] });
        }
    }
};
