const AllianceManager = require('./alliancemanager.js');
const sqlFunctions = require('../database/sql.js');

// Create a MySQL connection
const sql = new sqlFunctions();
const runningAlliances = new Set();

// function to start all the alliance manager instances
async function manageAlliances() {
    while (true) {
        // Query to get bot info
        const botManagerInfo = await sql.getManagerAccounts();
        // console.log(botManagerInfo);
        // console.log("Retrieved bots info. Checking for new alliance manager instances...");

        for (const botInfo of botManagerInfo) {
            if (!runningAlliances.has(botInfo.allianceId)) {
                const allianceSettings = (await sql.getAllianceSettings(botInfo.allianceId))[0];
                console.log(`Retrieved settings for ${botInfo.allianceTag}...`);
                // console.log(allianceSettings);

                if (allianceSettings === undefined || allianceSettings.length === 0) {
                    console.log(`No settings found for ${botInfo.allianceTag}. Skipping...`);
                    continue;
                }

                const options = {
                    token: botInfo.token,
                    settings: {
                        managerId: botInfo.kingdomId,
                        allianceId: botInfo.allianceId,
                        allianceTag: botInfo.allianceTag,
                        power: allianceSettings.power,
                        kills: allianceSettings.kills,
                        speed: allianceSettings.speed,
                        mastery: {
                            combat: allianceSettings.combat,
                            monster: allianceSettings.monster,
                            infantry: allianceSettings.infantry,
                            cavalry: allianceSettings.cavalry,
                            archers: allianceSettings.ranged,
                            governor: allianceSettings.governor,
                        },
                        verification: allianceSettings.verified === 1 ? true : false,
                        interval: allianceSettings.interval < 30 ? 30 : allianceSettings.interval,
                        accept: allianceSettings.accept === 1 ? true : false,
                        kick: allianceSettings.kick === 1 ? true : false
                    }
                };

                // console.log(options);

                new AllianceManager(options, sql, runningAlliances);
                // console.log("before: ",runningAlliances);
                runningAlliances.add(botInfo.allianceId);
                console.log("Started alliance manager instance for " + botInfo.allianceTag);
            }
            // console.log("after: ",runningAlliances);
        }

        // Wait for a specified interval before checking again
        await new Promise(resolve => setTimeout(resolve, 5 * 1000)); // x seconds delay
    }
}

manageAlliances();

process.on('exit', () => {
    sql.close();
});

process.on('SIGINT', () => {
    sql.close();
    process.exit();
});

process.on('SIGTERM', () => {
    sql.close();
    process.exit();
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    sql.close();
    process.exit(1);
});