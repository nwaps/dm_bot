// src/discord/events/GuildMemberUpdate_userNumbering.ts

import { Client, Events, GuildMember, PartialGuildMember } from 'discord.js';
import { getOrCreateConfig, extractNumberFromNickname } from '../util/nab';

export default {
    name: Events.GuildMemberUpdate,
    async execute(client: Client, oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
        try {
            // Check if nickname changed
            if (oldMember.nickname !== newMember.nickname) {
                const config = await getOrCreateConfig(newMember.guild.id);
                
                if (!config.enabled) return;
                
                // console.log(`Nickname changed for ${newMember.user.username}: "${oldMember.nickname}" → "${newMember.nickname}"`);
                
                // Just log the change - we don't interfere with user choices anymore
                const oldNumber = extractNumberFromNickname(oldMember.nickname || '', config.prefix);
                const newNumber = extractNumberFromNickname(newMember.nickname || '', config.prefix);
                
                if (oldNumber !== newNumber) {
                    if (oldNumber && newNumber) {
                        // console.log(`${newMember.user.username} changed their number from ${oldNumber} to ${newNumber}`);
                    } else if (oldNumber && !newNumber) {
                        // console.log(`${newMember.user.username} removed their number (was ${oldNumber})`);
                    } else if (!oldNumber && newNumber) {
                        // console.log(`${newMember.user.username} added number ${newNumber}`);
                    }
                }
            }
        } catch (error) {
            console.error(`Error handling member update for ${newMember.user.username}:`, error);
        }
    },
};