const Scanner = require('./scanner.js');
const sqlFunctions = require('../database/sql.js');
const Api = require("../general/api.js");

// Create a MySQL connection
const sql = new sqlFunctions();
const api = new Api(sql);

// function to start all the alliance manager instances
async function manageScanners() {

    const scannerContinents = await sql.getGuildContinentWithSubscription("5");
    const xorPassword = (await sql.getXORPass())[0].value;
    console.log(xorPassword);

    for (const continent of scannerContinents) {

        console.log("continent: ", continent)
        const scannerBotInfo = await sql.getScannerTokens(continent.guild_id);
        console.log("scannerBotInfo: ", scannerBotInfo);

        if (scannerBotInfo.length === 0) {
            console.error("No scanner bot token found for guild: " + continent.guild_id);
            continue;
        }

        const options = {
            token: scannerBotInfo[0].token,
            xorPassword: xorPassword,
            guildId: continent.guild_id,
            continent: continent.continent,
        };

        // console.log(options);

        new Scanner(options, sql, api);

        console.log("Started scanner instance for " + continent.continent + " guild: " + continent.guild_id);
    }
}

manageScanners();

process.on('exit', () => {
    sql.closeConnection();
});

process.on('SIGINT', () => {
    process.exit();
});

process.on('SIGTERM', () => {
    process.exit();
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});