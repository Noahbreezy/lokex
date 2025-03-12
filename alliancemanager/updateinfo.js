const mysql = require('mysql2');
const Encryption = require('../encryption/encryption.js')
require('dotenv').config();

class UpdateInfo {
    constructor(sql, api) {
        this.sql = sql;
        this.api = api;
        this.enc = new Encryption();
    }

    async updateInfo(token, kingdomId, allianceId, allianceTag) {

        const xor_password = (await this.sql.getXORPass())[0].value;
        console.log('XOR Password: ', xor_password);

        const encryptedKingdomId = await this.enc.decryptXor(`{"kingdomId":"${kingdomId}"}`, xor_password);
        const b64EncryptedKingdomId = await this.enc.encryptBase64(encryptedKingdomId);

        let basicPlayerInfoResponse;
        let historyPlayerInfoResponse;

        try {
            basicPlayerInfoResponse = await this.api.request(
                'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
                { json: b64EncryptedKingdomId },
                {
                    'x-access-token': token,
                    'Content-Type': 'application/json',
                }
            );
        } catch (error) {
            console.log('Error getting player info: ', error);
            console.log('Error response: ', await this.enc.decryptXor(await this.enc.decryptBase64(error.response.data), xor_password));
            return;
        }

        try {
            historyPlayerInfoResponse = await this.api.request(
                'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other/history',
                { kingdomId: kingdomId},
                {
                    'x-access-token': token,
                    'Content-Type': 'application/json',
                }
            );
        } catch (error) {
            console.log('Error getting player info: ', error);
            console.log('Error response: ', error.response.data);
            return;
        }

        const b64PlayerInfo = basicPlayerInfoResponse.data;
        const basicPlayerInfo = (JSON.parse(await this.enc.decryptXor(await this.enc.decryptBase64(b64PlayerInfo), xor_password))).profile;

        const historyPlayerInfo = historyPlayerInfoResponse.data.history;

        // console.log('Basic Player Info: ', basicPlayerInfo);
        // console.log('History Player Info: ', historyPlayerInfo);

        // Combine the required fields into a single object
        const playerInfo = {
            allianceId: allianceId,
            allianceTag: allianceTag,
            kingdomId: kingdomId,
            name: basicPlayerInfo.name,
            level: basicPlayerInfo.level,
            lord: basicPlayerInfo.lord.level,
            power: basicPlayerInfo.power,
            kills: basicPlayerInfo.kill,
            death: historyPlayerInfo.stats.battle.death,
            victory: historyPlayerInfo.stats.battle.victory,
            defeat: historyPlayerInfo.stats.battle.defeated,
            gathering: historyPlayerInfo.stats.economy.gathering
        };

        const values = [
            playerInfo.allianceId,
            playerInfo.allianceTag,
            playerInfo.kingdomId,
            playerInfo.name,
            playerInfo.level,
            playerInfo.lord,
            playerInfo.power,
            playerInfo.kills,
            playerInfo.death,
            playerInfo.victory,
            playerInfo.defeat,
            playerInfo.gathering
        ];

        try {
            await this.sql.updateKingdomInfo(values);
            console.log('Player info inserted/updated successfully');
        } catch (error) {
            console.log('Error inserting/updating player info: ', error);
        }

        return playerInfo;

    }
}

module.exports = UpdateInfo;

//example

async function runExample() {
    const connection = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    const updateInfo = new UpdateInfo(connection);
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjMiLCJraW5nZG9tSWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjQiLCJ3b3JsZElkIjoyNCwidmVyc2lvbiI6MTc3NSwiYXV0aFR5cGUiOiJnb29nbGUiLCJwbGF0Zm9ybSI6IndlYiIsInRpbWUiOjE3MjA3ODYyMTg5NDUsImNsaWVudFhvciI6IjAiLCJpcCI6IjE4OC4xODguMTQ1LjExNCIsImlhdCI6MTcyMDc4NjIxOCwiZXhwIjoxNzIxMzkxMDE4LCJpc3MiOiJub2RnYW1lcy5jb20iLCJzdWIiOiJ1c2VySW5mbyJ9.DgBKuCxrPKA8m-tZHIs5UJbfkCYVpyJM3_zmsk3qvZk';
    const kingdomId = '61e03ddc36bf55230bec4424';

    await updateInfo.updateInfo(token, kingdomId);

    connection.end();
}

// runExample().then(() => process.exit(0));