const Scanner = require('./scanner.js');
const sqlFunctions = require('../database/sql.js');
const Api = require("../general/api.js");

// Create a MySQL connection
const sql = new sqlFunctions();
const api = new Api(sql);



// function to start all the scanner instances based on subscription and status, and keep checking every 5 seconds
async function manageScanners() {
    const xorPassword = (await sql.getXORPass())[0].value;
    await sql.resetAllScannerStatuses(); // Reset all scanners status to 0
    while (true) {
        try {
            const scannerContinents = await sql.getGuildContinentWithSubscription("5");

            for (const continent of scannerContinents) {
                const guildId = continent.guild_id;
                const continentName = continent.continent;

                // Get scanner settings for this guild
                let scannerSettings = await sql.getScannerSettings(guildId);

                // If no settings entry exists, create one
                if (!scannerSettings) {
                    await sql.addScannerSettings(guildId);
                    scannerSettings = await sql.getScannerSettings(guildId);
                    console.log(`Created scanner_settings entry for guild: ${guildId}`);
                }

                // If status is 0, try to start scanner
                if (scannerSettings.status === 0) {
                    const scannerBotInfo = await sql.getScannerTokens(guildId);
                    if (!scannerBotInfo || scannerBotInfo.length === 0) {
                        console.error(`No scanner bot token found for guild: ${guildId}`);
                        continue;
                    }

                    const options = {
                        token: scannerBotInfo[0].token,
                        xorPassword: xorPassword,
                        guildId: guildId,
                        continent: continentName,
                    };

                    new Scanner(options, sql, api);
                    // Set scanner status to 1 after starting
                    await sql.setScannerStatus(guildId, 1);
                    console.log(`Started scanner instance for ${continentName} guild: ${guildId} and set status to 1`);
                } else {
                    // Optionally log only if you want to see repeated logs
                    // console.log(`Scanner already running for ${continentName} guild: ${guildId}`);
                }
            }
        } catch (err) {
            console.error('Error in manageScanners loop:', err);
        }
        // Wait 30 minutes before next check
        await sql.clearOldMines(); // Clear old mines every 30 minutes
        await new Promise(resolve => setTimeout(resolve, 30 * 60 * 1000)); // 30 minutes
        // await new Promise(resolve => setTimeout(resolve, 5000));
    
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