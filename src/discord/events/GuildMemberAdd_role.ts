// Sub-handler: loaded by GuildMemberAdd.ts orchestrator (no event name = skipped by event loader)
import { Client, GuildMember } from 'discord.js';
import { getUserRoleHistory, setUserInServer } from '../models/lq';
import { addRoleAssignment } from '../util/lq';

export default {
    async execute(client: Client, member: GuildMember) {
        // Define roles that should be auto-reassigned when users rejoin
        // Using the same array access pattern as your original LQ code
        const persistentRoles = {
            lq: global.SETTINGS?.[member.guild.id]?.roles?.lq?.[0] ?? null,
            chud: global.SETTINGS?.[member.guild.id]?.roles?.chud?.[0] ?? null,
            limbo: global.SETTINGS?.[member.guild.id]?.roles?.limbo?.[0] ?? null,
            // Add more persistent roles here as needed
        };

        // Filter out null/undefined roles and log what we found
        const validPersistentRoles = Object.entries(persistentRoles).filter(([roleName, roleId]) => {
            if (roleId) {
                // console.log(`Found ${roleName} role configured: ${roleId}`);
                return true;
            } else {
                // console.log(`No ${roleName} role configured for guild ${member.guild.id}`);
                return false;
            }
        });

        // Set user as in server once at the beginning
        let userServerStatusUpdated = false;
        
        // Check and reassign persistent roles
        for (const [roleName, roleId] of validPersistentRoles) {
            if (roleId) {
                try {
                    const history = await getUserRoleHistory(member.user.id, String(roleId), true);
                    // console.log(`${roleName} role history for ${member.user.username}: ${history.length} active assignments`);
                    
                    if (history.length > 0) {
                        // Update server status only once
                        if (!userServerStatusUpdated) {
                            const serverStatusResult = await setUserInServer(member.user.id, true);
                            userServerStatusUpdated = true;
                            // console.log(`Updated server status for ${member.user.username}(${member.user.id}): ${serverStatusResult}`);
                        }

                        console.log(`${member.user.username}(${member.user.id}) joined the server while ${roleName}'d; reassigning role`);
                        
                        const role = member.guild.roles.cache.get(String(roleId)) ?? await member.guild.roles.fetch(String(roleId));
                        if (role) {
                            await member.roles.add(role);
                            
                            // Track the auto-reassignment in the database
                            // Use the bot's ID as the assigner since this is automatic
                            await addRoleAssignment(member.user.id, String(roleId), client.user?.id || null);
                            // console.log(`Successfully reassigned ${roleName} role to ${member.user.username}(${member.user.id})`);
                        } else {
                            console.error(`Could not fetch ${roleName} role (${roleId}) for guild ${member.guild.id}`);
                        }
                    }
                } catch (error) {
                    console.error(`Failed to process ${roleName} role reassignment for ${member.user.id}:`, error);
                }
            }
        }

        // Handle autorole (non-persistent, always assigned to new members)
        const autorole_id = global.SETTINGS?.[member.guild.id]?.roles?.autorole?.[0] ?? null;
        if (autorole_id) {
            try {
                const autorole = member.guild.roles.cache.get(String(autorole_id)) ?? await member.guild.roles.fetch(String(autorole_id));
                if (autorole) {
                    await member.roles.add(autorole);
                    // console.log(`Assigned autorole to ${member.user.username}(${member.user.id})`);
                } else {
                    console.error(`Could not fetch autorole (${autorole_id}) for guild ${member.guild.id}`);
                }
            } catch (error) {
                console.error(`Failed to assign autorole to ${member.user.id}:`, error);
            }
        }
    },
};