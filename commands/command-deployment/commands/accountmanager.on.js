const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const AccountInfo = require("../../../general/accountInfo.js");
const R4Check = require("../../../alliancemanager/r4check.js");

async function handleNameAutocomplete(interaction, sql) {
    const focusedValue = interaction.options.getFocused();
    const guild = interaction.guild.id;
    const names = await sql.getBotNamesFromGuild(focusedValue, guild);
    await interaction.respond(
        names.map(nameObj => ({ name: nameObj.name, value: nameObj.kingdomId }))
    );
}

async function handleRoleAutocomplete(interaction, sql) {
    const focusedValue = interaction.options.getFocused();
    const roles = await sql.getRoles();
    const filtered = roles.filter(role => role.toLowerCase().includes(focusedValue.toLowerCase()));
    await interaction.respond(
        filtered.map(role => ({ name: role, value: role }))
    );
}

async function addAlliance(kingdomId, sql, r4Check) {
    const managerInfo = (await sql.getManagerInfoByKingdomId(kingdomId))[0];
    const allianceId = managerInfo.allianceId;
    const token = managerInfo.token;
    const guildId = managerInfo.guild;
    const allianceTag = managerInfo.allianceTag;
    // console.log(managerInfo);
    const r4Flag = await r4Check.checkR4(token, kingdomId, allianceId);
    const allianceExistsFlag = await sql.allianceExists(allianceId);
    if (r4Flag && !allianceExistsFlag) {
        await sql.addAllianceSettings(allianceId, allianceTag, guildId);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("account")
        .setDescription("Manage accounts")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add an account")
                .addStringOption((option) =>
                    option
                        .setName("email")
                        .setDescription("Email")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("password")
                        .setDescription("Password")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove an account")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("Account name")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("editrole")
                .setDescription("Edit an account role")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("Account name")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("role")
                        .setDescription("Account Role")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const accountInfo = new AccountInfo(sql, api);
        const r4Check = new R4Check(sql, api);
        const { commandName, options, guildId, user } = interaction;
        const userId = user.id;
        const guildName = interaction.guild.name;
        const userName = user.username;

        console.log(`Command: ${commandName}, Subcommand: ${options.getSubcommand()}, Guild: ${guildName}, User: ${userName}`);

        try {
            await interaction.deferReply({ flags: 64  });
            switch (options.getSubcommand()) {
                case "add":
                    {
                        const existingAccount = await sql.getAccountByEmail(options.getString("email"));
                        if (existingAccount.length > 0) {
                            await interaction.editReply({ content: "An account with this email already exists.", flags: 64 });
                            break;
                        }
                        const info = await accountInfo.collectInfo(options.getString("email"), options.getString("password"));
                        if (info) {
                            await sql.addAccount(info.name, info.email, info.password, info.token, info.kingdomId, info.allianceid, info.alliancetag, guildId, userId);
                            await interaction.editReply({ content: "Account added!", flags: 64 });
                        } else {
                            console.log("Couldn't get account info");
                            await interaction.editReply({ content: "Couldn't get account info", flags: 64 });
                        }
                    }
                    break;
                case "remove":
                    {
                        const kingdomId = options.getString("name");
                        console.log(kingdomId);
                        await sql.removeAccount(kingdomId, guildId);
                        await interaction.editReply({ content: "Account removed!", flags: 64 });
                    }
                    break;
                case "editrole":
                    {
                        const kingdomId = options.getString("name");
                        const name = (await sql.getBotNameByKingdomId(kingdomId))[0].name;
                        console.log(name);
                        const role = options.getString("role");
                        console.log(role);
                        await sql.editRole(kingdomId, role, guildId);
                        await interaction.editReply({ content: `Role of ${name} edited to ${role}!`, flags: 64 });
                        if (role === "MANAGER") {
                            addAlliance(kingdomId, sql, r4Check);
                        }
                    }
                    break;
                default:
                    await interaction.editReply({ content: "Unknown subcommand", flags: 64 });
                    break;
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: "An error occurred while executing the command.", flags: 64 });
        }
    },
    async autocomplete(interaction) {
        const sql = module.exports.sql;
        try {
            switch (interaction.options.getSubcommand()) {
                case "remove":
                    {
                        if (interaction.options.getFocused(true).name === "name") {
                            await handleNameAutocomplete(interaction, sql);
                        }
                    }
                    break;
                case "editrole":
                    {
                        if (interaction.options.getFocused(true).name === "name") {
                            await handleNameAutocomplete(interaction, sql);
                        } else if (interaction.options.getFocused(true).name === "role") {
                            await handleRoleAutocomplete(interaction, sql);
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