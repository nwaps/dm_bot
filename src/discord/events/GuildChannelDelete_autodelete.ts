// src/discord/events/ChannelDelete_autodelete.ts

import { Client, Events, GuildChannel } from 'discord.js';
import { autoDeleteConfigs, getRepository } from '../models/autodelete';

export default {
    name: Events.ChannelDelete,
    async execute(client: Client, channel: GuildChannel) {
        // Only handle guild channels (ignore DM channels)
        if (!channel.guild) return;

        const channelId = channel.id;

        try {
            // Check if this channel has an autodelete configuration
            const config = autoDeleteConfigs.get(channelId);

            if (config) {
                // console.log(`Channel deleted: ${channel.name || channelId} - cleaning up autodelete configuration`);

                // Remove from database
                await getRepository().deleteConfig(channelId);

                // Remove from cache (this is already done in deleteConfig, but being explicit)
                autoDeleteConfigs.delete(channelId);

                // Clean up any in-memory channel state from the autodelete utility
                // Import dynamically to avoid circular dependencies
                try {
                    const { cleanupChannelState } = await import('../util/autodelete');
                    if (cleanupChannelState) {
                        cleanupChannelState(channelId);
                    }
                } catch (importError) {
                    console.warn(`Could not import autodelete cleanup function:`, importError);
                }


                // console.log(`Successfully cleaned up autodelete configuration for deleted channel: ${channelId}`);
            }

        } catch (error) {
            console.error(`Error cleaning up autodelete configuration for deleted channel ${channelId}:`, error);

            // Even if there's an error, try to clean up the cache
            try {
                autoDeleteConfigs.delete(channelId);
            } catch (cacheError) {
                console.error(`Error cleaning up cache for deleted channel ${channelId}:`, cacheError);
            }
        }
    },
};