const Encryption = require('../../encryption/encryption.js');

class RallyLogger {
    constructor(options, sqlInstance, api) {
        this.sql = sqlInstance;
        this.api = api;
        this.encryption = new Encryption();
        this.allianceId = options.settings.allianceId;
        this.allianceTag = options.settings.allianceTag;
        this.logRallies();
    }

    async logRallies() {
        while (true) {
            try {
                // console.log("Checking rallies: ", this.allianceTag);
                let tokenResponseFlag = false;

                const tokenResponse = (await this.sql.getManagerToken(this.allianceId));
                if (tokenResponse.length === 0) {
                    console.log("token: ", tokenResponse.length === 0, this.allianceTag);
                    tokenResponseFlag = true;
                    tokenResponse.push({ token: null });
                }

                if (tokenResponseFlag || tokenResponse === undefined) {
                    console.log("sending error message");
                    let errorMessage = `Closing RallyLogger instance for ${this.allianceTag}. Reason: `;

                    if (tokenResponse === undefined) {
                        errorMessage += "Token response is undefined";
                    } else if (tokenResponse.length === 0) {
                        errorMessage += "Token response is empty";
                    } else {
                        errorMessage += "Token check failed";
                    }

                    console.error(errorMessage);
                    return;
                }

                const guildId = (await this.sql.getAllianceGuild(this.allianceId))[0]?.guild;
                const token = tokenResponse[0].token;

                // console.log("Guild ID: ", guildId);
                // console.log("Token: ", token);

                // Define the API request parameters
                const url = 'https://api-lok-live.leagueofkingdoms.com/api/alliance/battle/list/v2';
                const headers = {
                    'x-access-token': token,
                    'Content-Type': 'application/x-www-form-urlencoded'
                };
                const body = 'json=%7B%7D';

                // Make the API request
                const response = await this.api.request(url, body, headers);

                const payload = response.data?.payload ?? null;
                if (payload === null) {
                    console.error("No payload, no rallies logged due to error.");
                    return;
                }

                // Decode the gzip response
                const decodedData = await this.encryption.decodeGunzip(response.data?.payload);
                const rallyData = JSON.parse(decodedData);

                console.log("Rally data: ", rallyData);

                // Process each rally if the request was successful
                if (rallyData.result && rallyData.battles && rallyData.battles.length > 0) {
                    for (const rally of rallyData.battles) {
                        // Prepare the rally type (PVE or PVP) based on marchType
                        const rallyType = rally.marchType === 5 ? 'PVE' : 'PVP';

                        // Insert into the database
                        const values = [
                            rally._id || '',
                            rally.kingdomId || '',
                            rallyType,
                            guildId || ''
                        ];

                        await this.sql.addRally(...values);

                        // Get rally participants and record joiners
                        await this.recordRallyJoiners(rally._id, guildId, token);
                    }
                    console.log(`Logged ${rallyData.battles.length} rallies at ${new Date().toISOString()} in ${this.allianceTag}`);
                } else {
                    console.log('No rallies found or request failed');
                }
            } catch (error) {
                console.error('Error logging rallies:', error);
            }

            // Wait 4 minutes before the next request
            // console.log(`Waiting 4 minutes before the next rally check in ${this.allianceTag}...`);
            await new Promise(resolve => setTimeout(resolve, 4 * 60 * 1000));
        }
    }

    async recordRallyJoiners(rallyId, guildId, token) {
        try {
            // Define the API request parameters for rally info
            const url = 'https://api-lok-live.leagueofkingdoms.com/api/alliance/battle/info';
            const headers = {
                'x-access-token': token,
                'Content-Type': 'application/x-www-form-urlencoded'
            };
            const body = `json=${encodeURIComponent(JSON.stringify({ rallyMoId: rallyId }))}`;

            // Get rally participants using existing API method
            const response = await this.api.request(url, body, headers);
            
            if (!response.data?.result || !response.data?.battle?.rallyTroops) {
                console.log(`No rally participants found for rally ${rallyId}`);
                return;
            }

            // Decode the gzip response if payload exists
            let rallyInfo = response.data;
            if (response.data.payload) {
                const decodedData = await this.encryption.decodeGunzip(response.data.payload);
                rallyInfo = JSON.parse(decodedData);
            }

            const rallyTroops = rallyInfo.battle?.rallyTroops || [];
            
            // Record each joiner
            for (const troopData of rallyTroops) {
                const joinerKingdomId = troopData.kingdomId;
                
                if (joinerKingdomId) {
                    // Check if this joiner is already recorded for this rally
                    const exists = await this.sql.checkRallyJoiner(rallyId, joinerKingdomId, guildId);
                    
                    if (!exists) {
                        await this.sql.addRallyJoiner(rallyId, joinerKingdomId, guildId);
                    }
                }
            }

            console.log(`Recorded ${rallyTroops.length} joiners for rally ${rallyId} in ${this.allianceTag}`);
        } catch (error) {
            console.error(`Error recording rally joiners for rally ${rallyId}:`, error);
        }
    }
}

module.exports = RallyLogger;