const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
var mysql = require("mysql");
var players = [];
const axios = require("axios");
const FormData = require("form-data");
var con = mysql.createConnection({
    host: ***REMOVED***,
    user: ***REMOVED***,
    password: ***REMOVED***,
    database: "c24",
});

con.connect(function (err) {
    if (err) throw err;
    console.log("Connected! v1");
 
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName("buff")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDescription("Start a buff timer")
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription("User's name")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption((option) =>
            option
                .setName("buff")
                .setDescription("Buff Type")
                .setRequired(true)
                .addChoices({ name: "Attack", value: "atk" }, { name: "Defence", value: "def" }, { name: "HP", value: "hp" }, { name: "Speed", value: "spd" }, { name: "Infantry", value: "inf" }, { name: "Archery", value: "arc" }, { name: "Cavalry", value: "cavalry" })
        )
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("Buff Level")
                .setRequired(true)
                .addChoices(
                    { name: "Level 1", value: "1" },
                    { name: "Level 2", value: "2" },
                    { name: "Level 3", value: "3" },
                )
        )
    ,
    async autocomplete(interaction) {

        var sql =
            "SELECT distinct name,kingdomid FROM info order by name asc";
        con.query(sql, async function (err, result, fields) {
            var players = []
            if (err) throw err;
            if (result.length == 0) return;

            for (var i = 0; i < result.length; i++) {
                var name = result[i]["name"];
                var id = result[i]["kingdomid"];
                players.push({ name, id });
            }

            const focusedValue = interaction.options.getFocused();
            const filtered = players
                .filter((choice) =>
                    choice.name.toLowerCase().includes(focusedValue.toLowerCase())
                )
                .slice(0, 10);

            await interaction.respond(
                filtered.map((choice) => ({ name: choice.name, value: choice.id }))
            );
        });
    },
    async execute(interaction) {
        const userid = interaction.options.getString("name");
        var sql =
            "SELECT distinct name,kingdomid FROM info where kingdomid=? order by date desc limit 1";
        con.query(sql, [userid], async function (err, result, fields) {
            const user = result[0].name;
            const name = interaction.options.getString("buff");
            const level = interaction.options.getString("level");
            var bonus = level == 1 ? "5%" : "10%";
            var duration = "1H"
            var datenow = new Date();
            datenow.setHours(datenow.getHours() + 1)
            if (user) {
            } else {
                return interaction.reply({
                    content: `You need to specify an user`,
                    ephemeral: true,
                });
            }
            var sql = "INSERT INTO buffplayer (  end,  discordid,  endname, name, duration, bonus,level,kingdomid, notify) VALUES (?,?,?,?,?,?,?,?,1)";
            con.query(
                sql,
                [datenow, interaction.user.id, user, name, duration, bonus, level, userid],
                function (err, result) {
                    if (err) {
                        console.log(err)
                        throw err;
                    }

                    output = `${user} started the Lv. ${level} ${name} buff (${bonus}) at <t:${(new Date().getTime() / 1000).toFixed(0)}:f> (<t:${(new Date().getTime() / 1000).toFixed(0)}:R>) for ${duration} and expires at <t:${(datenow.getTime() / 1000).toFixed(0)}:f> (<t:${(datenow.getTime() / 1000).toFixed(0)}:R>)`;

                    interaction.client.channels.cache
                        .get("1261584258267611168")
                        .send(output);
                    return interaction.reply({
                        content: `Buff timer started successfully`,
                        ephemeral: true,
                    })
                }

            );
        });
    },
};
