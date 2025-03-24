class R4Check {
    constructor(sql, api) {
        this.api = api;
        this.sql = sql;
    }

    async checkR4(token, kingdomId, allianceId) {
        let allianceMembers;
        let allianceRequestStatus;
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

            if (allianceMembers?.result === false) {
                console.log("No alliance members found!");
                return false;
            }

            // console.log("Alliance members:", allianceMembers);
            const filteredMembers = allianceMembers.members.filter(member => member._id === 99 || member._id === 4);
            const allianceR4s = filteredMembers.flatMap(member => member.members);
            const allianceR4sIds = allianceR4s.map(member => member.kingdomId);
            if (allianceR4sIds.includes(kingdomId)) {
                return true;
            } else {
                console.log("R4 not found!");
                return false;
            }
        } catch (error) {
            console.log(allianceMembers);
            if(allianceRequestStatus !== 200 || allianceMembers?.err) {
                token = await this.sql.getManagerToken(allianceId);
                console.error("Error checking R4, need to check again:", error);
                setTimeout(() => {
                    this.checkR4(token, kingdomId, allianceId);
                }, 30000);
            }
            console.error("Error checking R4, probably not R4:", error);
            return false;
        }
    }
}

module.exports = R4Check;