const mysql = require('mysql2');
require('dotenv').config();

// Class for handling all SQL queries.
class sqlFunctions {
    constructor() {
        this.createPool();
    }

    createPool() {
        this.pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 20,
            queueLimit: 10
        });

        this.pool.on('error', (err) => {
            if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'EPIPE') {
                console.error('Database connection was lost:', err.code);
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

    closeConnection() {
        if (this.pool && this.pool._closed !== true) {
            this.pool.end((err) => {
                if (err) {
                    console.error('Error closing the database connection:', err);
                } else {
                    console.log('Database connection closed.');
                }
            });
        } else {
            console.log('Database connection is already closed.');
        }
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

    // Bot account functions

    // Get alliance manager bots
    async getManagerAccounts() {
        return this.query(`SELECT token, kingdomId, allianceId, allianceTag FROM botAccounts WHERE role = 'MANAGER' AND LENGTH(allianceId) > 1;`);
    }

    // Get all bot accounts except IDLE
    async getActiveBots() {
        return this.query(`SELECT token, kingdomId, allianceId, allianceTag FROM botAccounts WHERE role <> 'IDLE';`);
    }

    // Get active bot logins
    async getActiveBotsLogin() {
        return this.query(`SELECT email, password, kingdomId FROM botAccounts WHERE role <> 'IDLE';`);
    }

    // Get single bot account login
    async getAccountLogin(kingdomId) {
        const query = `SELECT email, password FROM botAccounts WHERE kingdomId = ?;`;
        return this.query(query, [kingdomId]);
    }

    // Get a manager token of an alliance
    async getManagerToken(allianceId) {
        const query = `SELECT token FROM botAccounts WHERE allianceId = ? AND role = 'MANAGER';`;
        return this.query(query, [allianceId]);
    }

    // Get a manager token by kingdomId
    async getManagerTokenByKingdomId(kingdomId) {
        const query = `SELECT token FROM botAccounts WHERE kingdomId = ? AND role = 'MANAGER';`;
        return this.query(query, [kingdomId]);
    }

    // Get manager info by kingdomId
    async getManagerInfoByKingdomId(kingdomId) {
        const query = `SELECT token, kingdomId, allianceId, allianceTag, guild FROM botAccounts WHERE kingdomId = ? AND role = 'MANAGER';`;
        return this.query(query, [kingdomId]);
    }

    // Get a random token from a specific guild
    async getRandomManagerTokenFromGuild(guild) {
        const query = `SELECT token FROM botAccounts WHERE guild = ? AND role = 'MANAGER' ORDER BY RAND() LIMIT 1;`;
        return this.query(query, [guild]);
    }

    // Set a manager bot account role as IDLE.
    async setManagerIdle(kingdomId) {
        const query = `UPDATE botAccounts SET role = 'IDLE' WHERE kingdomId = ?;`;
        return this.query(query, [kingdomId]);
    }

    // Add a bot account
    async addAccount(name, email, password, token, kingdomId, allianceid, alliancetag, guild, owner) {
        return this.query("INSERT INTO botAccounts (name, email, password, token, kingdomId, allianceid, alliancetag, guild, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ", [name, email, password, token, kingdomId, allianceid, alliancetag, guild, owner]);
    }

    // Remove a bot account || NEED TO CHANGE TO KINGDOMID
    async removeAccount(kingdomId, guild) {
        return this.query("DELETE FROM botAccounts WHERE kingdomId = ? AND guild = ?", [`${kingdomId}`, guild]);
    }

    // Update bot account info
    async updateBotInfo(name, allianced, alliancetag, kingdomId) {
        return this.query("UPDATE botAccounts SET name = ?, allianceid = ?, alliancetag = ? WHERE kingdomId = ?", [name, allianced, alliancetag, kingdomId]);
    }

    // Update bot account token
    async updateBotToken(token, kingdomId) {
        return this.query("UPDATE botAccounts SET token = ? WHERE kingdomId = ?", [token, kingdomId]);
    }

    // Get account by email || Add guild filter and email %%
    async getAccountByEmail(email) {
        return this.query("SELECT * FROM botAccounts WHERE email = ?", [email]);
    }

    // Get bot account names by guild
    async getBotNamesFromGuild(name, guild) {
        return this.query("SELECT name, kingdomId FROM botAccounts WHERE name LIKE ? AND guild = ?", [`%${name}%`, guild]);
    }

    // Get bot account name by kingdomId
    async getBotNameByKingdomId(kingdomId) {
        return this.query("SELECT name FROM botAccounts WHERE kingdomId = ?", [kingdomId]);
    }

    // Get possible roles from the botAccounts table
    async getRoles(exclude = ["SCANNER"]) {
        return this.query(`
            SELECT COLUMN_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'lokex'
            AND TABLE_NAME = 'botAccounts' 
            AND COLUMN_NAME = 'role';
        `).then(result => {
            // Extracting the enum values from the result
            const enumValues = result[0].COLUMN_TYPE;
            // Remove the "enum('...')" wrapping and split the values by commas
            const allRoles = enumValues.substring(5, enumValues.length - 1).replace(/'/g, "").split(",");
            // Filter out the roles that are in the exclude array
            return allRoles.filter(role => !exclude.includes(role));
        });
    }

    // Edit a role of a bot account
    async editRole(kingdomId, role, guild) {
        return this.query("UPDATE botAccounts SET role = ? WHERE kingdomId = ? AND guild = ?", [role, kingdomId, guild]);
    }

    // Get accounts' alliance IDs
    async getAccountsAlliances() {
        return this.query("SELECT allianceid FROM botAccounts");
    }

    // Allianceinf functions

    // Get all alliances IDs
    async getAlliances() {
        return this.query("SELECT allianceId FROM allianceinf");
    }

    // Get the guild of an alliance
    async getAllianceGuild(allianceId) {
        const query = `SELECT guild FROM allianceinf WHERE allianceId = ?;`;
        return this.query(query, [allianceId]);
    }

    // Search for alliances of the same guild
    async getGuildAlliances(tag, guild) {
        const query = `SELECT allianceId, tag FROM allianceinf WHERE tag LIKE ? AND guild = ?;`;
        return this.query(query, [`%${tag}%`, guild]);
    }

    // Get all alliance settings
    async getAllAllianceSettings(guild) {
        const query = `
            SELECT 
                tag, power, kills, speed, combat, monster, infantry, cavalry, 
                ranged, governor, verified, \`interval\`, \`accept\`, kick, 
                maxkick, cvcmode, titlegrace 
            FROM allianceinf 
            WHERE guild = ?;
        `;
        return this.query(query, [guild]);
    }

    // Get alliance settings
    async getAllianceSettings(allianceId) {
        const query = "SELECT * FROM allianceinf WHERE allianceId = ?;";
        return this.query(query, [allianceId]);
    }

    // Get mastery settings
    async getMasterySettings(allianceId) {
        const query = `SELECT combat, monster, infantry, cavalry, ranged, governor FROM allianceinf WHERE allianceId = ?;`;
        return this.query(query, [allianceId]);
    }

    // Update alliance specific setting column
    async updateAllianceSetting(column, value, allianceId) {
        const query = `UPDATE allianceinf SET \`${column}\` = ? WHERE allianceId = ?`;
        return this.query(query, [value, allianceId]);
    }

    // Reset settings
    async resetAllianceSettings(allianceId) {
        const query = `UPDATE allianceinf 
        SET 
            status = DEFAULT,
            power = DEFAULT,
            kills = DEFAULT,
            speed = DEFAULT,
            combat = DEFAULT,
            monster = DEFAULT,
            infantry = DEFAULT,
            cavalry = DEFAULT,
            ranged = DEFAULT,
            governor = DEFAULT,
            verified = DEFAULT,
            \`interval\` = DEFAULT,
            \`accept\` = DEFAULT,
            kick = DEFAULT,
            maxkick = DEFAULT,
            cvcmode = DEFAULT,
            titlegrace = DEFAULT
        WHERE allianceId = ?;`
        return this.query(query, [allianceId]);
    }

    // check if the alliance exists in the settings already
    async allianceExists(allianceId) {
        const query = `SELECT allianceId FROM allianceinf WHERE allianceId = ?;`;
        const results = await this.query(query, [allianceId]);
        return results.length > 0;
    }

    // Add alliance to the settings table (allianceID, tag, guild required only)
    async addAllianceSettings(allianceId, tag, guild) {
        // console.log("Adding alliance to settings", allianceId, tag, guild);
        const query = `INSERT INTO allianceinf (allianceId, tag, guild) VALUES (?, ?, ?);`;
        return this.query(query, [allianceId, tag, guild]);
    }


    // Information tables functions

    // Titles functions

    // Get last title users
    async getLastTitleUsers() {
        return this.query(`WITH LastRecords AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY titleId ORDER BY \`date\` DESC) AS rn FROM titlelog WHERE titleId IN (108, 109) ) SELECT id, titleId, kingdomId, discordId, free, date FROM LastRecords WHERE rn = 1 ORDER BY titleId;`)
    }

    // Get users with titlegrace
    async getUsersWithTitleGrace(titleGrace) {
        const query = `SELECT kingdomId FROM titlelog WHERE date >= NOW() - INTERVAL ? MINUTE;`;
        return this.query(query, [titleGrace]);
    }

    // Blacklist functions

    // Check if a kingdom is blacklisted
    async isKingdomBlacklisted(kingdomId, guild) {
        const query = "SELECT kingdomId, expiration, description FROM blacklist WHERE kingdomId=? AND valid=1 AND expiration>NOW() AND guild=?";
        const results = await this.query(query, [kingdomId, guild]);
        return results.length > 0 ? results : false;
    }

    // Remove a kingdom from the blacklist
    async removeFromBlacklist(kingdomId, guild) {
        const query = "UPDATE blacklist SET valid=0 WHERE kingdomId=? AND guild=?";
        return this.query(query, [kingdomId, guild]);
    }

    // Add a kingdom to the blacklist
    async addToBlacklist(discordId, kingdomId, expiration, description, guild) {
        const query = "INSERT INTO blacklist (discordId, kingdomId, expiration, description, guild) VALUES (?, ?, ?, ?, ?)";
        console.log("Adding to blacklist", discordId, kingdomId, expiration, description, guild);
        return this.query(query, [discordId, kingdomId, expiration, description, guild]);
    }

    // Get blacklisted kingdoms of a guild
    async getBlacklistedFromGuild(guild) {
        const query = `SELECT b.date,b.kingdomid,b.discordid,b.description,b.expiration,i.name 
                   FROM blacklist b 
                   LEFT JOIN (SELECT kingdomid, name, date 
                              FROM info 
                              WHERE (kingdomid, date) 
                              IN (SELECT kingdomid, MAX(date) 
                                  FROM info 
                                  GROUP BY kingdomid)) i 
                   ON b.kingdomid = i.kingdomid 
                   WHERE b.valid=1 AND b.expiration>NOW() AND b.guild=?;`;
        return this.query(query, [guild]);
    }

    // Verification functions

    // Check if a kingdom is verified
    async isKingdomVerified(kingdomId, guild) {
        const query = "SELECT kingdomId FROM verified WHERE kingdomId=? AND guild=?";
        const results = await this.query(query, [kingdomId, guild]);
        return results.length > 0;
    }

    // Get verified kingdom discordId
    async getVerifiedDiscordId(kingdomId, guild) {
        const query = "SELECT discordId FROM verified WHERE kingdomId=? AND guild=?";
        return this.query(query, [kingdomId, guild]);
    }

    // Guild settings functions

    // Get guild logchannels of a specific alliance
    async getGuildLogChannelsByAlliance(allianceId) {
        const query = "SELECT accept_log_channel, reject_log_channel FROM guild_settings WHERE guild_id=(SELECT guild FROM allianceinf WHERE allianceId=?);";
        return this.query(query, [allianceId]);
    }

    // Get guild logchannels of a specific guild
    async getGuildLogChannels(guild) {
        const query = "SELECT accept_log_channel, reject_log_channel FROM guild_settings WHERE guild_id=?;";
        return this.query(query, [guild]);
    }

    // Set guild accept log channel
    async setGuildAcceptLogChannel(channel, guild) {
        const query = "UPDATE guild_settings SET accept_log_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild reject log channel
    async setGuildRejectLogChannel(channel, guild) {
        const query = "UPDATE guild_settings SET reject_log_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Get verification role of a guild
    async getGuildVerificationRole(guild) {
        const query = "SELECT verified_role FROM guild_settings WHERE guild_id=?;";
        return this.query(query, [guild]);
    }

    // Set guild verification role
    async setGuildVerificationRole(role, guild) {
        const query = "UPDATE guild_settings SET verified_role=? WHERE guild_id=?;";
        return this.query(query, [role, guild]);
    }

    // Check if a guild exists in the settings already
    async guildExists(guildId) {
        const query = `SELECT guild_id FROM guild_settings WHERE guild_id = ?;`;
        const results = await this.query(query, [guildId]);
        return results.length > 0;
    }

    // Add guild to the settings table (guild_id required only)
    async addGuild(guildId, guildName) {
        const query = `INSERT INTO guild_settings (guild_id, guild_name) VALUES (?, ?);`;
        return this.query(query, [guildId, guildName]);
    }

    // Use ephemeral messages flag
    async setEphemeral(flag, guildId) {
        const query = `UPDATE guild_settings SET ephemeral = ? WHERE guild_id = ?;`;
        return this.query(query, [flag, guildId]);
    }

    // Get the use ephemeral messages flag
    async getEphemeral(guildId) {
        const query = `SELECT ephemeral FROM guild_settings WHERE guild_id = ?;`;
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0].ephemeral === 1 : false;
    }

    // Accept log functions

    // Check if an accept log exists
    async checkAcceptLog(kingdomId) {
        const query = "SELECT * FROM acceptLog WHERE kingdomId = ? AND timestamp >= NOW() - INTERVAL 5 SECOND";
        const results = await this.query(query, [kingdomId]);
        return results.length > 0;
    }

    // Add an accept log
    async addAcceptLog(kingdomId, name) {
        const query = "INSERT INTO acceptLog (kingdomId, name) VALUES (?, ?)";
        return this.query(query, [kingdomId, name]);
    }

    // Treasures speeds functions

    // Get treasure speeds
    async getTreasureSpeeds() {
        return this.query("SELECT treasureCode, speedCode, speed FROM speeds");
    }

    // Info functions

    // Get a kingdom name by Id
    async getKingdomName(kingdomId) {
        const query = "SELECT name FROM info WHERE kingdomId=? ORDER BY id DESC";
        return this.query(query, [kingdomId]);
    }

    // Get a kingdom's name and alliance
    async getKingdomNameAndAlliance(kingdomId) {
        const query = "SELECT name, allianceId, allianceTag FROM info WHERE kingdomId=? ORDER BY id DESC";
        return this.query(query, [kingdomId]);
    }

    // Get kills of a kingdom
    async getKingdomKills(kingdomId) {
        const query = "SELECT kills FROM info WHERE kingdomId=? ORDER BY id DESC LIMIT 1";
        return this.query(query, [kingdomId]);
    }

    // search for a kingdom by name
    async searchKingdomName(name) {
        const query = "SELECT kingdomId, name FROM info WHERE name LIKE ? AND id IN (SELECT MAX(id) FROM info GROUP BY kingdomId) ORDER BY id DESC";
        return this.query(query, [`%${name}%`]);
    }

    // Update a user in info
    async updateKingdomInfo(values) {
        const query = `
        INSERT INTO info (kingdomId, name, level, power, kills, death, victory, defeat, gathering)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            level = VALUES(level),
            lord = VALUES(lord),
            power = VALUES(power),
            kills = VALUES(kills),
            death = VALUES(death),
            victory = VALUES(victory),
            defeat = VALUES(defeat),
            gathering = VALUES(gathering)
    `;
        return this.query(query, values);
    }

    // Update a user in info
    async updateFullKingdomInfo(values) {
        const query = `
        INSERT INTO info (allianceId, allianceTag, kingdomId, name, level, lord, power, kills, death, victory, defeat, gathering, continent, x, y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        return this.query(query, values);
    }

    // System tables functions

    // Utils functions

    // Get XOR password
    async getXORPass() {
        return this.query("SELECT value FROM utils WHERE name='password'");
    }

    // Proxies functions

    // Get proxies
    async getProxies() {
        return this.query("SELECT ip FROM proxies");
    }
}

module.exports = sqlFunctions;