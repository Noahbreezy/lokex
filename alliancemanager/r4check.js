class R4Check {
    constructor(sql, api) {
        this.api = api;
        this.sql = sql;
    }

    async checkR4(token, kingdomId, allianceId, retries = 40, delay = 30000) { // delay in milliseconds
        let allianceMembers;
        let allianceRequestStatus;
        let reloadedToken;
        try {
            allianceMembers = (await this.api.request(
                "https://api-lok-live.leagueofkingdoms.com/api/alliance/members/list",
                { allianceId: allianceId },
                {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                }
            ));
            allianceRequestStatus = allianceMembers.status;
            allianceMembers = allianceMembers.data;

            if (allianceMembers?.err?.code === "no_auth" && retries > 0) {
                console.log(allianceMembers);
                console.log(`No authorization, fetching new token... Retries left: ${retries}`);
                reloadedToken = (await this.sql.getManagerToken(allianceId))[0]?.token;
                console.log("Reloaded token:", reloadedToken);
                await new Promise(resolve => setTimeout(resolve, delay));
                console.log(reloadedToken, kingdomId, allianceId, retries - 1, delay);
                return this.checkR4(reloadedToken, kingdomId, allianceId, retries - 1, delay);
            } else if (allianceMembers?.result === false) {
                console.log(allianceMembers);
                console.log("No alliance members found!");
                console.log("returning false for", allianceId);
                return false;
            }

            const filteredMembers = allianceMembers.members.filter(member => member._id === 99 || member._id === 4);
            const allianceR4s = filteredMembers.flatMap(member => member.members);
            const allianceR4sIds = allianceR4s.map(member => member.kingdomId);
            if (allianceR4sIds.includes(kingdomId)) {
                return true;
            } else {
                console.log("returning false for", allianceId);
                console.log("R4 not found!");
                return false;
            }
        } catch (error) {
            console.log(allianceRequestStatus, error?.response?.status, allianceMembers?.data?.err?.code);
            if (error?.response?.status >= 400 && retries > 0) {
                console.log("Retrying checkR4 for", allianceId, "Retries left:", retries - 1);
                reloadedToken = (await this.sql.getManagerToken(allianceId))[0]?.token;
                
                // Introduce a delay before retrying
                await new Promise(resolve => setTimeout(resolve, delay));

                return this.checkR4(reloadedToken, kingdomId, allianceId, retries - 1, delay);
            } else {
                console.log("returning false for", allianceId);
                console.error("Error checking R4, probably not R4 or retries exhausted:", error);
                return false;
            }
        }
    }
}

module.exports = R4Check;