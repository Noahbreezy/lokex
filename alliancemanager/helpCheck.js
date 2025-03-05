const Api = require("../general/api");
const mysql = require("mysql2");
require('dotenv').config();

class HelpCheck {

    constructor(sql) {
        this.sql = sql;
    };

    async checkHelp(kingdomId, titleGrace) {
        console.log("Checking help for kingdom: ", kingdomId);
        const helpKingdoms = await this.sql.getUsersWithTitleGrace(titleGrace);
        if (helpKingdoms.length > 0) {
            console.log("helpkingdoms: ", helpKingdoms);
            if (helpKingdoms.find(kingdom => kingdom.kingdomId == kingdomId)) {
                console.log("kingdom found: ", kingdomId);
                return true;
            }
        }
        return false;
    }
}

module.exports = HelpCheck;

//example
async function runExample() {
    const connection = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

    console.log("Running example");

    const helpCheck = new HelpCheck(connection);

    const kingdomId = "657c3feed23bad7107eb4d2d";
    const titleGrace = '0';

    try {
        console.log(await helpCheck.checkHelp(kingdomId, titleGrace));
    } catch (error) {
        console.error("Error checking help:", error);
    }

    connection.end();
}

// runExample().then(() => process.exit(0)).catch(() => process.exit(1));