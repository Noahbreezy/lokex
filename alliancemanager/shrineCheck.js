const mysql = require("mysql2");
require('dotenv').config();

class ShrineCheck {

    constructor(api) {
        this.api = api;
    }

    async getShrines(token) {

        const shrinesResponse = await this.api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/alliance/shrine/list",
            {},
            {
                "x-access-token": token,
                "Content-Type": "application/json",
            }
        );

        if (shrinesResponse.status === 200 && shrinesResponse.data && shrinesResponse.data.shrines) {
            // console.log(shrinesResponse.data.shrines.map(shrine => shrine.fo.code))
            return shrinesResponse.data.shrines.map(shrine => shrine.code);
        } else {
            console.log("Error getting shrines");
        }
        return null;
    }

    async checkResearch(token) {
        const shrines = await this.getShrines(token);

        if (shrines && shrines.includes(204)) {
            return true;
        } else {
            return false;
        }
    }

}

module.exports = ShrineCheck;

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

    const shrineCheck = new ShrineCheck(connection);

    const result = await shrineCheck.checkResearch(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2NjY0YzliMzYwOTkzYjE1OTkxZWNkODciLCJraW5nZG9tSWQiOiI2NjY0YzliYTI2ZjllZmI5ZmVlNTA4ZGQiLCJ3b3JsZElkIjo0NywidmVyc2lvbiI6MTc1OCwiYXV0aFR5cGUiOiJlbWFpbCIsInBsYXRmb3JtIjoid2ViIiwidGltZSI6MTcyMjQxMjgxMzk4OSwiY2xpZW50WG9yIjoiMCIsImlwIjoiMTg1LjE2NS4yNDMuNDAiLCJpYXQiOjE3MjI0MTI4MTMsImV4cCI6MTcyMzAxNzYxMywiaXNzIjoibm9kZ2FtZXMuY29tIiwic3ViIjoidXNlckluZm8ifQ.fitVOg6Wip60m2Lb8K2bbljaXbeBiK7oRa8-CWA3a4E"
    );
    console.log(result);
    connection.end();
}

// runExample();