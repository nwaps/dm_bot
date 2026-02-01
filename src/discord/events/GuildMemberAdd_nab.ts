// Sub-handler: loaded by GuildMemberAdd.ts orchestrator (no event name = skipped by event loader)

import { Client, GuildMember } from 'discord.js';
import { assignNumber } from '../util/nab';

export default {
    async execute(client: Client, member: GuildMember) {
        try {
            // Assign number to new member (this will check for pinned numbers first)
            const result = await assignNumber(member.guild, member);
            
            if (result && result.assignment) {
                console.log(`Assigned number ${result.assignment.number} to ${member.user.username} in ${member.guild.name}`);
                
                // Log if it was a pinned number
                if (result.assignment.isPinned) {
                    console.log(`Restored pinned number ${result.assignment.number} for returning user ${member.user.username}`);
                }
            }
        } catch (error) {
            console.error(`Error assigning number to new member ${member.user.username}:`, error);
        }
    },
};