// src/discord/events/GuildMemberRemove_userNumbering.ts

import { Client, Events, GuildMember, PartialGuildMember } from 'discord.js';
import { handleMemberLeave } from '../util/nab';

export default {
    name: Events.GuildMemberRemove,
    async execute(client: Client, member: GuildMember | PartialGuildMember) {
        try {
            await handleMemberLeave(member.guild.id, member.id);
        } catch (error) {
            console.error(`Error handling member leave for ${member.user?.username}:`, error);
        }
    },
};