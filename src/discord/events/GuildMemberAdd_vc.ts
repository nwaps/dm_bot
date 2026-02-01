// Sub-handler: loaded by GuildMemberAdd.ts orchestrator (no event name = skipped by event loader)
import { Client, GuildMember } from 'discord.js';
import { dcOrMoveToHome, denyJoinPermissions, getChannelsByBanned } from '../util/vcs';
import { member_join_leave_model } from '../models/activity';

export default {
    async execute(client: Client, member: GuildMember) {
        // Track join for activity tracking
        try {
            await member_join_leave_model.create({
                user_id: member.user.id,
                guild_id: member.guild.id,
                timestamp: new Date(),
                action: 'join'
            });
        } catch (error) {
            console.error('Error tracking member join:', error);
        }

        // Existing VCS bans logic
        const guild_channels = global.VCS.get(member.guild.id)
        if (guild_channels) {
            const channels = getChannelsByBanned(guild_channels, member.id)
            for (const [id, channel] of channels) {
                denyJoinPermissions(member, id, [member.id])
                dcOrMoveToHome(id, member)
            }
        }
    },
};