// src/discord/events/MessageCreate_activity.ts

import { Client, Events, Message } from 'discord.js';
import { trackMessageActivity } from '../util/activity';

export default {
    name: Events.MessageCreate,
    async execute(client: Client, message: Message) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;
        
        try {
            await trackMessageActivity(
                message.author.id,
                message.guild.id,
                message.channel.id
            );
        } catch (error) {
            console.error('Error tracking message activity:', error);
        }
    },
};