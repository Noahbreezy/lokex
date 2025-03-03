const AllianceInfo = require('../general/allianceInfo');

class UpdateAlliances {
    constructor(sqlInstance) {
        this.sql = sqlInstance;
    }

    async updateAlliancesInfo() {
        const accountsAlliances = await this.sql.getAccountsAlliances();
        const alliances = await this.sql.getAlliances();

        const accountsAllianceIds = accountsAlliances.map(alliance => alliance.allianceid);
        const allianceIds = alliances.map(alliance => alliance.allianceid);

        console.log(allianceIds);
        console.log(accountsAllianceIds);

        for (const alliance of allianceIds) {
            if (!accountsAllianceIds.includes(alliance)) {
                // Alliance is in the list of accountsAllianceIds
                
                accountsAllianceIds.push(alliance);
            } else {
                // Alliance is not in the list of accountsAllianceIds
            }
        }
    }
}


/*
1. Get alliances where managers are and all alliances info entries.
2. Check if the alliance is in the allianceinf table.
3. If not, add it to the table with default settings and guildId of the manager.
4. If the alliance is in the table but no manager is in that alliance, remove the active status flag.
5. If the alliance is in the database or not, update the alliance info in any case. (possibly the name and tag)
6. Repeat every 5 minutes.
*/

module.exports = UpdateAlliances;

async function runExample() {
    
    const sqlFunctions = require('../database/sql');
    const sqlInstance = new sqlFunctions();

    const updateAlliances = new UpdateAlliances(sqlInstance);
    await updateAlliances.updateAlliancesInfo();
}

//runExample().then(() => process.exit(0));