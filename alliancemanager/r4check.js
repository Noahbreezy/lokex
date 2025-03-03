
class R4Check {
    constructor(sql, api) {
        this.api = api;
        this.sql = sql;
    }

    async checkR4(token, kingdomId, allianceId) {
        try {
            const allianceMembers = (await this.api.request(
                "https://api-lok-live.leagueofkingdoms.com/api/alliance/members/list",
                { allianceId: allianceId },
                {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                }
            )).data;

            // console.log("Alliance members:", allianceMembers);
            const allianceR4s = [...allianceMembers.members[0].members, ...allianceMembers.members[1].members];
            const allianceR4sIds = allianceR4s.map(member => member.kingdomId);
            if (allianceR4sIds.includes(kingdomId)) {
                return true;
            } else {
                console.log("R4 not found!");
                return false;
            }
        } catch (error) {
            console.error("Error checking R4, probably not R4:", error);
            return false;
        }
    }
}

module.exports = R4Check;