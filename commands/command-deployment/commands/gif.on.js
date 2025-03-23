const { SlashCommandBuilder, Events, ActionRowBuilder, ModalBuilder, ButtonStyle, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gif")
        .setDescription("Adding a gif to the pool of gifs")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a gif to the pool")
                .addStringOption(option =>
                    option.setName("message")
                        .setDescription("For which message is the GIF?")
                        .setRequired(true)
                        .addChoices(
                            { name: "Gathering", value: "101" },
                            { name: "Healing", value: "102" },
                            { name: "Training", value: "103" },
                            { name: "Crystal", value: "104" }
                        )
                )
                .addStringOption(option =>
                    option.setName("gif")
                        .setDescription("The gif URL")
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a gif from the pool")
                .addStringOption(option =>
                    option.setName("gif")
                        .setDescription("The gif URL")
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const { commandName, options } = interaction;

        switch (options.getSubcommand()) {
            case "add":
                try {
                    await sql.insertNewGif(options.getString("gif"), options.getString("message"), interaction.guild.id);
                    await interaction.reply({ content: 'Gif added to the pool!', ephemeral: true });
                } catch (error) {
                    console.error('Error while adding gif to the pool:', error);
                    await interaction.reply('Error while adding gif to the pool!');
                }
                break;
            case 'remove':
                try {
                    await sql.deleteGif(options.getString("gif"));
                    await interaction.reply('Gif removed from the pool!');
                } catch (error) {
                    console.error('Error while removing gif from the pool:', error);
                    await interaction.reply('Error while removing gif from the pool!');
                }
                break;
        }
    }
};