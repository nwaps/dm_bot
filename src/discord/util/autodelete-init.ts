// src/discord/util/autodelete-init.ts

import { Client } from 'discord.js';
import { initializeDynamicRealtime, handleNewMessage, startAgeMonitoring } from './autodelete';
import { initDatabase, getRepository } from '../models/autodelete';

/**
 * Initialize the real-time dynamic autodelete system
 */
export async function initializeRealtimeAutoDelete(client: Client): Promise<void> {
    try {
        // Initialize the database repository
        await initDatabase();

        // Initialize the dynamic real-time system
        initializeDynamicRealtime(client);

        // Load and sync pinned messages for all configured channels
        await syncAllPinnedMessages(client);

        // Start age monitoring for all channels with age-based deletion
        await startAgeMonitoringForAllChannels(client);

        // Perform initial cleanup for all configured channels
        await performInitialCleanup(client);

        console.log('AutoDelete system initialized successfully');

    } catch (error) {
        console.error('Failed to initialize AutoDelete system:', error);
        throw error;
    }
}

/**
 * Start age monitoring for all channels that have age-based deletion configured - NEW
 */
async function startAgeMonitoringForAllChannels(client: Client): Promise<void> {
    try {
        const configs = await getRepository().getEnabledConfigs();
        let ageBasedChannels = 0;
        
        for (const config of configs) {
            if (config.maxAge > 0) {
                try {
                    const channel = await client.channels.fetch(config.channelId);
                    if (channel && channel.isTextBased()) {
                        startAgeMonitoring(client, config.channelId);
                        ageBasedChannels++;
                    } else {
                        // Channel doesn't exist or isn't text-based, remove config
                        await getRepository().deleteConfig(config.channelId);
                    }
                } catch (error) {
                    console.error(`Error starting age monitoring for channel ${config.channelId}:`, error);
                    // Remove invalid configurations
                    await getRepository().deleteConfig(config.channelId);
                }
            }
        }
        
        if (ageBasedChannels > 0) {
            console.log(`Started age monitoring for ${ageBasedChannels} channels with time-based deletion`);
        }
        
    } catch (error) {
        console.error('Error starting age monitoring for channels:', error);
    }
}

/**
 * Perform initial cleanup for all configured channels
 */
async function performInitialCleanup(client: Client): Promise<void> {
    try {
        const configs = await getRepository().getEnabledConfigs();

        let processedCount = 0;
        let errorCount = 0;

        for (const config of configs) {
            try {
                const channel = await client.channels.fetch(config.channelId);
                if (!channel || !channel.isTextBased()) {
                    // Channel doesn't exist or isn't text-based, remove config
                    await getRepository().deleteConfig(config.channelId);
                    continue;
                }

                // Trigger initial cleanup by simulating a message event with catchup context
                // This will cause the system to check and clean up existing messages more efficiently
                setTimeout(() => {
                    handleNewMessage(client, config.channelId, 'startup-cleanup', Date.now(), false, {
                        isCatchup: true,
                        totalToDelete: 0, // Will be calculated during processing
                        reason: 'startup',
                        silent: true // Suppress per-channel logs during startup
                    }).catch(err => console.error(`Error in startup cleanup for channel ${config.channelId}:`, err));
                }, processedCount * 2000); // Stagger the cleanups every 2 seconds

                processedCount++;

            } catch (error) {
                console.error(`Error during initial cleanup for channel ${config.channelId}:`, error);
                errorCount++;

                // Remove invalid configurations
                try {
                    await getRepository().deleteConfig(config.channelId);
                } catch (deleteError) {
                    console.error(`Error removing invalid config for channel ${config.channelId}:`, deleteError);
                }
            }
        }

        if (processedCount > 0) {
            console.log(`Cleanup scheduled for ${processedCount} channels${errorCount > 0 ? ` (${errorCount} errors)` : ''}`);
        }

    } catch (error) {
        console.error('Error during initial cleanup phase:', error);
    }
}

/**
 * Sync pinned messages for all configured channels
 */
