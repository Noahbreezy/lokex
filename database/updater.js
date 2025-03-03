const UpdatePlayers = require('./updaters/updatePlayers.js');
const UpdateBots = require('./updaters/updateBots.js');
const sqlFunctions = require('./sql.js');
const Api = require('../general/api.js');

const sql = new sqlFunctions();
const api = new Api(sql);
const updatePlayers = new UpdatePlayers(sql, api);
const updateBots = new UpdateBots(sql, api);

async function startUpdaters() {
    updatePlayers.updatePlayers()
    updateBots.updateBotsToken();
    updateBots.updateBotsInfo();
}

startUpdaters();

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