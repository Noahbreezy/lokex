const sqlFunctions = require('../sql.js');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

class UpdateVerified {
    constructor(sqlInstance) {
        this.sql = sqlInstance;
        this.discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers, // Needed to manage roles
            ],
        });
        this.discordToken = process.env.DISCORD_TOKEN;
        this.discordClient.login(this.discordToken);

        // Ensure the client is ready before proceeding
        this.readyPromise = new Promise((resolve) => {
            this.discordClient.once('ready', () => {
                console.log('Discord client is ready.');
                resolve();
            });
        });
    }

    async getChangesData() {
        // Wait for Discord client to be ready
        await this.readyPromise;

        // 1. Gather guilds with unverify enabled
        const guildRows = await this.sql.getAllGuildsWithUnverifyFlag();
        if (!guildRows || guildRows.length === 0) return [];

        const results = [];

        for (const row of guildRows) {
            const guildId = row.guild_id;

            // Ensure subscription is valid (type contains '2')
            const subscriptionFlagInfo = await this.sql.checkSubscriptionValid(guildId, "2");
            if (!subscriptionFlagInfo) {
                console.log(`Skip guild ${guildId} (no valid subscription)`);
                continue;
            }

            // Step A: Identify Discord users who have the verification role but no active verified kingdoms
            let needChangeRole = [];
            let needChangeStatus = [];
            try {
                const roleRes = await this.sql.getGuildVerificationRole(guildId);
                const verifiedRoleId = roleRes[0]?.verified_role;
                if (verifiedRoleId) {
                    const guild = await this.discordClient.guilds.fetch(guildId);
                    await guild.members.fetch(); // populate cache
                    const role = await guild.roles.fetch(verifiedRoleId);
                    if (role) {
                        const membersWithRole = Array.from(role.members.keys());
                        // Get active verified discord IDs
                        const activeDiscordRows = await this.sql.getActiveVerifiedDiscordIds(guildId);
                        const activeSet = new Set(activeDiscordRows.map(r => r.discordId));
                        // Users that have the role but no active verified kingdoms
                        needChangeRole = membersWithRole.filter(did => !activeSet.has(did));
                        if (needChangeRole.length) {
                            console.log(`Guild ${guildId}: ${needChangeRole.length} users need role removed.`);
                        }
                    }
                }
            } catch (e) {
                console.error(`Role scan failed for guild ${guildId}:`, e.message);
            }

            // Step B: For each active verified kingdom, check recent info presence (7d, in linked continents)
            try {
                const activeKingdomRows = await this.sql.getActiveVerifiedKingdoms(guildId);
                const allKingdomIds = activeKingdomRows.map(r => r.kingdomId);
                if (allKingdomIds.length) {
                    const recentlyActiveRows = await this.sql.getRecentlyActiveKingdoms(allKingdomIds, guildId, 7);
                    console.log(`Guild ${guildId}: ${recentlyActiveRows.length} kingdoms active in last 7d.`);
                    console.log('active:', recentlyActiveRows);
                    const recentSet = new Set(recentlyActiveRows.map(r => r.kingdomId));
                    // Kingdoms with no recent info in linked continents
                    needChangeStatus = allKingdomIds.filter(k => !recentSet.has(k));
                    if (needChangeStatus.length) {
                        console.log(`Guild ${guildId}: ${needChangeStatus.length} kingdoms inactive >7d.`);
                    }
                }
            } catch (e) {
                console.error(`Kingdom activity scan failed for guild ${guildId}:`, e.message);
            }

            // Only push if there is any work
            if (needChangeRole.length || needChangeStatus.length) {
                results.push({ guildId, needChangeRole, needChangeStatus });
            }
        }

        return results;
    }

    async updateVerified() {
        while (true) {
            // Wait for the Discord client to be ready
            await this.readyPromise;

            const changesNeeded = await this.getChangesData();
            if (!changesNeeded || changesNeeded.length === 0) {
                console.log('No changes needed.');
            } else {
                for (const { guildId, needChangeStatus, needChangeRole } of changesNeeded) {
                    // Double-check unverify flag still enabled before applying
                    const unverifyFlag = await this.sql.getUnverifyFlag(guildId);
                    if (!unverifyFlag) {
                        console.log(`Skip guild ${guildId} (unverify disabled at execution time)`);
                        continue;
                    }

                    // Double-check subscription validity at execution time as well
                    const subOk = await this.sql.checkSubscriptionValid(guildId, "2");
                    if (!subOk) {
                        console.log(`Skip guild ${guildId} (subscription invalid at execution time)`);
                        continue;
                    }

                    // Deactivate kingdoms (status -> 0)
                    if (needChangeStatus?.length) {
                        try {
                            await this.sql.bulkDeactivateKingdoms(guildId, needChangeStatus);
                            console.log(`Guild ${guildId}: Deactivated ${needChangeStatus.length} kingdoms.`);
                        } catch (e) {
                            console.error(`Guild ${guildId}: bulk deactivate failed`, e.message);
                        }
                    }

                    // Remove roles: first those already without active entries, then those who became fully inactive after deactivation
                    try {
                        // Gather initial removal set from planning
                        const initialRemovals = Array.isArray(needChangeRole) ? [...needChangeRole] : [];

                        // After deactivation, find any discord IDs that now have zero active kingdoms
                        let postDeactivationRemovals = [];
                        try {
                            const fullyInactiveRows = await this.sql.getDiscordIdsFullyInactive(guildId);
                            const fullyInactiveIds = new Set(fullyInactiveRows.map(r => r.discordId));
                            // exclude ones we already planned
                            postDeactivationRemovals = [...fullyInactiveIds].filter(id => !initialRemovals.includes(id));
                        } catch (scanErr) {
                            console.error(`Guild ${guildId}: failed to compute post-deactivation removals`, scanErr.message);
                        }

                        const removals = [...new Set([...initialRemovals, ...postDeactivationRemovals])];
                        if (removals.length === 0) {
                            // nothing to remove
                        } else {
                            const roleRes = await this.sql.getGuildVerificationRole(guildId);
                            const verifiedRoleId = roleRes[0]?.verified_role;
                            if (!verifiedRoleId) {
                                console.log(`Guild ${guildId}: missing verified role id, skip role removals`);
                            } else {
                                const guild = await this.discordClient.guilds.fetch(guildId);
                                for (const discordId of removals) {
                                    try {
                                        const member = await guild.members.fetch(discordId);
                                        await member.roles.remove(verifiedRoleId);
                                        console.log(`Guild ${guildId}: removed role from ${discordId}`);
                                    } catch (er) {
                                        console.error(`Guild ${guildId}: failed removing role from ${discordId}`, er.message);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`Guild ${guildId}: role removal phase failed`, e.message);
                    }
                }
            }

            // Calculate milliseconds until the next midnight (UTC)
            const now = new Date();
            const millisTillMidnight = new Date(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1, // Next day
                0, 0, 0, 0 // Midnight UTC
            ) - now;

            console.log(`Waiting ${millisTillMidnight} ms until next midnight (UTC)...`);
            await new Promise(resolve => setTimeout(resolve, millisTillMidnight));
        }
    }
}

async function test() {
    const sql = new sqlFunctions();
    const updateVerified = new UpdateVerified(sql);
    await updateVerified.updateVerified();
    sql.closeConnection();
}

// test().then(() => process.exit(0)).catch(() => process.exit(1));

module.exports = UpdateVerified;