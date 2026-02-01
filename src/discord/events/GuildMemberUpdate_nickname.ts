// events/guildMemberUpdate.ts
import { Client, Events, GuildMember, AuditLogEvent, User } from 'discord.js';
import { updateUserNickname } from '../util/nicknames';

export default {
    name: Events.GuildMemberUpdate,
    async execute(client: Client, oldMember: GuildMember, newMember: GuildMember) {
        // Only track nickname changes
        if (oldMember.nickname === newMember.nickname) {
            return;
        }

        const newNickname = newMember.nickname || newMember.user.username;
        let changedBy: string | undefined = undefined;
        let reason = 'unknown';

        try {
            // Try to find who changed the nickname from audit logs
            const auditLogs = await newMember.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberUpdate,
                limit: 10
            });

            // Look for the most recent nickname change for this user
            const relevantLog = auditLogs.entries.find(entry => {
                // Fix the type casting - target could be User, GuildMember, or other types
                const target = entry.target;
                let targetId: string | undefined;
                
                if (target && typeof target === 'object' && 'id' in target) {
                    targetId = (target as any).id;
                }
                
                return targetId === newMember.id && 
                       entry.changes?.some(change => change.key === 'nick') &&
                       Date.now() - entry.createdTimestamp < 30000; // Within last 30 seconds
            });

            if (relevantLog) {
                changedBy = relevantLog.executor?.id || undefined;
                
                // Determine reason based on who changed it
                if (changedBy === client.user?.id) {
                    // Bot changed it - could be assignment or other bot action
                    if ((!oldMember.nickname || oldMember.nickname.trim() === '') && newNickname.startsWith('No.')) {
                        reason = 'assigned on join';
                    } else {
                        reason = 'bot action';
                    }
                } else if (changedBy) {
                    reason = 'manually assigned';
                } else {
                    reason = 'unknown';
                }
            } else {
                // No audit log found - might be due to permissions or timing
                reason = 'unknown';
                changedBy = undefined;
            }
        } catch (error) {
            // If we can't access audit logs, just mark as unknown
            console.log(`Could not access audit logs for nickname change: ${error}`);
            reason = 'unknown';
            changedBy = undefined;
        }

        // Update nickname history
        try {
            await updateUserNickname(
                newMember.id,
                newNickname,
                false, // Not boost related by default
                undefined, // No boost event ID
                changedBy, // Now properly typed as string | undefined
                reason
            );
        } catch (error) {
            console.error(`Error updating nickname history for ${newMember.user.username}:`, error);
        }
    },
};