const mysql = require('mysql2');
require('dotenv').config();

// Class for handling all SQL queries.
class sqlFunctions {
    constructor() {
        this.createPool();
    }

    createPool() {
        this.pool = mysql.createPool({
            host: ***REMOVED***,
            user: ***REMOVED***,
            password: ***REMOVED***,
            database: "lokex",
            waitForConnections: true,
            connectionLimit: 20,
            queueLimit: 10
        });

        this.pool.on('error', (err) => {
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                console.error('Database connection was closed.');
                this.retryConnection();
            } else {
                console.error('Database error:', err);
            }
        });

        this.pool.on('enqueue', () => {
            console.log('Query is queued, waiting for available connection...');
        });
    }

    retryConnection(delay = 5000) {
        setTimeout(() => {
            console.log('Attempting to reconnect to the database...');
            this.createPool();
            this.pool.getConnection((err) => {
                if (err) {
                    console.error('Reconnection attempt failed:', err);
                    this.retryConnection(delay);
                } else {
                    console.log('Reconnected to the database.');
                }
            });
        }, delay);
    }

    // Standard code for making queries and returning output if needed.
    query(sql, args) {
        return new Promise((resolve, reject) => {
            this.pool.query(sql, args, (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows);
            });
        });
    };

    // Get all accounts from the database.
    getAccounts() {
        return this.query("SELECT * FROM botAccounts");
    }

    addAccount(name, email, password, token, kingdomId, allianceid, alliancetag, guild, owner) {
        return this.query("INSERT INTO botAccounts (name, email, password, token, kingdomId, allianceid, alliancetag, guild, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ", [name, email, password, token, kingdomId, allianceid, alliancetag, guild, owner]);
    }

    removeAccount(name, guild) {
        return this.query("DELETE FROM botAccounts WHERE name = ? AND guild = ?", [`${name}`, guild]);
    }

    updateBotInfo(name, allianced, alliancetag, kingdomId) {
        return this.query("UPDATE botAccounts SET name = ?, allianceid = ?, alliancetag = ? WHERE kingdomId = ?", [name, allianced, alliancetag, kingdomId]);
    }

    updateBotToken(token, kingdomId) {
        return this.query("UPDATE botAccounts SET token = ? WHERE kingdomId = ?", [token, kingdomId]);
    }

    async getAccountByEmail(email) {
        return this.query("SELECT * FROM botAccounts WHERE email = ?", [email]);
    }

    getNames(name) {
        return this.query("SELECT name FROM botAccounts WHERE name LIKE ?", [`%${name}%`]);
    }

    async getRoles(exclude = ["SCANNER"]) {
        return this.query(`
            SELECT COLUMN_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'botAccounts' 
            AND COLUMN_NAME = 'role';
        `).then(result => {
            // Extracting the enum values from the result
            const enumValues = result[0].COLUMN_TYPE;
            // Remove the "enum('...')" wrapping and split the values by commas
            const allRoles = enumValues.replace("enum('", "").replace("')", "").split("','");

            // Filter out the roles that are in the exclude array
            return allRoles.filter(role => !exclude.includes(role));
        });
    }

    async getXORPass() {
        return this.query("SELECT value FROM `utils` WHERE `name` = 'password'");
    }

    async editRole(name, role, guild) {
        return this.query("UPDATE botAccounts SET role = ? WHERE name = ? AND guild = ?", [role, name, guild]);
    }

    getAlliances() {
        return this.query("SELECT allianceId FROM allianceinf");
    }

    getAccountsAlliances() {
        return this.query("SELECT allianceid FROM botAccounts");
    }
}

module.exports = sqlFunctions;