import { Client, Events, GuildMember } from 'discord.js';
import { getUserRoleHistory, setUserInServer } from '../models/lq';
import { user_model } from '../models/users';
import { member_join_leave_model } from '../models/activity';

export default {
    name: Events.GuildMemberRemove,
    async execute(client: Client, member: GuildMember) {
        // Track leave for activity tracking
        try {
            await member_join_leave_model.create({
                user_id: member.user.id,
                guild_id: member.guild.id,
                timestamp: new Date(),
                action: 'leave'
            });
        } catch (error) {
            console.error('Error tracking member leave:', error);
        }

        // Update user in the users collection - set in_server to false
        try {
            await user_model.updateOne(
                { user_id: member.user.id },
                { $set: { in_server: false } }
            );
            // console.log(`Updated user ${member.user.username}(${member.user.id}) as not in server`);
        } catch (error) {
            console.error(`Error updating user ${member.user.id} in users collection:`, error);
        }

        // Existing LQ logic
        const lq_role_id = global.SETTINGS?.[member.guild.id]?.roles?.lq?.[0] ?? null;
        if (lq_role_id) {
            const history = await getUserRoleHistory(member.user.id, String(lq_role_id), true)
            if (history.length > 0) {
                const userleft = await setUserInServer(member.user.id, false)
                if (userleft) console.log(`${member.user.username}(${member.user.id}) left the server while lq'd`)
                else console.error(`${member.user.username}(${member.user.id}) left the server but wasn't lq'd or couldn't be updated`)
            }
        }
    },
};