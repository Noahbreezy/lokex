
class SpeedCheck {
    constructor(sql, api) {
        this.sql = sql;
        this.api = api;
    }

    async treasureSpeedCheck(token, kingdomId) {
        const playerTreasuresData = (await this.api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/kingdom/treasure/list",
            { kingdomId: kingdomId },
            {
                "x-access-token": token,
                "Content-Type": "application/json",
            }
        )).data;

        const playerTreasures = playerTreasuresData.equipped;
        const treasureSpeeds = await this.sql.getTreasureSpeeds();

        // console.log(playerTreasures);

        let totalSpeed = 0;

        playerTreasures.forEach(treasure => {
            if (treasure.item && treasure.item.equipped) {
                const skillLevels = treasure.item.skillLevel;
                const level5Skills = skillLevels.filter(level => level === 5).length;
                const skillCode = skillLevels.join('') + level5Skills;
                const treasureCode = treasure.item.code.toString();

                // console.log(treasureCode);
                // console.log(skillCode);

                let bonusSpeeds = [];
                let normalSpeeds = [];

                treasureSpeeds.forEach(speed => {
                    if (speed.treasureCode == treasureCode) {
                        const speedCode = speed.speedCode;
                        // console.log(speedCode);
                        let match = true;
                        for (let i = 0; i < speedCode.length - 1; i++) {
                            if (speedCode[i] !== '#' && speedCode[i] !== skillCode[i]) {
                                match = false;
                                break;
                            }
                        }
                        if (match) {
                            // Use a regular expression to check if speedCode ends with a number after 5 hashtags
                            const bonusSpeedPattern = /#####\d$/;
                            if (bonusSpeedPattern.test(speedCode)) {
                                // It's a bonus speed if it matches the pattern
                                bonusSpeeds.push(speed.speed);
                            } else {
                                // Otherwise, it's a normal speed
                                normalSpeeds.push(speed.speed);
                            }
                            // console.log('added: ', speedCode);
                        }
                    }
                });

                // console.log(`Normal Speeds: ${normalSpeeds}`);
                // console.log(`Bonus Speeds: ${bonusSpeeds}`);

                // Add all bonus speeds to totalSpeed
                bonusSpeeds.forEach(speed => totalSpeed += speed);

                // Add the highest normal speed, if any
                if (normalSpeeds.length > 0) {
                    totalSpeed += Math.max(...normalSpeeds);
                }
            }
        });

        console.log(`Total Speed: ${totalSpeed}`);
        return totalSpeed;
    }
}

module.exports = SpeedCheck;

// example
async function runExample() {
    try {
        const test = await new SpeedCheck().treasureSpeedCheck(
            `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2NjdkYzUyMjQ0NDViZDc2NDQ2Y2NiZmYiLCJraW5nZG9tSWQiOiI2NjdkYzUyODVjZTVlNjBiMzQ5ZjczNDYiLCJ3b3JsZElkIjo2NiwidmVyc2lvbiI6MTc3NSwiYXV0aFR5cGUiOiJlbWFpbCIsInBsYXRmb3JtIjoid2ViIiwidGltZSI6MTcxOTUxODYxNTAzOSwiY2xpZW50WG9yIjoiMCIsImlwIjoiMTg1LjI0NS4yNTUuMzIiLCJpYXQiOjE3MTk1MTg2MTUsImV4cCI6MTcyMDEyMzQxNSwiaXNzIjoibm9kZ2FtZXMuY29tIiwic3ViIjoidXNlckluZm8ifQ.1VjtMHPnYQTEbWc466-qBpY0Xh97nVEsFKN7df2Ijco`,
            "61e03ddc36bf55230bec4424"
        );
    } catch (error) {
        console.error(error);
    }
}

// runExample();