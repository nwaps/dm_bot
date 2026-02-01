// src/discord/util/vc-cleanup.ts

import { Client, Guild, VoiceChannel } from 'discord.js';
import { cleanupOldBumpCooldowns, removeBumpCooldown } from './bump-cooldowns';
import { removeVC } from './vcs';

/**
 * Clean up bump cooldowns and VC records when a voice channel is deleted
 * This should be called when a voice channel is deleted
 */
export async function cleanupDeletedVC(channelId: string, guildId: string): Promise<void> {
    try {
        // Remove bump cooldown record
        await removeBumpCooldown(channelId, guildId);
        console.log(`Cleaned up bump cooldown for deleted channel ${channelId}`);
    } catch (error) {
        console.error(`Error cleaning up deleted VC ${channelId}:`, error);
    }
}

/**
 * Perform periodic cleanup of old bump cooldowns for non-existent channels
 * This can be run as a scheduled task
 */
export async function performPeriodicCleanup(client: Client): Promise<void> {
    console.log('Starting periodic VC cleanup...');
    
    try {
        const guilds = client.guilds.cache;
        let totalCleaned = 0;

        for (const [guildId, guild] of guilds) {
            try {
                // Get all voice channels in the guild
                const voiceChannels = guild.channels.cache
                    .filter(channel => channel.type === 2) // VoiceChannel type
                    .map(channel => channel.id);

                // Clean up old bump cooldowns for non-existent channels
                const cleanedCount = await cleanupOldBumpCooldowns(guildId, voiceChannels);
                totalCleaned += cleanedCount;

                if (cleanedCount > 0) {
                    console.log(`Cleaned up ${cleanedCount} old bump cooldowns for guild ${guild.name}`);
                }
            } catch (error) {
                console.error(`Error cleaning up guild ${guildId}:`, error);
            }
        }

        console.log(`Periodic cleanup completed. Total records cleaned: ${totalCleaned}`);
    } catch (error) {
        console.error('Error during periodic cleanup:', error);
    }
}

/**
 * Initialize cleanup system - sets up periodic cleanup interval
 * Call this once when the bot starts
 */
export function initializeCleanup(client: Client): void {
    // Run cleanup every 6 hours
    const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

    setInterval(() => {
        performPeriodicCleanup(client);
    }, CLEANUP_INTERVAL);

    // Run initial cleanup after 5 minutes of startup
    setTimeout(() => {
        performPeriodicCleanup(client);
    }, 5 * 60 * 1000);

    console.log('VC cleanup system initialized - periodic cleanup every 6 hours');
}