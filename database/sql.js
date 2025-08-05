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
            connectionLimit: 30,
            queueLimit: 50
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

    // Check if the connection pool is healthy
    // checkConnection() {
    //     this.pool.getConnection((err, connection) => {
    //         if (err) {
    //             console.error('Error getting connection:', err);
    //             this.retryConnection();
    //         } else {
    //             console.log('Database connection is healthy.');
    //             connection.release();
    //         }
    //     });
    // }

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

    // Get all information of all bot accounts of a guild
    async getAllGuildAccounts(guild) {
        return this.query(`SELECT name, email, kingdomId, role, allianceId, allianceTag, owner FROM botAccounts WHERE guild = ?;`, [guild]);
    }

    // Get all bot accounts except IDLE
    async getActiveBots() {
        return this.query(`SELECT token, kingdomId, allianceId, allianceTag FROM botAccounts;`);
    }

    // Get active bot logins
    async getActiveBotsLogin() {
        return this.query(`SELECT email, password, kingdomId FROM botAccounts;`);
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

    // Get all manager tokens of a guild
    async getManagerTokens(guild) {
        const query = `SELECT token FROM botAccounts WHERE guild = ? AND role = 'MANAGER';`;
        return this.query(query, [guild]);
    }

    // Get a queen token of a guild
    async getQueenToken(guildId) {
        const query = `SELECT token FROM botAccounts WHERE guild = ? AND role = 'QUEEN';`;
        return this.query(query, [guildId]);
    }

    // Get the info of scanner bots of a guild
    async getScannerTokens(guildId) {
        const query = `SELECT * FROM botAccounts WHERE guild = ? AND role = 'SCANNER';`;
        return this.query(query, [guildId]);
    }

    // Get the manager's role status
    async getManagerRole(kingdomId) {
        const query = `SELECT role FROM botAccounts WHERE kingdomId = ?;`;
        return this.query(query, [kingdomId]);
    }

    // Check if the manager account has manager role
    async checkManagerRole(kingdomId) {
        const query = `SELECT role FROM botAccounts WHERE kingdomId = ? AND role = 'MANAGER';`;
        const results = await this.query(query, [kingdomId]);
        return results.length > 0;
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

    // Get manager info by allianceId
    async getManagerInfoByAllianceId(allianceId) {
        const query = `SELECT token, kingdomId, allianceId, allianceTag, guild FROM botAccounts WHERE allianceId = ? AND role = 'MANAGER';`;
        return this.query(query, [allianceId]);
    }

    // Get a random token from a specific guild
    async getRandomManagerTokenFromGuild(guild) {
        const query = `SELECT token FROM botAccounts WHERE guild = ? AND role = 'MANAGER' ORDER BY RAND() LIMIT 1;`;
        return this.query(query, [guild]);
    }

    // Get a random non-idle token from a specific guild
    async getRandomNonIdleTokenFromGuild(guild) {
        const query = `SELECT token FROM botAccounts WHERE guild = ? AND role != 'IDLE' ORDER BY RAND() LIMIT 1;`;
        return this.query(query, [guild]);
    }

    // Get the information of the queen account in a guild
    async getQueenInfo(guild) {
        const query = `SELECT name, token, kingdomId, allianceId, allianceTag FROM botAccounts WHERE guild = ? AND role = 'QUEEN';`;
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
    async getRoles(exclude = [""]) {
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

    // Get all guild alliances
    async getAllGuildAlliances(guild) {
        const query = `SELECT allianceId, tag FROM allianceinf WHERE guild = ?;`;
        return this.query(query, [guild]);
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

    // Set the status column back to default for all entries
    async resetAlliancesStatus() {
        const query = `UPDATE allianceinf SET status = DEFAULT;`;
        return this.query(query);
    }

    // Set the status of a specific alliance to 1
    async setAllianceStatusToActive(allianceId) {
        const query = `UPDATE allianceinf SET status = 1 WHERE allianceId = ?;`;
        return this.query(query, [allianceId]);
    }

    // Set the status of a specific alliance to 0
    async setAllianceStatusToInactive(allianceId) {
        const query = `UPDATE allianceinf SET status = 0 WHERE allianceId = ?;`;
        return this.query(query, [allianceId]);
    }

    // Get a list of all the alliances that are active
    async getActiveAlliances() {
        const query = `SELECT allianceId, tag FROM allianceinf WHERE status = 1;`;
        return this.query(query);
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

    // Get the amount of titles that were applied today in a guild
    async getTitlesToday(guild) {
        const query = `SELECT COUNT(*) as count FROM titlelog WHERE date >= CURDATE() AND guild = ?;`;
        return this.query(query, [guild]);
    }

    // Get the amount of titles that were ever applied in a guild
    async getTitlesTotal(guild) {
        const query = `SELECT COUNT(*) as count FROM titlelog WHERE guild = ?;`;
        return this.query(query, [guild]);
    }

    // Check if a title was applied in the last 2 minutes
    async checkTitleStatus(titleID) {
        const query = `SELECT discordId, free, date FROM titlelog WHERE titleId = ? AND date >= NOW() - INTERVAL 2 MINUTE;`;
        const results = await this.query(query, [titleID]);
        return results.length > 0 ? results[0] : null;
    }

    // log a title request
    async logTitleRequest(titleId, kingdomId, discordId, guildId) {
        const query = `INSERT INTO titlelog (titleId, kingdomId, discordId, guild) VALUES (?, ?, ?, ?);`;
        return this.query(query, [titleId, kingdomId, discordId, guildId]);
    }

    // Set the latest title log of a discord user as free
    async freeTitle(discordId, guildId) {
        const query = `UPDATE titlelog SET free = 1 WHERE free = 0 AND discordId = ? AND date >= NOW() - INTERVAL 2 MINUTE AND guild = ?;`;
        return this.query(query, [discordId, guildId]);
    }

    // Blacklist functions

    // Check if a kingdom is blacklisted
    async isKingdomBlacklisted(kingdomId, guild) {
        const query = "SELECT discordId, kingdomId, date, expiration, description FROM blacklist WHERE kingdomId=? AND valid=1 AND expiration>NOW() AND guild=?";
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
        const query = "SELECT kingdomId FROM verified WHERE kingdomId=? AND guild=? AND status=1";
        const results = await this.query(query, [kingdomId, guild]);
        return results.length > 0;
    }

    // Check if a kingdom is verified in any guild, and return discordId and the continent linked to the guild
    async isKingdomVerifiedAnyGuild(kingdomId) {
        const query = `
            SELECT v.discordId, gcl.continent, v.guild
            FROM verified v
            INNER JOIN guild_continent_link gcl ON v.guild = gcl.guild_id
            WHERE v.kingdomId = ? AND v.status = 1
            LIMIT 1;
        `;
        const results = await this.query(query, [kingdomId]);
        return results.length > 0 ? results[0] : null;
    }

    // Get verified kingdom discordId
    async getVerifiedDiscordId(kingdomId, guild) {
        const query = "SELECT discordId FROM verified WHERE kingdomId=? AND guild=?";
        return this.query(query, [kingdomId, guild]);
    }

    // Add a kingdom to the verified list
    async addVerified(kingdomId, kingdomName, userId, userName, guildId, wallet) {
        const query = "INSERT INTO verified (kingdomId, kingdomName, discordId, name, guild, wallet) VALUES (?, ?, ?, ?, ?, ?)";
        return this.query(query, [kingdomId, kingdomName, userId, userName, guildId, wallet]);
    }

    // Save a verification code to the database
    async saveVerificationCode(code, discordId, guildId) {
        const query = 'INSERT INTO verification_codes (code, discord_id, guild_id, used, expired) VALUES (?, ?, ?, 0, 0)';
        return this.query(query, [code, discordId, guildId]);
    }

    // Get the latest guildId in which a discord user requested a verification code
    async getLatestVerificationRequestForUser(discordId) {
        const query = 'SELECT code, guild_id FROM verification_codes WHERE discord_id = ? ORDER BY id DESC LIMIT 1';
        const results = await this.query(query, [discordId]);
        return results.length > 0 ? results[0] : null;
    }

    // Check if a verification code is valid
    async checkVerificationCode(code, guildId) {
        const query = 'SELECT discord_id FROM verification_codes WHERE code = ? AND guild_id = ? AND used = 0 AND expired = 0';
        return this.query(query, [code, guildId]);
    }

    // Mark a verification code as used
    async markCodeUsed(code, guildId) {
        const query = 'UPDATE verification_codes SET used = 1 WHERE code = ? AND guild_id = ?';
        return this.query(query, [code, guildId]);
    }

    // Mark a verification code as expired
    async markCodeExpired(code, guildId) {
        const query = 'UPDATE verification_codes SET expired = 1 WHERE code = ? AND guild_id = ?';
        return this.query(query, [code, guildId]);
    }

    // Check if a verification code is unique for a guild
    async checkUniqueVerificationCode(code, guildId) {
        const query = 'SELECT code FROM verification_codes WHERE code = ? AND guild_id = ?';
        const results = await this.query(query, [code, guildId]);
        return results.length === 0;
    }

    // Check if a discord user has one or more verified kingdoms
    async checkVerifiedKingdoms(discordId, guild) {
        const query = 'SELECT kingdomId, kingdomName FROM verified WHERE discordId = ? AND guild = ?';
        const results = await this.query(query, [discordId, guild]);
        return results.length > 0 ? results : false;
    }

    // Check if a discord user has verified account with a wallet
    async checkVerifiedWallet(discordId, guild) {
        const query = 'SELECT kingdomId, kingdomName, wallet FROM verified WHERE discordId = ? AND guild = ? AND wallet IS NOT NULL';
        const results = await this.query(query, [discordId, guild]);
        return results.length > 0 ? results : false;
    }

    // Check if a discord user exists for a certain wallet, if it does, return user information from verified
    async checkDiscordUserByWallet(wallet, guild) {
        const query = 'SELECT discordId, name FROM verified WHERE wallet = ? AND guild = ?';
        const results = await this.query(query, [wallet, guild]);
        return results.length > 0 ? results[0] : null;
    }

    // Update wallet address for a verified discord user
    async updateUserWallet(discordId, guild, newWallet) {
        const sql = `UPDATE verified SET wallet = ? WHERE discordId = ? AND guild = ? AND status = 1`;
        return await this.query(sql, [newWallet, discordId, guild]);
    }

    // Get wallet address for a verified discord user
    async getUserWallet(discordId, guild) {
        const sql = `SELECT wallet FROM verified WHERE discordId = ? AND guild = ? AND status = 1`;
        return await this.query(sql, [discordId, guild]);
    }

    // Check if a wallet address is already in use by another user in the same guild
    async checkWalletInUse(wallet, guild, excludeDiscordId = null) {
        let sql = `SELECT discordId, kingdomName FROM verified WHERE wallet = ? AND guild = ? AND status = 1`;
        let params = [wallet, guild];
        
        if (excludeDiscordId) {
            sql += ` AND discordId != ?`;
            params.push(excludeDiscordId);
        }
        
        return await this.query(sql, params);
    }

    // Get kingdoms and Discord users that need status/role changes
    async getUnlinkedKingdomsAndRoles(days) {
        // Increase GROUP_CONCAT limit to handle large lists
        await this.query("SET SESSION group_concat_max_len = 1000000;");

        const query = `
            WITH UnlinkedKingdoms AS (
                -- Identify kingdoms that are not linked to their guild within the time frame
                SELECT 
                    v.guild,
                    v.kingdomId,
                    v.discordId
                FROM 
                    verified v
                    LEFT JOIN (
                        SELECT kingdomId, continent
                        FROM info i
                        WHERE date >= DATE_SUB(NOW(), INTERVAL ? DAY)
                        AND date = (
                            SELECT MAX(date)
                            FROM info i2
                            WHERE i2.kingdomId = i.kingdomId
                            AND i2.date >= DATE_SUB(NOW(), INTERVAL ? DAY)
                        )
                    ) i ON v.kingdomId = i.kingdomId
                    LEFT JOIN guild_continent_link gcl 
                        ON i.continent = gcl.continent 
                        AND v.guild = gcl.guild_id
                WHERE 
                    v.status = 1  -- Only consider kingdoms that are currently active
                    AND v.date >= DATE_SUB(NOW(), INTERVAL ? DAY)  -- Filter verified records by date
                    AND gcl.guild_id IS NULL  -- Kingdom's continent is not linked to the guild
            ),
            DiscordStatus AS (
                -- Determine which Discord users need their role removed
                SELECT 
                    v.guild,
                    v.discordId,
                    CASE 
                        WHEN COUNT(*) = SUM(CASE 
                                                WHEN uk.kingdomId IS NOT NULL THEN 1 
                                                ELSE 0 
                                            END)
                        THEN 1  -- All kingdoms for this discordId need status change due to being unlinked
                        WHEN SUM(CASE 
                                    WHEN v.status = 0 THEN 1 
                                    ELSE 0 
                                END) = COUNT(*)
                        THEN 1  -- All kingdoms for this discordId already have status = 0
                        ELSE 0  -- At least one kingdom is still linked or active
                    END AS needsRoleRemoval
                FROM 
                    verified v
                    LEFT JOIN UnlinkedKingdoms uk 
                        ON v.kingdomId = uk.kingdomId 
                        AND v.guild = uk.guild
                WHERE 
                    v.date >= DATE_SUB(NOW(), INTERVAL ? DAY)  -- Filter verified records by date
                GROUP BY 
                    v.guild, v.discordId
                HAVING 
                    COUNT(*) > 0  -- Ensure the discordId has at least one kingdom
            )
            -- Aggregate the results by guild
            SELECT 
                uk.guild AS guildId,
                GROUP_CONCAT(DISTINCT uk2.kingdomId) AS needChangeStatus,
                GROUP_CONCAT(DISTINCT ds.discordId) AS needChangeRole
            FROM 
                (SELECT DISTINCT guild FROM UnlinkedKingdoms) uk
                LEFT JOIN UnlinkedKingdoms uk2 ON uk.guild = uk2.guild
                LEFT JOIN DiscordStatus ds ON uk.guild = ds.guild AND ds.needsRoleRemoval = 1
            GROUP BY 
                uk.guild
            UNION
            SELECT 
                v.guild AS guildId,
                NULL AS needChangeStatus,
                GROUP_CONCAT(DISTINCT v.discordId) AS needChangeRole
            FROM 
                verified v
                LEFT JOIN UnlinkedKingdoms uk 
                    ON v.kingdomId = uk.kingdomId 
                    AND v.guild = uk.guild
            WHERE 
                v.date >= DATE_SUB(NOW(), INTERVAL ? DAY)
                AND uk.kingdomId IS NULL  -- Exclude kingdoms that are unlinked (already handled above)
            GROUP BY 
                v.guild, v.discordId
            HAVING 
                COUNT(*) = SUM(CASE WHEN v.status = 0 THEN 1 ELSE 0 END)  -- All kingdoms have status = 0
                AND COUNT(*) > 0;  -- Ensure the discordId has at least one kingdom
        `;

        try {
            const results = await this.query(query, [days, days, days, days, days]);

            // Transform the results into the desired JSON structure
            const formattedResult = {
                guilds: []
            };

            // Group results by guildId
            const guildMap = new Map();
            for (const row of results) {
                const guildId = row.guildId;
                if (!guildMap.has(guildId)) {
                    guildMap.set(guildId, {
                        guildId,
                        needChangeStatus: [],
                        needChangeRole: []
                    });
                }
                const guildEntry = guildMap.get(guildId);
                if (row.needChangeStatus) {
                    guildEntry.needChangeStatus.push(...row.needChangeStatus.split(',').filter(id => id));
                }
                if (row.needChangeRole) {
                    guildEntry.needChangeRole.push(...row.needChangeRole.split(',').filter(id => id));
                }
            }

            // Remove duplicates and convert to array
            for (const entry of guildMap.values()) {
                entry.needChangeStatus = [...new Set(entry.needChangeStatus)];
                entry.needChangeRole = [...new Set(entry.needChangeRole)];
                formattedResult.guilds.push(entry);
            }

            return formattedResult;
        } catch (err) {
            console.error('Error fetching unlinked kingdoms and roles:', err);
            throw err;
        }
    }

    // Set a kingdom's status to 0
    async setKingdomStatusToZero(kingdomId, guild) {
        const query = `UPDATE verified SET status = 0 WHERE kingdomId = ? AND guild = ?;`;
        return this.query(query, [kingdomId, guild]);
    }

    // Guild settings functions

    // Get all guild settings of a guild
    async getGuildSettings(guildId) {
        const query = "SELECT * FROM guild_settings WHERE guild_id = ?;";
        return this.query(query, [guildId]);
    }

    // Set guild to continent link
    async addGuildContinent(guildId, continent) {
        const query = "INSERT INTO guild_continent_link (guild_id, continent) VALUES (?, ?);";
        return this.query(query, [guildId, continent]);
    }

    // Get guild to continent links
    async getGuildContinent(guildId) {
        const query = "SELECT DISTINCT continent FROM guild_continent_link WHERE guild_id = ?;";
        return this.query(query, [guildId]);
    }

    // Check if any link to a specific continent already exists
    async isContinentLinked(continent) {
        const query = "SELECT guild_id FROM guild_continent_link WHERE continent = ?;";
        const results = await this.query(query, [continent]);
        return results.length > 0;
    }

    // Get all links to all continents and guilds. Each continent can only be linked once, so using the latest entry for a continent.
    async getAllGuildContinentLinks() {
        const query = "SELECT guild_id, continent FROM guild_continent_link WHERE (continent, id) IN (SELECT continent, MAX(id) FROM guild_continent_link GROUP BY continent);";
        return this.query(query);
    }

    // set the tx_hash of a guild link
    async setGuildContinentTxHash(guildId, continent, txHash) {
        const query = "UPDATE guild_continent_link SET tx_hash = ? WHERE guild_id = ? AND continent = ?;";
        return this.query(query, [txHash, guildId, continent]);
    }

    // Add subscription to a guild
    async addSubscription(guildId, continent, subscription) {
        const query = `
            UPDATE guild_continent_link 
            SET 
                subscription_type = ?, 
                valid_until = CASE 
                    WHEN valid_until > NOW() THEN DATE_ADD(valid_until, INTERVAL 30 DAY)
                    ELSE DATE_ADD(NOW(), INTERVAL 30 DAY)
                END
            WHERE guild_id = ? AND continent = ?;
        `;
        return this.query(query, [subscription, guildId, continent]);
    }

    // Get the valid_until date of a subscription
    async getSubscriptionValidUntil(guildId) {
        const query = "SELECT continent, valid_until FROM guild_continent_link WHERE guild_id = ? AND continent IS NOT NULL;";
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results : null;
    }

    // Check if a continent's subscription is still valid and the correct type
    async checkSubscriptionValid(guild, subscription) {
        const query = "SELECT continent, subscription_type FROM guild_continent_link WHERE guild_id = ? AND subscription_type LIKE ? AND valid_until > NOW();";
        const results = await this.query(query, [guild, `%${subscription}%`]);
        return results.length > 0 ? results : null;
    }

    // Get all guild continent with a certain subscription_type
    async getGuildContinentWithSubscription(subscription) {
        const query = "SELECT guild_id, continent FROM guild_continent_link WHERE subscription_type LIKE ?;";
        return this.query(query, [`%${subscription}%`]);
    }

    // Check if a txHash already exists for another continent
    async checkTxHashExists(txHash) {
        const query = "SELECT continent FROM guild_continent_link WHERE tx_hash = ?;";
        const results = await this.query(query, [txHash]);
        return results.length > 0 ? results[0].continent : null;
    }

    // Get all the continents linked to a single guild
    async getGuildContinents(guildId) {
        const query = "SELECT continent FROM guild_continent_link WHERE guild_id = ?;";
        return this.query(query, [guildId]);
    }

    // Get all the continents' guilds and pledging channel IDs
    async getAllContinentPledgeChannels() {
        const query = `
        SELECT 
            gs.guild_id,
            gcl.continent,
            gs.pledgers_channel
        FROM 
            guild_settings gs
        LEFT JOIN 
            guild_continent_link gcl
        ON 
            gs.guild_id = gcl.guild_id
        WHERE 
            gcl.continent IS NOT NULL AND LENGTH(gs.pledgers_channel) > 2;
    `;
        return this.query(query);
    }

    // Get all the continents' guilds and buff channel IDs
    async getAllContinentBuffChannels() {
        const query = `
        SELECT 
            gs.guild_id,
            gcl.continent,
            gs.buff_channel
        FROM 
            guild_settings gs
        LEFT JOIN 
            guild_continent_link gcl
        ON 
            gs.guild_id = gcl.guild_id
        WHERE 
            gcl.continent IS NOT NULL AND LENGTH(gs.buff_channel) > 2;
    `;
        return this.query(query);
    }

    // Get guild logchannels of a specific alliance
    async getGuildLogChannelsByAlliance(allianceId) {
        const query = "SELECT accept_log_channel, reject_log_channel FROM guild_settings WHERE guild_id=(SELECT guild FROM allianceinf WHERE allianceId=?);";
        return this.query(query, [allianceId]);
    }

    // Get guild logchannels of a specific guild
    async getGuildLogChannels(guild) {
        const query = "SELECT accept_log_channel, reject_log_channel, verification_channel, titles_channel, pledgers_channel, buff_channel, ranking_channel, cmine_whitelist_channel, dsa_whitelist_channel, shop_log_channel, announcement_channel FROM guild_settings WHERE guild_id=?;";
        return this.query(query, [guild]);
    }

    // get channels managed by the bot
    async getManagedChannels(guild) {
        const query = "SELECT verification_channel, titles_channel, pledgers_channel, buff_channel, drago_lookup_channel, shop_channel, ranking_channel, cmine_whitelist_channel, dsa_whitelist_channel, shop_log_channel, announcement_channel FROM guild_settings WHERE guild_id=?;";
        return this.query(query, [guild]);
    }

    // Get all announcement channels of all guilds
    async getAllAnnouncementChannels() {
        const query = "SELECT guild_id, announcement_channel FROM guild_settings WHERE LENGTH(announcement_channel) > 2;";
        return this.query(query);
    }

    // Get guild blacklist log channel
    async getGuildBlacklistLogChannel(guild) {
        const query = "SELECT blacklist_log_channel FROM guild_settings WHERE guild_id=?;";
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

    // Set guild shop log channel
    async setGuildShopLogChannel(channel, guild) {
        const query = "UPDATE guild_settings SET shop_log_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild blacklist log channel
    async setGuildBlacklistLogChannel(channel, guild) {
        const query = "UPDATE guild_settings SET blacklist_log_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild announcement channel
    async setGuildAnnouncementChannel(channel, guild) {
        const query = "UPDATE guild_settings SET announcement_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild verification channel
    async setGuildVerificationChannel(channel, guild) {
        const query = "UPDATE guild_settings SET verification_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild titles channel
    async setGuildTitlesChannel(channel, guild) {
        const query = "UPDATE guild_settings SET titles_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild pledgers channel
    async setGuildPledgersChannel(channel, guild) {
        const query = "UPDATE guild_settings SET pledgers_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild buff channel
    async setGuildBuffChannel(channel, guild) {
        const query = "UPDATE guild_settings SET buff_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild drago lookup channel
    async setGuildDragoLookupChannel(channel, guild) {
        const query = "UPDATE guild_settings SET drago_lookup_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild ranking channel
    async setGuildRankingChannel(channel, guild) {
        const query = "UPDATE guild_settings SET ranking_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild shop channel
    async setGuildShopChannel(channel, guild) {
        const query = "UPDATE guild_settings SET shop_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild cmine whitelist channel
    async setGuildCmineWhitelistChannel(channel, guild) {
        const query = "UPDATE guild_settings SET cmine_whitelist_channel=? WHERE guild_id=?;";
        return this.query(query, [channel, guild]);
    }

    // Set guild dsa whitelist channel
    async setGuildDsaWhitelistChannel(channel, guild) {
        const query = "UPDATE guild_settings SET dsa_whitelist_channel=? WHERE guild_id=?;";
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

    // Set guild currency emoji
    async setGuildCurrencyEmoji(emoji, guildId) {
        const query = "UPDATE guild_settings SET emoji_id = ? WHERE guild_id = ?;";
        return this.query(query, [emoji, guildId]);
    }

    // Get guild currency emoji
    async getGuildCurrencyEmoji(guildId) {
        const query = "SELECT emoji_id FROM guild_settings WHERE guild_id = ?;";
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0].emoji_id : null;
    }

    // Check if a guild wants to remove roles from unverified discords
    async getUnverifyFlag(guild) {
        const query = "SELECT unverify FROM guild_settings WHERE guild_id=?;";
        const results = await this.query(query, [guild]);
        return results.length > 0 ? results[0].unverify === 1 : false;
    }

    // Set unverify setting for a specific guild
    async setUnverifyFlag(flag, guild) {
        const query = "UPDATE guild_settings SET unverify=? WHERE guild_id=?;";
        return this.query(query, [flag, guild]);
    }

    // Set unverified_period setting for a specific guild
    async setUnverifiedPeriod(period, guild) {
        const query = "UPDATE guild_settings SET unverified_period=? WHERE guild_id=?;";
        return this.query(query, [period, guild]);
    }

    // Get unverified_period setting for a specific guild
    async getUnverifiedPeriod(guild) {
        const query = "SELECT unverified_period FROM guild_settings WHERE guild_id=?;";
        const results = await this.query(query, [guild]);
        return results.length > 0 ? results[0].unverified_period : null;
    }

    // Set verification bonus settings for a specific guild
    async setVerificationBonuses(guildId, mainBonus, altBonus, bonusLimit, mainMinLevel = null, altMinLevel = null) {
        const query = "UPDATE guild_settings SET main_verify_bonus=?, alt_verify_bonus=?, bonus_limit=?, bonus_main_min_level=?, bonus_alt_min_level=? WHERE guild_id=?;";
        return this.query(query, [mainBonus, altBonus, bonusLimit, mainMinLevel, altMinLevel, guildId]);
    }

    // Set guild wallet address
    async setGuildWallet(wallet, guildId) {
        const query = "UPDATE guild_settings SET guild_wallet=? WHERE guild_id=?;";
        return this.query(query, [wallet, guildId]);
    }

    // Get guild wallet address
    async getGuildWallet(guildId) {
        const query = "SELECT guild_wallet FROM guild_settings WHERE guild_id=?;";
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0].guild_wallet : null;
    }

    // Set guild point price
    async setGuildPointPrice(price, guildId) {
        const query = "UPDATE guild_settings SET point_price=? WHERE guild_id=?;";
        return this.query(query, [price, guildId]);
    }

    // Get guild point price
    async getGuildPointPrice(guildId) {
        const query = "SELECT point_price FROM guild_settings WHERE guild_id=?;";
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0].point_price : null;
    }

    // Set guild land price
    async setGuildLandPrice(price, guildId) {
        const query = "UPDATE guild_settings SET land_point=? WHERE guild_id=?;";
        return this.query(query, [price, guildId]);
    }

    // Get guild land price
    async getGuildLandPrice(guildId) {
        const query = "SELECT land_point FROM guild_settings WHERE guild_id=?;";
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0].land_point : null;
    }

    // Set guild land point value
    async setGuildLandPoint(points, guildId) {
        const query = "UPDATE guild_settings SET land_point=? WHERE guild_id=?;";
        return this.query(query, [points, guildId]);
    }

    // Get guild land point value
    async getGuildLandPoint(guildId) {
        const query = "SELECT land_point FROM guild_settings WHERE guild_id=?;";
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0].land_point : null;
    }

    // Set guild rally point value
    async setGuildRallyPoint(points, guildId) {
        const query = "UPDATE guild_settings SET rally_point=? WHERE guild_id=?;";
        return this.query(query, [points, guildId]);
    }

    // Get guild rally point value
    async getGuildRallyPoint(guildId) {
        const query = "SELECT rally_point FROM guild_settings WHERE guild_id=?;";
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0].rally_point : null;
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

    // Get minimum level for verification bonus
    async getMinLevelForVerificationBonus(guildId) {
        const query = `SELECT bonus_main_min_level, bonus_alt_min_level FROM guild_settings WHERE guild_id = ?;`;
        const results = await this.query(query, [guildId]);
        if (results.length > 0) {
            return {
                mainMinLevel: results[0].bonus_main_min_level,
                altMinLevel: results[0].bonus_alt_min_level
            };
        }
        return null;
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
    
    // Lands management functions

    // Add a land ID to a guild
    async addGuildLand(landId, guildId) {
        const query = "INSERT INTO lands (land_id, guild_id) VALUES (?, ?);";
        return this.query(query, [landId, guildId]);
    }

    // Remove a land ID from a guild
    async removeGuildLand(landId, guildId) {
        const query = "DELETE FROM lands WHERE land_id = ? AND guild_id = ?;";
        return this.query(query, [landId, guildId]);
    }

    // Check if a land ID exists for a guild
    async checkGuildLand(landId, guildId) {
        const query = "SELECT id FROM lands WHERE land_id = ? AND guild_id = ?;";
        const results = await this.query(query, [landId, guildId]);
        return results.length > 0;
    }

    // Get all land IDs for a guild
    async getGuildLands(guildId) {
        const query = "SELECT land_id FROM lands WHERE guild_id = ? ORDER BY land_id ASC;";
        return this.query(query, [guildId]);
    }

    // Clear all land IDs for a guild
    async clearGuildLands(guildId) {
        const query = "DELETE FROM lands WHERE guild_id = ?;";
        return this.query(query, [guildId]);
    }

    // Get all guild IDs that have a specific land ID
    async getGuildsWithLand(landId) {
        const query = "SELECT guild_id FROM lands WHERE land_id = ?;";
        return this.query(query, [landId]);
    }

    // Scanner settings functions

    // Get all scanner settings
    async getAllScannerInfo() {
        const query = `SELECT * FROM scanner_settings;`;
        return this.query(query);
    }

    // Get scanner settings for a specific guild
    async getScannerSettings(guildId) {
        const query = `SELECT * FROM scanner_settings WHERE guild_id = ?;`;
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0] : null;
    }

    // Get all scanner statuses
    async getAllScannerStatuses() {
        const query = `SELECT guild_id, status FROM scanner_settings;`;
        return this.query(query);
    }

    // Set all scanner statuses to 0
    async resetAllScannerStatuses() {
        const query = `UPDATE scanner_settings SET status = 0;`;
        return this.query(query);
    }

    // Add a new scanner settings entry for a guild
    async addScannerSettings(guildId) {
        const query = `INSERT INTO scanner_settings (guild_id) VALUES (?);`;
        return this.query(query, [guildId]);
    }

    // Set a scanner status for a specific guild
    async setScannerStatus(guildId, status) {
        const query = `UPDATE scanner_settings SET status = ? WHERE guild_id = ?;`;
        return this.query(query, [status, guildId]);
    }

    // Get the free_days setting 
    async getFreeDays(guildId) {
        const query = `SELECT free_days FROM scanner_settings WHERE guild_id = ?;`;
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0].free_days : null;
    }

    // Set the free_days setting for a specific guild
    async setFreeDays(guildId, freeDays) {
        const query = `UPDATE scanner_settings SET free_days = ? WHERE guild_id = ?;`;
        return this.query(query, [freeDays, guildId]);
    }

    // Get the cmine_lvl and dsa_lvl settings
    async getCmineAndDsaLevels(guildId) {
        const query = `SELECT cmine_lvl, dsa_lvl FROM scanner_settings WHERE guild_id = ?;`;
        const results = await this.query(query, [guildId]);
        return results.length > 0 ? results[0] : null;
    }

    // Set the cmine_lvl and dsa_lvl settings for a specific guild
    async setCmineAndDsaLevels(guildId, cmineLvl, dsaLvl) {
        const query = `UPDATE scanner_settings SET cmine_lvl = ?, dsa_lvl = ? WHERE guild_id = ?;`;
        return this.query(query, [cmineLvl, dsaLvl, guildId]);
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

    // Get a list of past kingdom names by Id
    async getPastKingdomNames(kingdomId) {
        const query = `
            SELECT date, name, MIN(id) as first_seen_id
            FROM info
            WHERE kingdomId = ?
            GROUP BY name
            ORDER BY first_seen_id ASC
        `;
        return this.query(query, [kingdomId]);
    }

    // Get a kingdom's name and alliance
    async getKingdomNameAndAlliance(kingdomId) {
        const query = "SELECT name, allianceId, allianceTag FROM info WHERE kingdomId=? ORDER BY id DESC";
        return this.query(query, [kingdomId]);
    }

    // Get a kingdom's castle level
    async getKingdomLevel(kingdomId) {
        const query = "SELECT level FROM info WHERE kingdomId=? ORDER BY id DESC LIMIT 1";
        return this.query(query, [kingdomId]);
    }

    // Get kills of a kingdom
    async getKingdomKills(kingdomId) {
        const query = "SELECT kills FROM info WHERE kingdomId=? ORDER BY id DESC LIMIT 1";
        return this.query(query, [kingdomId]);
    }

    // Get latest kingdom location
    async getKingdomLocation(kingdomId) {
        const query = "SELECT continent, x, y FROM info WHERE kingdomId=? AND continent > 0 ORDER BY id DESC LIMIT 1";
        return this.query(query, [kingdomId]);
    }

    // Get a Kingdom's continent
    async getKingdomContinent(kingdomId) {
        const query = "SELECT continent FROM info WHERE kingdomId=? ORDER BY id DESC LIMIT 1";
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
        INSERT INTO info (allianceId, allianceTag, kingdomId, name, level, lord, power, kills, death, victory, defeat, gathering, continent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        return this.query(query, values);
    }

    // Update a user in info
    async updateFullKingdomInfo(values) {
        const query = `
        INSERT INTO info (allianceId, allianceTag, kingdomId, name, level, lord, power, kills, death, victory, defeat, gathering, continent, x, y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        return this.query(query, values);
    }

    // Get the latest info entry for a kingdom
    async getLatestKingdomInfo(kingdomId) {
        const query = `
        SELECT * FROM info 
        WHERE kingdomId = ? 
        AND id IN (SELECT MAX(id) FROM info WHERE kingdomId = ?)
        ORDER BY id DESC LIMIT 1;
    `;
        return this.query(query, [kingdomId, kingdomId]);
    }

    // Staking transactions functions

    // Insert a new staking transaction
    async insertStakingTransaction(hash, fromAddress, continent, amount, timestamp, comment, isStaking) {
        const query = `
        INSERT INTO staking_transactions (hash, from_address, continent, amount, timestamp, comment, is_staking)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE timestamp = ?;
    `;
        return this.query(query, [hash, fromAddress, continent, amount, timestamp, comment, isStaking, timestamp]);
    }

    // Get the latest transaction timestamp
    async getLatestStakingTimestamp() {
        const query = `SELECT timestamp FROM staking_transactions ORDER BY timestamp DESC LIMIT 1;`;
        const results = await this.query(query);
        return results.length > 0 ? results[0].timestamp : 0;
    }

    // Get the net staking amount per continent
    async getNetStakingByContinent() {
        const query = `
        SELECT continent, SUM(amount) as total_amount
        FROM staking_transactions
        GROUP BY continent
        ORDER BY total_amount DESC;
    `;
        return this.query(query);
    }

    // Update the comment for a specific address
    async updateStakingComment(fromAddress, comment) {
        const query = `UPDATE staking_transactions SET comment = ? WHERE from_address = ?;`;
        return this.query(query, [comment, fromAddress]);
    }

    // Get distinct addresses for comment updates
    async getDistinctStakingAddresses() {
        const query = `SELECT DISTINCT from_address FROM staking_transactions;`;
        return this.query(query);
    }

    // Get the addresses, comments and sum stake of each address for a specific continent
    async getIndividualPledgeTotal(guildId) {
        const query = `
                        SELECT st.from_address, st.comment, SUM(st.amount) AS sum
                        FROM staking_transactions st
                        WHERE st.continent = (
                            SELECT continent 
                            FROM guild_continent_link 
                            WHERE guild_id = ?
                            LIMIT 1
                        )
                        GROUP BY st.from_address
                        HAVING SUM(st.amount) > 0.1
                        ORDER BY SUM(st.amount) DESC;
                    `;
        return this.query(query, [guildId]);
    }

    // Buffs functions

    // Insert the newest buff message of a guild in the database.
    async insertBuffMessage(messageid, bufftype, guildId) {
        return this.query('INSERT INTO buffs (message_id, buff_type, guild_id) VALUES (?, ?, ?);', [messageid, bufftype, guildId]);
    }

    // Get the latest message of a buff type in a guild.
    async getLatestBuffMessage(bufftype, guildId) {
        return this.query('SELECT message_id FROM buffs WHERE buff_type = ? AND guild_id = ? ORDER BY id DESC LIMIT 1;', [bufftype, guildId]);
    }

    // get a random gif from the database.
    async getRandomGif(bufftype, guildId) {
        return this.query('SELECT gif_link FROM buff_gifs WHERE buff_type = ? AND guild_id = ? ORDER BY RAND() LIMIT 1;', [bufftype, guildId]);
    }

    // Insert a new gif into the database.
    async insertNewGif(bufftype, giflink, guildId) {
        return this.query('INSERT INTO buff_gifs (buff_type, gif_link, guild_id) VALUES (?, ?, ?);', [bufftype, giflink, guildId]);
    }

    // Delete a gif from the database.
    async deleteGif(giflink, guildId) {
        return this.query('DELETE FROM buff_gifs WHERE gif_link = ? AND guild_id = ?;', [giflink, guildId]);
    }

    // Rallies functions

    // Add a rally to the database
    async addRally(rallyId, kingdomId, rallyType, guildId) {
        const query = `
            INSERT IGNORE INTO rallies (rally_id, by_kingdom_id, type, guild_id)
            VALUES (?, ?, ?, ?);
        `;
        return this.query(query, [rallyId, kingdomId, rallyType, guildId]);
    }

    // Get the amount of rallies done by a kingdom in the last month
    async getRalliesCount(kingdomId, guildId) {
        const query = `
            SELECT COUNT(*) as count 
            FROM rallies 
            WHERE by_kingdom_id = ? AND guild_id = ? AND timestamp >= NOW() - INTERVAL 30 DAY;
        `;
        const results = await this.query(query, [kingdomId, guildId]);
        return results.length > 0 ? results[0].count : 0;
    }

    // Add a rally joiner to the database
    async addRallyJoiner(rallyId, joinerKingdomId, guildId) {
        const query = `
            INSERT IGNORE INTO rally_joiners (rally_id, joiner_kingdom_id, guild_id)
            VALUES (?, ?, ?);
        `;
        return this.query(query, [rallyId, joinerKingdomId, guildId]);
    }

    // Check if a rally joiner already exists
    async checkRallyJoiner(rallyId, joinerKingdomId, guildId) {
        const query = 'SELECT id FROM rally_joiners WHERE rally_id = ? AND joiner_kingdom_id = ? AND guild_id = ?';
        const result = await this.query(query, [rallyId, joinerKingdomId, guildId]);
        return result.length > 0;
    }

    // Get rally joiners for a specific rally
    async getRallyJoiners(rallyId, guildId) {
        const query = 'SELECT joiner_kingdom_id, timestamp FROM rally_joiners WHERE rally_id = ? AND guild_id = ?';
        return this.query(query, [rallyId, guildId]);
    }

    // Get player's rallies rank based on both startDate and endDate, using the most recent name from info
    async getRalliesRankByStartAndEndDate(guildId, startDate, endDate) {
        const query = `
            SELECT r.by_kingdom_id, i.name, COUNT(*) as rally_count
            FROM rallies r
            LEFT JOIN (
                SELECT kingdomId, name
                FROM info
                WHERE id IN (
                    SELECT MAX(id) FROM info GROUP BY kingdomId
                )
            ) i ON r.by_kingdom_id = i.kingdomId
            WHERE r.guild_id = ? AND r.timestamp >= ? AND r.timestamp <= ?
            GROUP BY r.by_kingdom_id, i.name
            ORDER BY rally_count DESC
            LIMIT 100
        `;
        return this.query(query, [guildId, startDate, endDate]);
    }

    // Get the player's rallies rank based on the startDate alone, using the most recent name from info
    async getRalliesRankByStartDate(guildId, startDate) {
        const query = `
            SELECT r.by_kingdom_id, i.name, COUNT(*) as rally_count
            FROM rallies r
            LEFT JOIN (
                SELECT kingdomId, name
                FROM info
                WHERE id IN (
                    SELECT MAX(id) FROM info GROUP BY kingdomId
                )
            ) i ON r.by_kingdom_id = i.kingdomId
            WHERE r.guild_id = ? AND r.timestamp >= ?
            GROUP BY r.by_kingdom_id, i.name
            ORDER BY rally_count DESC
            LIMIT 100
        `;
        return this.query(query, [guildId, startDate]);
    }

    // Get the player's rallies rank based on the endDate alone, using the most recent name from info
    async getRalliesRankByEndDate(guildId, endDate) {
        const query = `
            SELECT r.by_kingdom_id, i.name, COUNT(*) as rally_count
            FROM rallies r
            LEFT JOIN (
                SELECT kingdomId, name
                FROM info
                WHERE id IN (
                    SELECT MAX(id) FROM info GROUP BY kingdomId
                )
            ) i ON r.by_kingdom_id = i.kingdomId
            WHERE r.guild_id = ? AND r.timestamp <= ?
            GROUP BY r.by_kingdom_id, i.name
            ORDER BY rally_count DESC
            LIMIT 100
        `;
        return this.query(query, [guildId, endDate]);
    }

    // Get the player's rallies rank based on all time, using the most recent name from info
    async getRalliesRankAllTime(guildId) {
        const query = `
            SELECT r.by_kingdom_id, i.name, COUNT(*) as rally_count
            FROM rallies r
            LEFT JOIN (
                SELECT kingdomId, name
                FROM info
                WHERE id IN (
                    SELECT MAX(id) FROM info GROUP BY kingdomId
                )
            ) i ON r.by_kingdom_id = i.kingdomId
            WHERE r.guild_id = ?
            GROUP BY r.by_kingdom_id, i.name
            ORDER BY rally_count DESC
            LIMIT 100
        `;
        return this.query(query, [guildId]);
    }

    // Get rally participation for a specific date range
    async getRallyParticipationByDate(guildId, startDate, endDate) {
        const query = `
            SELECT r.by_kingdom_id, i.name, COUNT(*) as rally_count
            FROM rallies r
            LEFT JOIN (
                SELECT kingdomId, name
                FROM info
                WHERE id IN (
                    SELECT MAX(id) FROM info GROUP BY kingdomId
                )
            ) i ON r.by_kingdom_id = i.kingdomId
            WHERE r.guild_id = ? AND r.timestamp >= ? AND r.timestamp <= ?
            GROUP BY r.by_kingdom_id, i.name
            ORDER BY rally_count DESC
        `;
        return this.query(query, [guildId, startDate, endDate]);
    }

    // Get rally joiner participation for a specific date range
    async getRallyJoinerParticipationByDate(guildId, startDate, endDate) {
        const query = `
            SELECT rj.joiner_kingdom_id, i.name, COUNT(*) as join_count
            FROM rally_joiners rj
            LEFT JOIN (
                SELECT kingdomId, name
                FROM info
                WHERE id IN (
                    SELECT MAX(id) FROM info GROUP BY kingdomId
                )
            ) i ON rj.joiner_kingdom_id = i.kingdomId
            WHERE rj.guild_id = ? AND rj.timestamp >= ? AND rj.timestamp <= ?
            GROUP BY rj.joiner_kingdom_id, i.name
            ORDER BY join_count DESC
        `;
        return this.query(query, [guildId, startDate, endDate]);
    }

    // Subscription functions

    // Get subscription costs
    async getSubscriptionCosts() {
        return this.query("SELECT subscription, cost FROM subscriptions");
    }

    // Store a new pending payment
    async storePendingPayment(userId, guildId, continent, selected, totalCost, timestamp) {
        const query = `
            INSERT INTO pending_payments (user_id, guild_id, continent, selected_subscriptions, total_cost, timestamp)
            VALUES (?, ?, ?, ?, ?, ?);
        `;
        return this.query(query, [userId, guildId, continent, selected, totalCost, timestamp]);
    }

    // Delete the most recent pending payment
    async deletePendingPayment(userId, guildId) {
        const query = `
            DELETE FROM pending_payments 
            WHERE user_id = ? AND guild_id = ? 
            ORDER BY timestamp DESC LIMIT 1;
        `;
        return this.query(query, [userId, guildId]);
    }

    // Get the most recent pending payment
    async getPendingPayment(userId, guildId) {
        const query = `
            SELECT * FROM pending_payments 
            WHERE user_id = ? AND guild_id = ? 
            ORDER BY timestamp DESC LIMIT 1;
        `;
        return this.query(query, [userId, guildId]);
    }

    // mines functions

    // Inser a new mine into the mines table
    async insertMineData(mine) {
        return this.query(`
            INSERT INTO mines (
                fid, zone, code, continent, guild, x, y, level, value, expired,
                location, allianceTag, kingdomId, name, targetValue, diff, started, ended
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            mine.fid,
            mine.zone,
            mine.code,
            mine.continent,
            mine.guild,
            mine.x,
            mine.y,
            mine.level,
            mine.value,
            mine.expired || null,
            mine.location || null,
            mine.allianceTag || null,
            mine.kingdomId || null,
            mine.name || null,
            mine.targetValue || null,
            mine.diff || null,
            mine.started || null,
            mine.ended || null,
        ]);
    }

    // Bulk insert mines into the mines table
    async insertMineDataBulk(mines) {
        if (!mines.length) return;

        const columns = [
            "fid", "zone", "code", "continent", "guild", "x", "y", "level", "value", "expired",
            "location", "allianceTag", "kingdomId", "name", "targetValue", "diff", "started", "ended"
        ];

        const placeholders = mines.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
        const values = [];

        for (const mine of mines) {
            values.push(
                mine.fid,
                mine.zone,
                mine.code,
                mine.continent,
                mine.guild,
                mine.x,
                mine.y,
                mine.level,
                mine.value,
                mine.expired || null,
                mine.location || null,
                mine.allianceTag || null,
                mine.kingdomId || null,
                mine.name || null,
                mine.targetValue || null,
                mine.diff || null,
                mine.started || null,
                mine.ended || null
            );
        }

        const sql = `
            INSERT INTO mines (
                ${columns.join(', ')}
            ) VALUES ${placeholders}
        `;

        return this.query(sql, values);
    }

    // Clear all entries older than 24h based on created_at timestamp
    async clearOldMines() {
        const query = `
            DELETE FROM mines 
            WHERE created_at < NOW() - INTERVAL 24 HOUR;
        `;
        return this.query(query);
    }

    // illegal reports functuons

    // Check if a mine is already reported
    async checkIllegalMine(fid, kingdomId, guild) {
        const results = await this.query(
            "SELECT * FROM illegal WHERE fid = ? AND kingdomid = ? AND guild = ?",
            [fid, kingdomId, guild]
        );
        return results.length > 0;
    }

    // Add a new illegal mine report
    async insertIllegalMine(record) {
        return this.query(
            `INSERT INTO illegal (fid, code, name, x, y, allianceTag, started, kingdomid, level, value, cont, guild)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.fid,
                record.code,
                record.name,
                record.x,
                record.y,
                record.allianceTag,
                record.started,
                record.kingdomId,
                record.level,
                record.value,
                record.continent,
                record.guild,
            ]
        );
    }

    // Bulk check for already reported illegal mines
    async checkIllegalMinesBulk(fids, guild) {
        if (!fids.length) return [];
        const placeholders = fids.map(() => '?').join(',');
        const query = `SELECT fid FROM illegal WHERE fid IN (${placeholders}) AND guild = ?`;
        const results = await this.query(query, [...fids, guild]);
        return results.map(row => row.fid);
    }

    // Bulk insert illegal mines
    async insertIllegalMinesBulk(records) {
        if (!records.length) return;
        const columns = [
            "fid", "code", "name", "x", "y", "allianceTag", "started", "kingdomid", "level", "value", "cont", "guild"
        ];
        const placeholders = records.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
        const values = [];
        for (const r of records) {
            values.push(
                r.fid, r.code, r.name, r.x, r.y, r.allianceTag, r.started, r.kingdomId, r.level, r.value, r.continent, r.guild
            );
        }
        const sql = `INSERT INTO illegal (${columns.join(',')}) VALUES ${placeholders}`;
        return this.query(sql, values);
    }

    // Whitelist functions

    // Get all whitelisted kingdoms for a specific guild and continent
    async getWhitelist(guild, continent) {
        return this.query(
            `SELECT w.kingdomid, i.name, 
                    MAX(w.dsa) as dsa, 
                    MAX(w.cmine) as cmine,
                    MIN(CASE WHEN w.dsa > '0' THEN w.expiry END) as dsa_expiry,
                    MIN(CASE WHEN w.cmine > '0' THEN w.expiry END) as cmine_expiry,
                    COUNT(*) as license_count
             FROM whitelist w
             LEFT JOIN (
                SELECT kingdomId, name
                FROM info
                WHERE id IN (SELECT MAX(id) FROM info GROUP BY kingdomId)
             ) i ON w.kingdomid = i.kingdomId
             WHERE w.continent = ? AND w.guild = ? 
             AND (w.dsa > '0' OR w.cmine > '0')
             AND (w.expiry IS NULL OR w.expiry > NOW())
             GROUP BY w.kingdomid, i.name
             HAVING MAX(w.dsa) > '0' OR MAX(w.cmine) > '0'
             ORDER BY i.name`,
            [continent, guild]
        );
    }

    // Add/edit a kingdom to the whitelist
    async addToWhitelist(kingdomId, continent, guild, dsa, cmine, expiry = null) {
        // For temporary licenses, check if an existing entry with same type and level exists
        if (expiry !== null) {
            // Check for existing entries with same kingdom, type, and level
            const existingEntries = await this.query(
                `SELECT * FROM whitelist 
                 WHERE kingdomid = ? AND continent = ? AND guild = ? 
                 AND expiry IS NOT NULL
                 AND ((dsa = ? AND dsa > 0) OR (cmine = ? AND cmine > 0))
                 ORDER BY expiry DESC LIMIT 1`,
                [kingdomId, continent, guild, dsa, cmine]
            );

            if (existingEntries && existingEntries.length > 0) {
                const existing = existingEntries[0];
                // Check if the levels match exactly for the same type
                const dsaLevel = parseInt(dsa) || 0;
                const cmineLevel = parseInt(cmine) || 0;
                const existingDsaLevel = parseInt(existing.dsa) || 0;
                const existingCmineLevel = parseInt(existing.cmine) || 0;

                // If DSA levels match (and we're adding DSA) or CMINE levels match (and we're adding CMINE)
                const dsaMatches = (dsaLevel > 0 && dsaLevel === existingDsaLevel);
                const cmineMatches = (cmineLevel > 0 && cmineLevel === existingCmineLevel);

                if (dsaMatches || cmineMatches) {
                    // Extend the existing entry by calculating new expiry
                    const existingExpiry = new Date(existing.expiry);
                    const newExpiryDate = new Date(expiry);
                    const currentTime = new Date();

                    // Calculate the duration being added
                    const durationToAdd = newExpiryDate.getTime() - currentTime.getTime();

                    // Add duration to existing expiry (if existing expiry is in the future) or current time (if expired)
                    const baseTime = existingExpiry > currentTime ? existingExpiry : currentTime;
                    const extendedExpiry = new Date(baseTime.getTime() + durationToAdd);
                    const extendedExpiryString = extendedExpiry.toISOString().slice(0, 19).replace('T', ' ');

                    // Update the existing entry with extended expiry
                    const result = await this.query(
                        `UPDATE whitelist SET expiry = ? WHERE id = ?`,
                        [extendedExpiryString, existing.id]
                    );
                    return { success: true, extended: true, originalExpiry: existing.expiry, newExpiry: extendedExpiryString };
                }
            }

            // If no matching entry found or levels are different, create new entry
            const result = await this.query(
                `INSERT INTO whitelist (kingdomid, continent, guild, dsa, cmine, expiry)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [kingdomId, continent, guild, dsa, cmine, expiry]
            );
            return { success: true, extended: false, newExpiry: expiry };
        } else {
            // For permanent licenses, use ON DUPLICATE KEY UPDATE to replace existing permanent license
            const result = await this.query(
                `INSERT INTO whitelist (kingdomid, continent, guild, dsa, cmine, expiry)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE dsa = ?, cmine = ?`,
                [kingdomId, continent, guild, dsa, cmine, expiry, dsa, cmine]
            );
            return { success: true, extended: false, permanent: true };
        }
    }

    // Check if a kingdom is whitelisted and return whitelist levels
    async checkWhitelistStatus(kingdomId, continent, guild) {
        const results = await this.query(
            `SELECT MAX(w.dsa) as dsa, MAX(w.cmine) as cmine,
             MIN(expiry) as earliest_expiry
             FROM whitelist w
             WHERE kingdomid = ? AND continent = ? AND guild = ?
             AND (expiry IS NULL OR expiry > NOW())
             AND (dsa > '0' OR cmine > '0')`,
            [kingdomId, continent, guild]
        );

        // If no results or both dsa and cmine are '0', return null
        if (results.length === 0 || (results[0].dsa === '0' && results[0].cmine === '0')) {
            return null;
        }

        return {
            dsa: results[0].dsa,
            cmine: results[0].cmine,
            expiry: results[0].earliest_expiry
        };
    }

    // Get all licenses for a specific kingdom (for admin/debugging purposes)
    async getKingdomLicenses(kingdomId, continent, guild) {
        return this.query(
            `SELECT id, dsa, cmine, expiry, created_at
             FROM whitelist 
             WHERE kingdomid = ? AND continent = ? AND guild = ?
             AND (expiry IS NULL OR expiry > NOW())
             AND (dsa > 0 OR cmine > 0)
             ORDER BY expiry ASC, created_at DESC`,
            [kingdomId, continent, guild]
        );
    }

    // Check verified kingdoms with whitelist from discordId
    async checkVerifiedKingdomsWithWhitelist(discordId, guildId) {
        // Get verified kingdoms for this discord user in this guild
        const verifiedKingdoms = await this.query(
            `SELECT kingdomId, kingdomName, guild
             FROM verified
             WHERE discordId = ? AND guild = ?`,
            [discordId, guildId]
        );

        if (!verifiedKingdoms || verifiedKingdoms.length === 0) {
            return null;
        }

        const results = [];
        for (const kingdom of verifiedKingdoms) {
            // Check whitelist status for this kingdom in this guild
            const whitelistResult = await this.query(
                `SELECT MAX(w.dsa) as dsa, MAX(w.cmine) as cmine,
                 MIN(w.expiry) as earliest_expiry
                 FROM whitelist w
                 WHERE w.kingdomid = ? AND w.guild = ?
                 AND (w.expiry IS NULL OR w.expiry > NOW())
                 AND (w.dsa > '0' OR w.cmine > '0')`,
                [kingdom.kingdomId, guildId]
            );

            if (whitelistResult.length > 0 && (whitelistResult[0].dsa !== '0' || whitelistResult[0].cmine !== '0')) {
                results.push({
                    kingdomId: kingdom.kingdomId,
                    kingdomName: kingdom.kingdomName,
                    guild: kingdom.guild,
                    dsa: whitelistResult[0].dsa,
                    cmine: whitelistResult[0].cmine,
                    expiry: whitelistResult[0].earliest_expiry
                });
            }
        }

        return results.length > 0 ? results : null;
    }

    // Clean up expired licenses (removes expired temporary licenses)
    async cleanupExpiredLicenses() {
        return this.query(
            `DELETE FROM whitelist 
             WHERE expiry IS NOT NULL AND expiry <= NOW()`
        );
    }

    // Remove a kingdom from the whitelist completely (set dsa and cmine to 0)
    async removeFromWhitelist(kingdomId, continent, guild) {
        return this.query(
            `UPDATE whitelist SET dsa = '0', cmine = '0' WHERE kingdomid = ? AND continent = ? AND guild = ?`,
            [kingdomId, continent, guild]
        );
    }

    // remove a kingdom from the whitelist where no expiry is set (set dsa and cmine to 0)
    async removeFromWhitelistNoExpiry(kingdomId, continent, guild) {
        return this.query(
            `UPDATE whitelist SET dsa = '0', cmine = '0' WHERE kingdomid = ? AND continent = ? AND guild = ? AND expiry IS NULL`,
            [kingdomId, continent, guild]
        );
    }

    // remove a kingdom from the whitelist where expiry is set (set dsa and cmine to 0)
    async removeFromWhitelistWithExpiry(kingdomId, continent, guild) {
        return this.query(
            `UPDATE whitelist SET dsa = '0', cmine = '0' WHERE kingdomid = ? AND continent = ? AND guild = ? AND expiry IS NOT NULL`,
            [kingdomId, continent, guild]
        );
    }

    // Reset all whitelisted kingdoms for a specific guild and continent (set dsa and cmine to 0)
    async resetWhitelist(guild, continent) {
        return this.query(
            `UPDATE whitelist SET dsa = '0', cmine = '0' WHERE guild = ? AND continent = ? AND expiry IS NULL`,
            [guild, continent]
        );
    }

    // System tables functions

    // Utils functions

    // Get XOR password
    async getXORPass() {
        return this.query("SELECT value FROM utils WHERE name='password'");
    }

    // Add XOR password
    async updateXORPass(value) {
        return this.query("UPDATE utils SET value=? WHERE name='password'", [value]);
    }

    // Proxies functions

    // Get proxies
    async getProxies() {
        return this.query("SELECT ip FROM proxies");
    }

    // Get proxy except specific IP
    async getProxyExcept(ip) {
        const query = "SELECT ip FROM proxies WHERE ip != ?";
        return this.query(query, [ip]);
    }

    // Shop functions

    // Get shop items for a guild
    async getShopItems(guildId) {
        const query = "SELECT * FROM shop_items WHERE guild_id = ? ORDER BY name ASC;";
        return this.query(query, [guildId]);
    }

    // Get a specific shop item
    async getShopItem(itemId, guildId) {
        const query = "SELECT * FROM shop_items WHERE id = ? AND guild_id = ?;";
        const results = await this.query(query, [itemId, guildId]);
        return results.length > 0 ? results[0] : null;
    }

    // Add a new shop item
    async addShopItem(guildId, name, price, stock, description = null, type = null, level = null, duration = null) {
        const query = "INSERT INTO shop_items (guild_id, name, price, stock, description, type, level, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?);";
        return this.query(query, [guildId, name, price, stock, description, type, level, duration]);
    }

    // Update shop item
    async updateShopItem(itemId, guildId, name, price, stock, description = null, type = null, level = null, duration = null) {
        const query = "UPDATE shop_items SET name = ?, price = ?, stock = ?, description = ?, type = ?, level = ?, duration = ? WHERE id = ? AND guild_id = ?;";
        return this.query(query, [name, price, stock, description, type, level, duration, itemId, guildId]);
    }

    // Delete shop item
    async deleteShopItem(itemId, guildId) {
        const query = "DELETE FROM shop_items WHERE id = ? AND guild_id = ?;";
        return this.query(query, [itemId, guildId]);
    }

    // Purchase item (decrease stock)
    async purchaseShopItem(itemId, guildId, quantity = 1) {
        const query = "UPDATE shop_items SET stock = stock - ? WHERE id = ? AND guild_id = ? AND stock >= ?;";
        const result = await this.query(query, [quantity, itemId, guildId, quantity]);
        return result.affectedRows > 0;
    }

    // Log shop purchase
    async logShopPurchase(guildId, userId, itemId, quantity, totalPrice) {
        const query = "INSERT INTO shop_purchases (guild_id, user_id, item_id, quantity, total_price) VALUES (?, ?, ?, ?, ?);";
        return this.query(query, [guildId, userId, itemId, quantity, totalPrice]);
    }

    // Get shop purchase history
    async getShopPurchaseHistory(guildId, limit = 50) {
        const query = `
            SELECT sp.*, si.name as item_name, sp.created_at
            FROM shop_purchases sp
            JOIN shop_items si ON sp.item_id = si.id
            WHERE sp.guild_id = ?
            ORDER BY sp.created_at DESC
            LIMIT ?;
        `;
        return this.query(query, [guildId, limit]);
    }

    // Points management functions

    // Get user's total points balance in a guild
    async getUserPointsBalance(userId, guildId) {
        const query = "SELECT COALESCE(SUM(amount), 0) as balance FROM points_transactions WHERE discord_id = ? AND guild_id = ?;";
        const results = await this.query(query, [userId, guildId]);
        return results.length > 0 ? results[0].balance : 0;
    }

    // Check if user has enough points for a purchase
    async userCanAfford(userId, guildId, cost) {
        const balance = await this.getUserPointsBalance(userId, guildId);
        return balance >= cost;
    }

    // Deduct points from user for a purchase
    async deductUserPoints(userId, guildId, amount, reason = 'shop purchase') {
        const query = "INSERT INTO points_transactions (discord_id, guild_id, amount, reason) VALUES (?, ?, ?, ?);";
        return this.query(query, [userId, guildId, -Math.abs(amount), reason]);
    }

    // Get user's points transaction history
    async getUserPointsHistory(userId, guildId, limit = 50) {
        const query = "SELECT * FROM points_transactions WHERE discord_id = ? AND guild_id = ? ORDER BY timestamp DESC LIMIT ?;";
        return this.query(query, [userId, guildId, limit]);
    }

    // Add or remove points from a user (for admin purposes)
    async addUserPoints(userId, guildId, amount, reason = 'admin change') {
        const query = "INSERT INTO points_transactions (discord_id, guild_id, amount, reason) VALUES (?, ?, ?, ?);";
        return this.query(query, [userId, guildId, amount, reason]); // Remove Math.abs to allow negative values
    }

    // Log points change for audit purposes
    async logPointsChange(guildId, userId, amount, reason, type = 'manual') {
        // This function can be used for additional logging if needed
        // For now, the transaction is already logged in addUserPoints/deductUserPoints
        // But we can add additional audit logging here if required
        console.log(`Points change logged: Guild ${guildId}, User ${userId}, Amount ${amount}, Reason: ${reason}, Type: ${type}`);
        return true;
    }

    // Check if user has already received a main verification bonus in a guild
    async hasReceivedMainVerificationBonus(userId, guildId) {
        const query = `SELECT COUNT(*) as count FROM points_transactions WHERE discord_id = ? AND guild_id = ? AND reason = 'main verification bonus';`;
        const result = await this.query(query, [userId, guildId]);
        return result[0].count > 0;
    }

    // Get the total count of verification bonuses (both main and alt) received by a user in a guild
    async getTotalVerificationBonusCount(userId, guildId) {
        const query = `SELECT COUNT(*) as count FROM points_transactions WHERE discord_id = ? AND guild_id = ? AND reason IN ('main verification bonus', 'alt verification bonus');`;
        const result = await this.query(query, [userId, guildId]);
        return result[0].count;
    }

    // DST Transaction functions

    // Get all guild wallets that have a wallet address set
    async getGuildWallets() {
        const query = "SELECT guild_id, guild_wallet FROM guild_settings WHERE guild_wallet IS NOT NULL AND guild_wallet != '' AND guild_wallet != '0'";
        return this.query(query);
    }

    // Check if a DST transaction was already processed
    async isDSTTransactionProcessed(txHash, guildId) {
        const query = "SELECT id FROM dst_transactions WHERE tx_hash = ? AND guild_id = ? AND points_awarded > 0";
        const results = await this.query(query, [txHash, guildId]);
        return results.length > 0;
    }

    // Log DST transaction for audit purposes
    async logDSTTransaction(txHash, guildId, fromWallet, dstAmount, pointsAwarded, notes) {
        const query = `
            INSERT INTO dst_transactions (tx_hash, guild_id, from_wallet, dst_amount, points_awarded, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                points_awarded = VALUES(points_awarded),
                notes = VALUES(notes),
                updated_at = CURRENT_TIMESTAMP
        `;
        return this.query(query, [txHash, guildId, fromWallet, dstAmount, pointsAwarded, notes]);
    }

    // Get guild notification channel for DST transactions (shop_log_channel or accept_log_channel as fallback)
    async getGuildDSTNotificationChannel(guildId) {
        const query = "SELECT shop_log_channel, accept_log_channel FROM guild_settings WHERE guild_id=?;";
        const results = await this.query(query, [guildId]);
        if (results.length > 0) {
            const channels = results[0];
            return channels.shop_log_channel || channels.accept_log_channel;
        }
        return null;
    }
}

module.exports = sqlFunctions;