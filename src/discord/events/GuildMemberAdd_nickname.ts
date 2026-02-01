// Sub-handler: loaded by GuildMemberAdd.ts orchestrator (no event name = skipped by event loader)
import { Client, GuildMember } from 'discord.js';
import { user_model } from '../models/users';
import { updateUserNickname } from '../util/nicknames';

export default {
    async execute(client: Client, member: GuildMember) {
        // Update user in the users collection - set in_server to true and update nickname
        try {
            const nickname = member.nickname || member.user.username;
            
            // Try to assign a number if user numbering is enabled
            // try {
            //     await assignNumber(member.guild, member);
            // } catch (error) {
            //     console.log(`Could not assign number to ${member.user.username}: ${error}`);
            // }
            
            // Update nickname history with bot as changer and "assigned on join" reason
            await updateUserNickname(
                member.user.id, 
                member.nickname || member.user.username,
                false, // not boost related
                undefined, // no boost event ID
                client.user?.id, // bot changed it
                'assigned on join' // reason
            );
            
            await user_model.updateOne(
                { user_id: member.user.id },
                { $set: { in_server: true } },
                { upsert: true }
            );
            
            // console.log(`Updated user ${member.user.username}(${member.user.id}) as in server`);
        } catch (error) {
            console.error(`Error updating user ${member.user.id} in users collection:`, error);
        }
    },
};