const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("scanner")
        .setDescription("Manage scanner settings")
        .addSubcommand(subcommand =>
            subcommand
                .setName("freedays")
                .setDescription("Set scanner free days (no reporting)")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("minlevel")
                .setDescription("Set minimum CMine and DSA level for reporting")
                .addIntegerOption(option =>
                    option.setName("cmine_lvl")
                        .setDescription("Minimum CMine level (1-5)")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(5)
                )
                .addIntegerOption(option =>
                    option.setName("dsa_lvl")
                        .setDescription("Minimum DSA level (1-5)")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(5)
                )
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        // Check subscription (scanner = 5)
        const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "5");
        if (!subscriptionFlagInfo) {
            await interaction.reply({ content: "Your continent needs to have a valid scanner subscription to use this command.", flags: 64 });
            return;
        }

        switch (subcommand) {
            case "freedays": {
                // Show a select menu for days of the week, including 'None'
                const { StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");
                const dayOptions = [
                    { label: "None (No free days)", value: "0", description: "Scanner will report every day" },
                    { label: "Monday", value: "1" },
                    { label: "Tuesday", value: "2" },
                    { label: "Wednesday", value: "3" },
                    { label: "Thursday", value: "4" },
                    { label: "Friday", value: "5" },
                    { label: "Saturday", value: "6" },
                    { label: "Sunday", value: "7" }
                ];
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId("scanner_freedays_select")
                    .setPlaceholder("Select one or more free days")
                    .setMinValues(1)
                    .setMaxValues(7)
                    .addOptions(dayOptions);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                const embed = new EmbedBuilder()
                    .setTitle("Select Free Days")
                    .setDescription("Choose which days the scanner should NOT report. Select 'None' for no free days.")
                    .setColor("Blue");
                await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
                break;
            }
            case "minlevel": {
                const cmine_lvl = interaction.options.getInteger("cmine_lvl");
                const dsa_lvl = interaction.options.getInteger("dsa_lvl");
                if (cmine_lvl < 1 || cmine_lvl > 5 || dsa_lvl < 1 || dsa_lvl > 5) {
                    await interaction.reply({ content: "Levels must be between 1 and 5.", flags: 64 });
                    return;
                }
                await sql.setCmineAndDsaLevels(guildId, cmine_lvl, dsa_lvl);
                await interaction.reply({ content: `Scanner minimum levels updated: CMine Lv.${cmine_lvl}, DSA Lv.${dsa_lvl}`, flags: 64 });
                break;
            }
            default:
                await interaction.reply({ content: "Unknown subcommand.", flags: 64 });
        }
    },
    // No autocomplete needed for freedays, handled by select menu
    async stringselect(interaction) {
        // Handle the freedays select menu
        if (interaction.customId === "scanner_freedays_select") {
            const sql = module.exports.sql;
            const guildId = interaction.guild.id;
            let selected = interaction.values;
            // If "0" (None) is selected, ignore all others
            if (selected.includes("0")) selected = ["0"];
            // Save to DB ("0" means no free days, store as 0 integer)
            const freeDays = selected.includes("0") ? 0 : parseInt(selected.sort().join(""), 10);
            await sql.setFreeDays(guildId, freeDays);
            const dayNames = {
                "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday", "7": "Sunday"
            };
            const replyText = selected.includes("0")
                ? "No free days set. Scanner will report every day."
                : `Scanner free days updated to: ${selected.sort().map(d => dayNames[d]).join(", ")}`;
            await interaction.update({ content: replyText, embeds: [], components: [], flags: 64 });
        }
    },
};

function weekDayName(num) {
    switch (num.toString()) {
        case "1": return "Monday";
        case "2": return "Tuesday";
        case "3": return "Wednesday";
        case "4": return "Thursday";
        case "5": return "Friday";
        case "6": return "Saturday";
        case "7": return "Sunday";
        default: return num;
    }
}
