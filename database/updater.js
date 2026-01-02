const UpdatePlayers = require('./updaters/updatePlayers.js');
const UpdateBots = require('./updaters/updateBots.js');
const sqlFunctions = require('./sql.js');
const Api = require('../general/api.js');
const UpdateVerified = require('./updaters/updateVerified.js');
const UpdateStakers = require('./updaters/updateStakers.js');
const UpdateBuffs = require('./updaters/updateBuffs.js');
const UpdateReminders = require('./updaters/updateReminders.js');
const UpdateWhitelistReminders = require('./updaters/updateWhitelistReminders.js');
const UpdateAnnouncements = require('./updaters/updateAnnouncement.js');
const UpdateTransactions = require('./updaters/updateTransactions.js');
const UpdateLandPoints = require('./updaters/updateLandPoints.js');
const UpdateRalliesPoints = require('./updaters/updateRalliesPoints.js');
const UpdateMedals = require('./updaters/updateMedals.js');
const UpdateBooster = require('./updaters/updateBooster.js');

const sql = new sqlFunctions();
const api = new Api(sql);
const updatePlayers = new UpdatePlayers(sql, api);
const updateBots = new UpdateBots(sql, api);
const updateVerified = new UpdateVerified(sql);
const updateStakers = new UpdateStakers(sql, api);
const updateBuffs = new UpdateBuffs(sql, api);
const updateReminders = new UpdateReminders(sql);
const updateWhitelistReminders = new UpdateWhitelistReminders(sql);
const updateAnnouncements = new UpdateAnnouncements(sql, api);
const updateTransactions = new UpdateTransactions(sql, api);
const updateLandPoints = new UpdateLandPoints(sql, api);
const updateRalliesPoints = new UpdateRalliesPoints(sql, api);
const updateMedals = new UpdateMedals(sql, api);
const updateBooster = new UpdateBooster(sql, api);

async function startUpdaters() {
    updateBots.updateBotsToken(); // Midnight utc
    updateBots.updateBotsInfo(); // Every 10 minutes
    await new Promise(resolve => setTimeout(resolve, 360000)); // wait 6 minutes
    updatePlayers.updatePlayers(); // Noon utc
    updateVerified.updateVerified(); // Midnight utc
    updateStakers.runStakeUpdate(); // Every 5 minutes
    updateStakers.runCommentsUpdate(); // Every 2 days at 2am utc
    updateBuffs.runBuffCheck(); // Every 1 minutes
    updateReminders.runSubscriptionReminder(); // Every day at 8am utc
    updateAnnouncements.start(); // Runs continuously, listening for Discord messages
    updateTransactions.start(); // Runs continuously, monitoring DST transactions
    updateLandPoints.runLandPointsDistribution(); // Daily at 1am utc
    updateRalliesPoints.runRalliesPointsDistribution(); // Daily at 2am utc
    updateWhitelistReminders.runWhitelistReminder(); // Every day at 8am utc
    updateMedals.start(); // Daily at 9am utc
    updateBooster.start(); // Daily at 11:50pm utc
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