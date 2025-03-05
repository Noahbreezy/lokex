const mysql = require("mysql2");
require('dotenv').config();

class AcceptCheck {
    
        constructor(sql) {
            this.sql = sql;
        };
    
        async checkAccept(kingdomId) {
            const isAccepted = await this.sql.checkAcceptLog(kingdomId);

            // console.log(`accepts for ${kingdomId}: ${accepts[0].length}`);
    
            if (isAccepted) {
                console.log("Accept already exists: ", kingdomId);
                return true;
            } else {
                return false;
            }
        }
}

module.exports = AcceptCheck;


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
    }
    );

    console.log("Running acceptCheck example");

    const acceptCheck = new AcceptCheck(connection);
    console.log(await acceptCheck.checkAccept("64e4044b9f95b44a47d45205"));

    connection.end();
}

// runExample().then(() => process.exit(0)).catch(() => process.exit(1));