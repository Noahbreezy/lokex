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
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("hide-answers")
                .setDescription("Hide the bot's answers to commands")
                .addBooleanOption((option) =>
                    option
                        .setName("hidden")
                        .setDescription("True = hides bot answers")
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const { commandName, options, guildId, user } = interaction;
        const userId = user.id;
        const guildName = interaction.guild.name;
        const userName = user.username;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? {flags:64} : {};


        console.log(`Command: ${commandName}, Subcommand: ${options.getSubcommand()}, Guild: ${guildName}, User: ${userName}`);

        try {
            const guildExistsFlag = await sql.guildExists(guildId);
            if (!guildExistsFlag) {
                await sql.addGuild(guildId, guildName);
            }
            switch (options.getSubcommand()) {
                case "verified-role":
                    {
                        const role = options.getRole("role");
                        const roleId = role.id;
                        const roleName = role.name;
                        await sql.setGuildVerificationRole(roleId, guildId);
                        await interaction.reply({ content: `Role ${roleName} has been set as the verified role.`, ...ephemeral });
                        break;
                    }
                case "accept-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildAcceptLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the accept log channel.`, ...ephemeral });
                        break;
                    }
                case "reject-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildRejectLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the reject log channel.`, ...ephemeral });
                        break;
                    }
                case "hide-answers":
                    {
                        const hidden = options.getBoolean("hidden");
                        await sql.setEphemeral(hidden, guildId);
                        if(hidden) {
                            await interaction.reply({ content: `Bot answers are now hidden.`, flags : 64 });
                        }
                        else {
                            await interaction.reply({ content: `Bot answers are now visible.` });
                        }
                        break;
                    }
                default:
                    await interaction.editReply({ content: "Unknown subcommand", ...ephemeral });
                    break;
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "There was an error while changing guild settings! If this is the first time using the /guild command it's normal. It should work if you try again.", ephemeral: true });
        }
    },
};