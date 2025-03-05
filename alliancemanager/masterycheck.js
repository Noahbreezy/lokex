require('dotenv').config();

class MasteryCheck {

    constructor(sql, api) {
        this.sql = sql;
        this.api = api;

        this.masteries = [
            { name: "infantry", value: "11" },
            { name: "ranged", value: "12" },
            { name: "cavalry", value: "13" },
            { name: "combat", value: "14" },
            { name: "monster", value: "15" },
            { name: "governor", value: "16" },
        ];
    }


    async checkMastery(token, kingdomId, allianceId) {
        
        const mastery = (await this.sql.getMasterySettings(allianceId))[0];

        const playerMasteryResponse = await this.api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/lord/mastery/dashboard",
            { kingdomId: kingdomId },
            {
                "x-access-token": token,
                "Content-Type": "application/json",
            }
        );
        const playerMastery = playerMasteryResponse.data.dashboard.groups;

        // console.log("Player's mastery: ", playerMastery);
        // console.log("Required mastery: ", mastery);

        // Create a map for player's mastery points
        const playerMasteryMap = {};
        for (const masteryItem of playerMastery) {
            playerMasteryMap[masteryItem.group] = masteryItem.numPoint;
        }

        for (const masteryType of this.masteries) {
            const requiredValue = mastery[masteryType.name];
            const playerValue = playerMasteryMap[masteryType.value] || 0;

            if (playerValue < requiredValue) {
                return false;
            }
        }

        return true;
    }
}

module.exports = MasteryCheck;

//example
async function runExample() {
    const connection = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

    connection.connect(function (err) {
        if (err) throw err;
        console.log("Connected!");
    });

    const masteryCheck = new MasteryCheck(connection);
    const result = await masteryCheck.checkMastery(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjMiLCJraW5nZG9tSWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjQiLCJ3b3JsZElkIjoyNCwidmVyc2lvbiI6MTc3NSwiYXV0aFR5cGUiOiJnb29nbGUiLCJwbGF0Zm9ybSI6IndlYiIsInRpbWUiOjE3MjAyMDgzOTIzMjQsImNsaWVudFhvciI6IjAiLCJpcCI6IjEwOS4xMzYuMjQwLjEzIiwiaWF0IjoxNzIwMjA4MzkyLCJleHAiOjE3MjA4MTMxOTIsImlzcyI6Im5vZGdhbWVzLmNvbSIsInN1YiI6InVzZXJJbmZvIn0.XfSY4cjBdPccxZ9vmFG5S0F2bGHeDQpQ5kvP42Jn3vA",
        "61e03ddc36bf55230bec4424",
        "LGN1"
    );

    console.log("Mastery check result: ", result);
}

// runExample();
