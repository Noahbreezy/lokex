const AccountInfo = require('../../general/accountInfo.js');

class UpdateBots {
    constructor(sqlInstance, api) {
        this.accountInfo = new AccountInfo(sqlInstance, api);
        this.sql = sqlInstance;
    }

    async updateBotsInfo() {
        while (true) {
            try {
                const accounts = await this.sql.getActiveBots();
                for (const account of accounts) {
                    const profileInfo = await this.accountInfo.getProfileInfo(account.token);
                    if (profileInfo) {
                        await this.sql.updateBotInfo(profileInfo.name, profileInfo.allianceid, profileInfo.alliancetag, account.kingdomId);
                    }
                }
            } catch (error) {
                console.error('Error updating bot info:', error);
            }

            console.log("Waiting before updating botinfo again...");
            // Wait before the next execution (ensures no overlapping)
            await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // Wait 5 minutes
        }
    }

    async updateBotsToken() {
        while (true) {
            try {
                const accounts = await this.sql.getActiveBotsLogin();
                for (const account of accounts) {
                    const token = await this.accountInfo.login(account.email, account.password);
                    if (token) {
                        await this.sql.updateBotToken(token, account.kingdomId);
                        console.log(account.email + " token updated");
                    }
                }
            } catch (error) {
                console.error('Error updating bot tokens:', error);
            }

            // Calculate milliseconds until the next midnight (UTC)
            const now = new Date();
            const millisTillMidnight = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0) - now;

            // Wait until the next midnight
            console.log("Waiting until next midnight...");
            await new Promise(resolve => setTimeout(resolve, millisTillMidnight));
        }
    }
}

module.exports = UpdateBots;
