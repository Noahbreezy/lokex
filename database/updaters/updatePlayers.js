const AccountInfo = require('../../general/accountInfo.js');
const R4Check = require("../../alliancemanager/r4check.js");

class UpdatePlayers {

    constructor(sqlInstance, api) {
        this.AccountInfo = new AccountInfo(sqlInstance, api);
        this.sql = sqlInstance;
        this.api = api;
        this.r4Check = new R4Check(sqlInstance, api);
    }

    // Get all the player kingdomIds in an alliance owned by a manager
    async getAllAllianceMemberId(token, allianceId) {

        const kingdomIds = [];

        try {
            const response = await this.api.request(
                'https://api-lok-live.leagueofkingdoms.com/api/alliance/members/list',
                { allianceId: allianceId },
                {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                }
            );
            const members = response.data.members;

            members.forEach(memberGroup => {
                memberGroup.members.forEach(member => {
                    kingdomIds.push(member.kingdomId);
                });
            });

            return kingdomIds;
        } catch (error) {
            console.error('Error fetching alliance members:', error);
            throw error;
        }
    }

    // updatePlayers logic
    async updatePlayers() {
        while (true) {
            try {
                const botAccounts = await this.sql.getManagerAccounts();
                const botAccountsFiltered = botAccounts.filter((account, index, self) =>
                    index === self.findIndex((t) => t.allianceId === account.allianceId)
                );
    
                for (const account of botAccountsFiltered) {
                    let token = account.token;
                    let r4Flag = false;
                    try {
                        const kingdomIds = await this.getAllAllianceMemberId(token, account.allianceId);
                        r4Flag = await this.r4Check.checkR4(token, account.kingdomId, account.allianceId);
                        
                        for (const kingdomId of kingdomIds) {
                            try {
                                const accountInfo = await this.AccountInfo.getMemberProfileInfo(token, account.allianceId, kingdomId, r4Flag);
                                if (accountInfo) {
                                    await this.sql.updateFullKingdomInfo(accountInfo);
                                }
                            } catch (error) {
                                token = (await this.sql.getManagerTokenByKingdomId(kingdomId))[0].token;
                                r4Flag = await this.r4Check.checkR4(token, kingdomId, account.allianceId);
                                console.error(`Error updating kingdom info for kingdomId ${kingdomId}:`, error);
                            }
                        }
                    } catch (error) {
                        token = (await this.sql.getManagerTokenByKingdomId(account.kingdomId))[0].token;
                        r4Flag = await this.r4Check.checkR4(token, account.kingdomId, account.allianceId);
                        console.error(`Error processing account with allianceId ${account.allianceId}:`, error);
                    }
                }
            } catch (error) {
                console.error('Error updating players:', error);
            }
    
            // Calculate milliseconds until the next 12:00 UTC
            const now = new Date();
            const nextNoonUTC = new Date(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                12, 0, 0, 0 // Today at 12:00 UTC
            );
    
            if (now >= nextNoonUTC) {
                // If it's already past 12:00 UTC today, schedule for tomorrow
                nextNoonUTC.setUTCDate(nextNoonUTC.getUTCDate() + 1);
            }
    
            const millisTillNoon = nextNoonUTC - now;
            console.log(`Waiting ${millisTillNoon} ms until 12:00 UTC...`);
    
            // Wait until 12:00 UTC
            await new Promise(resolve => setTimeout(resolve, millisTillNoon));
        }
    }    
}

module.exports = UpdatePlayers;

// example usage
async function example() {

}

/*
        const r4Flag = await this.r4Check.checkR4(token, kingdomId, allianceId);

        // if not R4, do not get locations
        if (!r4Flag) {
            console.log('Not R4: cannot get locations');
        }

        */