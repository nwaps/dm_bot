// events/guildMemberUpdate_boost.ts
import { Client, Events, GuildMember } from 'discord.js';
import { boost_model } from '../models/boosts';

export default {
    name: Events.GuildMemberUpdate,
    async execute(client: Client, oldMember: GuildMember, newMember: GuildMember) {
        const wasBooster = oldMember.premiumSince !== null;
        const isBooster = newMember.premiumSince !== null;
        
        if (wasBooster === isBooster) return; 
        
        try {
            if (!wasBooster && isBooster) {
                console.log(`${newMember.user.tag} started boosting`);
                
                // Get their current nickname (before boost)
                const currentNickname = newMember.nickname || newMember.user.username;
                
                // Create new boost event
                await boost_model.create({
                    guild_id: newMember.guild.id,
                    user_id: newMember.id,
                    boost_start: new Date(),
                    boost_end: null,
                    nickname_before_boost: currentNickname,
                    nickname_during_boost: null, // Will be set when admin gives custom nickname
                    is_active: true
                });
                
            } else if (wasBooster && !isBooster) {
                // User stopped boosting
                console.log(`${newMember.user.tag} stopped boosting`);
                
                // Find active boost event
                const activeBoost = await boost_model.findOne({
                    guild_id: newMember.guild.id,
                    user_id: newMember.id,
                    is_active: true
                });
                
                if (activeBoost) {
                    // Record the nickname they had while boosting
                    activeBoost.nickname_during_boost = newMember.nickname || newMember.user.username;
                    activeBoost.boost_end = new Date();
                    activeBoost.is_active = false;
                    await activeBoost.save();
                }
            }
        } catch (error) {
            console.error('Error tracking boost status:', error);
        }
    },
};