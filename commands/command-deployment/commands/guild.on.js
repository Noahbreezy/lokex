const { SlashCommandBuilder, PermissionFlagsBits, Options } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("guild")
        .setDescription("Manage guilds settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("verified-role")
                .setDescription("role to be assigned to verified members")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("Role to be assigned to verified members")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("accept-log-channel")
                .setDescription("channel to log accepted members and more")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log accepted members and more")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("reject-log-channel")
                .setDescription("channel to log rejected members and more")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log rejected members and more")
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const { commandName, options, guildId, user } = interaction;
        const userId = user.id;
        const guildName = interaction.guild.name;
        const userName = user.username;

        console.log(`Command: ${commandName}, Subcommand: ${options.getSubcommand()}, Guild: ${guildName}, User: ${userName}`);

        try {
            switch (options.getSubcommand()) {
                case "verified-role":
                    {
                        const role = options.getRole("role");
                        const roleId = role.id;
                        const roleName = role.name;
                        await sql.setGuildVerificationRole(roleId, guildId);
                        await interaction.reply({ content: `Role ${roleName} has been set as the verified role.`, ephemeral: true });
                        break;
                    }
                case "accept-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildAcceptLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the accept log channel.`, ephemeral: true });
                        break;
                    }
                case "reject-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildRejectLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the reject log channel.`, ephemeral: true });
                        break;
                    }
                default:
                    await interaction.editReply({ content: "Unknown subcommand", ephemeral: true });
                    break;
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "There was an error while changing guild settings!", ephemeral: true });
        }
    },
};