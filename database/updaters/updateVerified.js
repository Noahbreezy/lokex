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
        const changesNeeded = await this.sql.getUnlinkedKingdomsAndRoles();

        // Wait for Discord client to be ready
        await this.readyPromise;

        console.log(`Changes needed for ${changesNeeded.guilds.length} guilds.`);
        
        // Get all guilds that have unverify flag enabled
        const allGuildsWithUnverify = await this.sql.getAllGuildsWithUnverifyFlag();
        
        // Create a map of existing guild changes for easy lookup
        const existingGuildChanges = new Map();
        for (const guildChanges of changesNeeded.guilds) {
            existingGuildChanges.set(guildChanges.guildId, guildChanges);
        }
        
        // Process all guilds with unverify flag (both existing and new)
        for (const guildInfo of allGuildsWithUnverify) {
            const guildId = guildInfo.guild_id;
            
            // Get or create guild changes object
            let guildChanges = existingGuildChanges.get(guildId);
            if (!guildChanges) {
                guildChanges = {
                    guildId: guildId,
                    needChangeStatus: [],
                    needChangeRole: []
                };
                changesNeeded.guilds.push(guildChanges);
                existingGuildChanges.set(guildId, guildChanges);
            }
            
            try {
                // Get the verified role for the guild
                const roleResult = await this.sql.getGuildVerificationRole(guildId);
                const verifiedRoleId = roleResult[0]?.verified_role;
                if (!verifiedRoleId) continue;
                
                // Fetch the Discord guild and role members
                const guild = await this.discordClient.guilds.fetch(guildId);
                const role = await guild.roles.fetch(verifiedRoleId);
                if (!role) continue;
                
                // Fetch all guild members to ensure the cache is populated
                await guild.members.fetch();
                
                const membersWithRole = Array.from(role.members.keys());
                console.log(`Guild ${guildId} has ${membersWithRole.length} members with verified role.`);
                console.log(membersWithRole);
                if (membersWithRole.length === 0) continue;
                
                // Get unregistered users
                const unregisteredUsers = await this.sql.getUnregisteredUsersWithRoles(guildId, membersWithRole);
                
                if (unregisteredUsers.length > 0) {
                    console.log(`Found ${unregisteredUsers.length} unregistered users with verified role in guild ${guildId}`);
                    
                    // Add unregistered users to needChangeRole
                    if (!guildChanges.needChangeRole) {
                        guildChanges.needChangeRole = [];
                    }
                    guildChanges.needChangeRole.push(...unregisteredUsers);
                    
                    // Remove duplicates
                    guildChanges.needChangeRole = [...new Set(guildChanges.needChangeRole)];
                }
            } catch (err) {
                console.error(`Failed to check unregistered users for guild ${guildId}:`, err);
            }
        }
        
    // Only return guilds that have unverify enabled
    const allowedGuildIds = new Set(allGuildsWithUnverify.map(g => g.guild_id));
    const filtered = changesNeeded.guilds.filter(g => allowedGuildIds.has(g.guildId));

    console.log(filtered);
    return filtered;
    }

    async updateVerified() {
        while (true) {
            // Wait for the Discord client to be ready
            await this.readyPromise;

            const changesNeeded = await this.getChangesData();
            if (!changesNeeded || changesNeeded.length === 0) {
                console.log('No changes needed.');
            } else {
                for (const guildChanges of changesNeeded) {
                    const { guildId, needChangeStatus, needChangeRole } = guildChanges;

                    const subscriptionFlagInfo = await this.sql.checkSubscriptionValid(guildId, "2");
                    if (!subscriptionFlagInfo) {
                        console.log(`Subscription flag not valid for guild ${guildId}`);
                        continue;
                    }

                    // Respect per-guild unverify setting: skip all actions when disabled
                    const unverifyFlag = await this.sql.getUnverifyFlag(guildId);
                    if (!unverifyFlag) {
                        console.log(`Unverify disabled for guild ${guildId}; skipping status and role updates.`);
                        continue;
                    }

                    // Step 1: Update the status of kingdoms in needChangeStatus
                    if (needChangeStatus?.length > 0) {
                        console.log(`Updating status for kingdoms in guild ${guildId}:`, needChangeStatus);
                        for (const kingdomId of needChangeStatus) {
                            try {
                                await this.sql.setKingdomStatusToZero(kingdomId, guildId);
                                console.log(`Set status to 0 for kingdomId ${kingdomId} in guild ${guildId}`);
                            } catch (err) {
                                console.error(`Failed to update status for kingdomId ${kingdomId} in guild ${guildId}:`, err);
                            }
                        }
                    } else {
                        console.log(`No kingdoms need status updates in guild ${guildId}`);
                    }

                    // Step 2: Remove roles for Discord users in needChangeRole
                    if (needChangeRole?.length > 0) {
                        console.log(`Removing roles for users in guild ${guildId}:`, needChangeRole);

                        // Fetch the verified role for the guild
                        let verifiedRoleId;
                        try {
                            const roleResult = await this.sql.getGuildVerificationRole(guildId);
                            verifiedRoleId = roleResult[0]?.verified_role;
                            if (!verifiedRoleId) {
                                console.error(`No verified role found for guild ${guildId}`);
                                continue;
                            }
                        } catch (err) {
                            console.error(`Failed to fetch verified role for guild ${guildId}:`, err);
                            continue;
                        }

                        // Fetch the Discord guild
                        let guild;
                        try {
                            guild = await this.discordClient.guilds.fetch(guildId);
                        } catch (err) {
                            console.error(`Failed to fetch guild ${guildId}:`, err);
                            continue;
                        }

                        // Remove the role for each Discord user
                        for (const discordId of needChangeRole) {
                            try {
                                const member = await guild.members.fetch(discordId);
                                await member.roles.remove(verifiedRoleId);
                                console.log(`Removed verified role from user ${discordId} in guild ${guildId}`);
                            } catch (err) {
                                console.error(`Failed to remove role for user ${discordId} in guild ${guildId}:`, err);
                            }
                        }
                    } else {
                        console.log(`No users need role updates in guild ${guildId}`);
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