import { Client, Collection, Events, Message, Snowflake } from 'discord.js';
import { handleBulkMessageDeleted } from '../util/autodelete';
import { autoDeleteConfigs } from '../models/autodelete';

export default {
    name: Events.MessageBulkDelete,
    async execute(client: Client, messages: Collection<Snowflake, Message>) {
        // If no messages were deleted, ignore
        if (messages.size === 0) return;
        
        // Get the channel ID from the first message
        const firstMessage = messages.first();
        if (!firstMessage || !firstMessage.channelId) return;
        
        const channelId = firstMessage.channelId;
        
        // Check if this channel has autodelete enabled
        const config = autoDeleteConfigs.get(channelId);
        if (!config || !config.enabled) return;
        
        // Update our tracking
        handleBulkMessageDeleted(channelId, messages.size);
        
        // Remove messages from the keepMessages set if they were bulk deleted
        let wasUpdated = false;
        for (const [messageId] of messages) {
            if (config.keepMessages.has(messageId)) {
                config.keepMessages.delete(messageId);
                wasUpdated = true;
            }
        }
        
        // Update in database if needed (async, non-blocking)
        if (wasUpdated) {
            import('../models/autodelete').then(({ getRepository }) => {
                getRepository().saveConfig(config).catch(err => {
                    console.error(`Error updating config after bulk delete in channel ${channelId}:`, err);
                });
            });
        }
    },
};