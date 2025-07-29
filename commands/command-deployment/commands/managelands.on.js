const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("managelands")
        .setDescription("Manage guild land IDs")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add a land ID to the guild")
                .addIntegerOption((option) =>
                    option
                        .setName("land-id")
                        .setDescription("The land ID to add")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove a land ID from the guild")
                .addIntegerOption((option) =>
                    option
                        .setName("land-id")
                        .setDescription("The land ID to remove")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("List all land IDs for this guild")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("clear")
                .setDescription("Remove all land IDs from the guild")
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const { commandName, options, guildId, user } = interaction;
        const guild = interaction.guild;
        const guildName = interaction.guild.name;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        try {
            const guildExistsFlag = await sql.guildExists(guildId);
            if (!guildExistsFlag) {
                await sql.addGuild(guildId, guildName);
            }

            switch (options.getSubcommand()) {
                case "add":
                    {
                        const landId = options.getInteger("land-id");
                        
                        // Check if land ID already exists for this guild
                        const existingLand = await sql.checkGuildLand(landId, guildId);
                        if (existingLand) {
                            await interaction.reply({ 
                                content: `❌ Land ID ${landId} is already registered to this guild.`, 
                                flags: 64 
                            });
                            return;
                        }
                        
                        await sql.addGuildLand(landId, guildId);
                        
                        await interaction.reply({ 
                            content: `✅ Land ID ${landId} has been added to this guild.`, 
                            ...ephemeral 
                        });
                        break;
                    }
                case "remove":
                    {
                        const landId = options.getInteger("land-id");
                        
                        // Check if land ID exists for this guild
                        const existingLand = await sql.checkGuildLand(landId, guildId);
                        if (!existingLand) {
                            await interaction.reply({ 
                                content: `❌ Land ID ${landId} is not registered to this guild.`, 
                                flags: 64 
                            });
                            return;
                        }
                        
                        await sql.removeGuildLand(landId, guildId);
                        
                        await interaction.reply({ 
                            content: `✅ Land ID ${landId} has been removed from this guild.`, 
                            ...ephemeral 
                        });
                        break;
                    }
                case "list":
                    {
                        const guildLands = await sql.getGuildLands(guildId);
                        
                        if (!guildLands || guildLands.length === 0) {
                            await interaction.reply({ 
                                content: "📋 This guild has no registered land IDs.", 
                                ...ephemeral 
                            });
                            return;
                        }
                        
                        const landIds = guildLands.map(land => land.land_id).sort((a, b) => a - b);
                        const landsList = landIds.join(', ');
                        
                        const embed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(`${guildName} - Registered Lands`)
                            .setDescription(`**Total Lands:** ${landIds.length}\n**Land IDs:** ${landsList}`)
                            .setTimestamp();
                        
                        await interaction.reply({ 
                            embeds: [embed], 
                            ...ephemeral 
                        });
                        break;
                    }
                case "clear":
                    {
                        const guildLands = await sql.getGuildLands(guildId);
                        
                        if (!guildLands || guildLands.length === 0) {
                            await interaction.reply({ 
                                content: "📋 This guild has no registered land IDs to clear.", 
                                ...ephemeral 
                            });
                            return;
                        }
                        
                        const landCount = guildLands.length;
                        await sql.clearGuildLands(guildId);
                        
                        await interaction.reply({ 
                            content: `✅ All ${landCount} land ID${landCount === 1 ? '' : 's'} have been removed from this guild.`, 
                            ...ephemeral 
                        });
                        break;
                    }
                default:
                    await interaction.reply({ content: "Unknown subcommand", ...ephemeral });
                    break;
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "There was an error while managing land settings! Please contact support if this issue persists.", flags: 64 });
        }
    },
};
