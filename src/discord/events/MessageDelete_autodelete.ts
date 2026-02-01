import { Client, Events, Message, PartialMessage } from 'discord.js';
import { handleMessageDeleted } from '../util/autodelete';
import { autoDeleteConfigs } from '../models/autodelete';

export default {
    name: Events.MessageDelete,
    async execute(client: Client, message: Message | PartialMessage) {
        // Ignore if no channel
        if (!message.channelId) return;
        
        const channelId = message.channelId;
        
        // Check if this channel has autodelete enabled
        const config = autoDeleteConfigs.get(channelId);
        if (!config || !config.enabled) return;
        
        // Update our tracking
        handleMessageDeleted(channelId, message.id!);
        
        // If the message was in the keepMessages set, remove it
        if (message.id && config.keepMessages.has(message.id)) {
            config.keepMessages.delete(message.id);
            
            // Update in database (async, non-blocking)
            import('../models/autodelete').then(({ getRepository }) => {
                getRepository().saveConfig(config).catch(err => {
                    console.error(`Error updating config after message delete in channel ${channelId}:`, err);
                });
            });
        }
    },
};