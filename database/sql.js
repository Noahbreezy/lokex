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

    // Get a queen token of a guild
    async getQueenToken(guildId) {
        const query = `SELECT token FROM botAccounts WHERE guild = ? AND role = 'QUEEN';`;
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

    // Get a random token from a specific guild
    async getRandomManagerTokenFromGuild(guild) {
        const query = `SELECT token FROM botAccounts WHERE guild = ? AND role = 'MANAGER' ORDER BY RAND() LIMIT 1;`;
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
        const query = "SELECT kingdomId FROM verified WHERE kingdomId=? AND guild=? AND status=1";
        const results = await this.query(query, [kingdomId, guild]);
        return results.length > 0;
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

    // Check if a discord user has more than one verified kingdom
    async checkVerifiedKingdoms(discordId, guild) {
        const query = 'SELECT kingdomId, kingdomName FROM verified WHERE discordId = ? AND guild = ?';
        const results = await this.query(query, [discordId, guild]);
        return results.length > 0 ? results : false;
    }

    // Get kingdoms and Discord users that need status/role changes
    async getUnlinkedKingdomsAndRoles(days = 7) {
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
        const query = "SELECT accept_log_channel, reject_log_channel, verification_channel, titles_channel, pledgers_channel, buff_channel, ranking_channel, cmine_whitelist_channel, dsa_whitelist_channel FROM guild_settings WHERE guild_id=?;";
        return this.query(query, [guild]);
    }

    // get channels managed by the bot
    async getManagedChannels(guild) {
        const query = "SELECT verification_channel, titles_channel, pledgers_channel, buff_channel, ranking_channel, cmine_whitelist_channel, dsa_whitelist_channel FROM guild_settings WHERE guild_id=?;";
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

    // Set guild ranking channel
    async setGuildRankingChannel(channel, guild) {
        const query = "UPDATE guild_settings SET ranking_channel=? WHERE guild_id=?;";
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

    // Check if a channel exists in the settings already for a specific guild
    async channelExists(channel, guild) {
        const query = `SELECT ${channel} FROM guild_settings WHERE guild_id = ?;`;
        return this.query(query, [guild]);
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
}

module.exports = sqlFunctions;