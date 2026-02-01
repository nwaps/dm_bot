import { Client, Events, Message } from 'discord.js';
import { handleNewMessage } from '../util/autodelete';

export default {
    name: Events.MessageCreate,
    async execute(client: Client, message: Message) {
        // Ignore messages from bots and DMs
        if (!message.guild || !message.channel) return;
        
        // Handle the new message with real-time processing
        await handleNewMessage(
            client,
            message.channelId,
            message.id,
            message.createdTimestamp,
            message.pinned
        );
    },
};