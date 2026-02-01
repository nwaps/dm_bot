// events/guildMemberUpdate_role.ts
import { Client, Events, GuildMember, AuditLogEvent } from 'discord.js';
import { addRoleAssignment, removeRoleAssignment } from '../util/lq';

export default {
    name: Events.GuildMemberUpdate,
    async execute(client: Client, old_member: GuildMember, new_member: GuildMember) {
        // Define which roles to track - add more roles here as needed
        const trackedRoles = {
            lq: String(global.SETTINGS[old_member.guild.id]?.roles?.lq || ''),
            chud: String(global.SETTINGS[old_member.guild.id]?.roles?.chud || ''),
            limbo: String(global.SETTINGS[old_member.guild.id]?.roles?.limbo || ''),
        };

        // Filter out empty/undefined role IDs
        const validTrackedRoles = Object.entries(trackedRoles).filter(([_, roleId]) => roleId && roleId !== 'undefined');
        
        if (validTrackedRoles.length === 0) {
            // console.log(`No tracked roles configured for guild ${old_member.guild.id}`);
            return;
        }
        
        // Get roles that were added
        const addedRoles = new_member.roles.cache.filter(role => 
            !old_member.roles.cache.has(role.id)
        );
        
        // Get roles that were removed
        const removedRoles = old_member.roles.cache.filter(role => 
            !new_member.roles.cache.has(role.id)
        );
        
        // Function to get who performed the role change from audit logs
        async function getAssignerFromAuditLog(targetUserId: string, roleId: string, action: 'add' | 'remove'): Promise<string | null> {
            try {
                const auditLogs = await new_member.guild.fetchAuditLogs({
                    type: AuditLogEvent.MemberRoleUpdate,
                    limit: 10
                });

                // Look for recent audit log entries for this user and role
                const relevantEntry = auditLogs.entries.find(entry => {
                    if (entry.targetId !== targetUserId) return false;
                    
                    // Check if this entry involves our specific role
                    const changes = entry.changes;
                    if (!changes) return false;
                    
                    const roleChanges = changes.find(change => change.key === '$add' || change.key === '$remove');
                    if (!roleChanges) return false;
                    
                    const roleArray = Array.isArray(roleChanges.new) ? roleChanges.new : roleChanges.old;
                    const hasOurRole = roleArray?.some((role: any) => role.id === roleId);
                    
                    // Check if the action matches what we're looking for
                    const isAdd = roleChanges.key === '$add';
                    return hasOurRole && ((action === 'add' && isAdd) || (action === 'remove' && !isAdd));
                });

                return relevantEntry?.executorId || null;
            } catch (error) {
                console.error('Error fetching audit logs:', error);
                return null;
            }
        }
        
        // Process role additions for all tracked roles
        for (const [roleName, roleId] of validTrackedRoles) {
            if (addedRoles.has(roleId)) {
                const assignerId = await getAssignerFromAuditLog(new_member.id, roleId, 'add');
                try {
                    await addRoleAssignment(new_member.id, roleId, assignerId);
                    // console.log(`Tracked ${roleName} role assignment for ${new_member.id} by ${assignerId || 'unknown'}`);
                } catch (error) {
                    console.error(`Failed to track ${roleName} role assignment for ${new_member.id}:`, error);
                }
            }
        }
        
        // Process role removals for all tracked roles
        for (const [roleName, roleId] of validTrackedRoles) {
            if (removedRoles.has(roleId)) {
                const removerId = await getAssignerFromAuditLog(new_member.id, roleId, 'remove');
                try {
                    await removeRoleAssignment(new_member.id, roleId, removerId);
                    // console.log(`Tracked ${roleName} role removal for ${new_member.id} by ${removerId || 'unknown'}`);
                } catch (error) {
                    console.error(`Failed to track ${roleName} role removal for ${new_member.id}:`, error);
                }
            }
        }
    },
};