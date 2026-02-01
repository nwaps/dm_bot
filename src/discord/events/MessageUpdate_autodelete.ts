import { Client, Events, Message, PartialMessage } from 'discord.js';
import { autoDeleteConfigs, getRepository } from '../models/autodelete';

export default {
    name: Events.MessageUpdate,
    async execute(client: Client, oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
        // Only care about pin status changes
        if (oldMessage.pinned === newMessage.pinned) return;
        
        if (!newMessage.channelId || !newMessage.id) return;
        
        const channelId = newMessage.channelId;
        const config = autoDeleteConfigs.get(channelId);
        
        if (!config || !config.enabled) return;
        
        // Handle pin status change
        if (newMessage.pinned && !oldMessage.pinned) {
            // Message was pinned - add to keep list
            config.keepMessages.add(newMessage.id);
            
            // Update database (async, non-blocking)
            getRepository().saveConfig(config).catch(err => {
                console.error(`Error saving config after pin in channel ${channelId}:`, err);
            });
            
        } else if (!newMessage.pinned && oldMessage.pinned) {
            // Message was unpinned - remove from keep list
            config.keepMessages.delete(newMessage.id);
            
            // Update database (async, non-blocking)
            getRepository().saveConfig(config).catch(err => {
                console.error(`Error saving config after unpin in channel ${channelId}:`, err);
            });
            
            // The message might now be eligible for deletion
            // Trigger a quick cleanup check
            setTimeout(() => {
                import('../util/autodelete').then(({ handleNewMessage }) => {
                    handleNewMessage(client, channelId, newMessage.id!, newMessage.createdTimestamp!, false);
                });
            }, 1000);
        }
    },
};