async function syncAllPinnedMessages(client: Client): Promise<void> {
    try {
        const configs = await getRepository().getEnabledConfigs();
        
        for (const config of configs) {
            try {
                const channel = await client.channels.fetch(config.channelId);
                if (!channel || !channel.isTextBased()) {
                    // Channel doesn't exist or isn't text-based, remove config
                    await getRepository().deleteConfig(config.channelId);
                    continue;
                }
                
                const pinnedResponse = await channel.messages.fetchPins();

                // Update keepMessages set with current pinned messages
                const keepMessages = new Set<string>();
                pinnedResponse.items.forEach(pin => keepMessages.add(pin.message.id));
                
                // Merge with existing kept messages
                if (config.keepMessages) {
                    config.keepMessages.forEach(id => keepMessages.add(id));
                }
                
                config.keepMessages = keepMessages;
                
                // Save updated config
                await getRepository().saveConfig(config);
                
            } catch (error) {
                console.error(`Error syncing pinned messages for channel ${config.channelId}:`, error);
                // Remove invalid configurations
                await getRepository().deleteConfig(config.channelId);
            }
        }
        
        console.log(`Synced pinned messages for ${configs.length} configured channels`);
        
    } catch (error) {
        console.error('Error during pinned message sync:', error);
    }
}

/**
 * Perform periodic health checks and optimizations
 */
async function performHealthCheck(client: Client): Promise<void> {
    try {
        const { getPerformanceStats } = await import('./autodelete');
        const stats = getPerformanceStats();
        
        // Log performance summary
        const summary = {
            totalApiCalls: stats.global.totalApiCalls,
            totalErrors: stats.global.totalErrors,
            rateLimitHits: stats.global.rateLimitHits,
            activeChannels: stats.channels.length,
            highActivityChannels: stats.channels.filter(c => c.stats.isHighActivity).length,
            ageMonitoredChannels: stats.channels.filter(c => c.stats.lastAgeCheck && c.stats.lastAgeCheck > 0).length
        };
        
        // console.log('AutoDelete Health Check:', summary);
        
        // Alert on concerning metrics
        if (stats.global.rateLimitHits > 10) {
            console.warn(`High rate limit hits detected: ${stats.global.rateLimitHits}`);
        }
        
        if (stats.global.totalErrors > stats.global.totalApiCalls * 0.1) {
            console.warn(`High error rate detected: ${stats.global.totalErrors}/${stats.global.totalApiCalls}`);
        }
        
        // Check for channels with stale age monitoring
        const now = Date.now();
        const staleAgeMonitoring = stats.channels.filter(c => 
            c.stats.lastAgeCheck && 
            c.stats.nextAgeCheck && 
            c.stats.nextAgeCheck < now - 60000 // Should have run over a minute ago
        );
        
        if (staleAgeMonitoring.length > 0) {
            console.warn(`Found ${staleAgeMonitoring.length} channels with stale age monitoring - restarting monitoring`);
            for (const channelStat of staleAgeMonitoring) {
                try {
                    startAgeMonitoring(client, channelStat.channelId);
                } catch (error) {
                    console.error(`Error restarting age monitoring for ${channelStat.channelId}:`, error);
                }
            }
        }
        
        // Clean up channels that might have been deleted
        await cleanupDeletedChannels(client, stats.channels.map(c => c.channelId));
        
    } catch (error) {
        console.error('Error during health check:', error);
    }
}

/**
 * Clean up configurations for channels that no longer exist
 */
async function cleanupDeletedChannels(client: Client, trackedChannelIds: string[]): Promise<void> {
    const configs = await getRepository().getAllConfigs();
    
    for (const config of configs) {
        try {
            const channel = await client.channels.fetch(config.channelId);
            if (!channel || !channel.isTextBased()) {
                console.log(`Removing config for deleted channel: ${config.channelId}`);
                await getRepository().deleteConfig(config.channelId);
                
                // Also stop age monitoring if it was running
                const { stopAgeMonitoring } = await import('./autodelete');
                stopAgeMonitoring(config.channelId);
            }
        } catch (error) {
            // Channel likely doesn't exist, remove the config
            console.log(`Removing config for inaccessible channel: ${config.channelId}`);
            await getRepository().deleteConfig(config.channelId);
            
            // Also stop age monitoring if it was running
            try {
                const { stopAgeMonitoring } = await import('./autodelete');
                stopAgeMonitoring(config.channelId);
            } catch (importError) {
                // Ignore import errors during cleanup
            }
        }
    }
}