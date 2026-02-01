// src/discord/util/bump-cooldowns.ts

import BumpCooldown, { IBumpCooldown } from '../models/bump_cooldowns';

const BUMP_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Check if a channel is on cooldown for bumping
 * @param channelId - The Discord channel ID
 * @param guildId - The Discord guild ID
 * @returns Object with cooldown status and remaining time
 */
export async function checkBumpCooldown(channelId: string, guildId: string): Promise<{
    isOnCooldown: boolean;
    remainingTime: number; // milliseconds
    timeString: string; // formatted time string
}> {
    try {
        const cooldownRecord = await BumpCooldown.findOne({ channelId, guildId });
        
        if (!cooldownRecord) {
            return {
                isOnCooldown: false,
                remainingTime: 0,
                timeString: ''
            };
        }

        const now = Date.now();
        const lastBump = cooldownRecord.lastBumpTimestamp.getTime();
        const timeDiff = now - lastBump;

        if (timeDiff >= BUMP_COOLDOWN) {
            return {
                isOnCooldown: false,
                remainingTime: 0,
                timeString: ''
            };
        }

        const remainingTime = BUMP_COOLDOWN - timeDiff;
        const timeLeft = Math.ceil(remainingTime / 1000);
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        return {
            isOnCooldown: true,
            remainingTime,
            timeString
        };

    } catch (error) {
        console.error('Error checking bump cooldown:', error);
        // Return false on error to allow the bump (fail-safe)
        return {
            isOnCooldown: false,
            remainingTime: 0,
            timeString: ''
        };
    }
}

/**
 * Set or update the bump cooldown for a channel
 * @param channelId - The Discord channel ID
 * @param guildId - The Discord guild ID
 * @returns Promise<boolean> - Success status
 */
export async function setBumpCooldown(channelId: string, guildId: string): Promise<boolean> {
    try {
        await BumpCooldown.findOneAndUpdate(
            { channelId, guildId },
            { 
                lastBumpTimestamp: new Date(),
                guildId, // Ensure guildId is set if creating new record
                channelId // Ensure channelId is set if creating new record
            },
            { 
                upsert: true, // Create if doesn't exist
                new: true 
            }
        );

        return true;
    } catch (error) {
        console.error('Error setting bump cooldown:', error);
        return false;
    }
}

/**
 * Remove bump cooldown for a channel (useful for cleanup)
 * @param channelId - The Discord channel ID
 * @param guildId - The Discord guild ID
 * @returns Promise<boolean> - Success status
 */
export async function removeBumpCooldown(channelId: string, guildId: string): Promise<boolean> {
    try {
        await BumpCooldown.findOneAndDelete({ channelId, guildId });
        return true;
    } catch (error) {
        console.error('Error removing bump cooldown:', error);
        return false;
    }
}

/**
 * Clean up old bump cooldown records for channels that no longer exist
 * This function can be called periodically to maintain database cleanliness
 * @param guildId - The Discord guild ID
 * @param existingChannelIds - Array of channel IDs that still exist
 * @returns Promise<number> - Number of records cleaned up
 */
export async function cleanupOldBumpCooldowns(guildId: string, existingChannelIds: string[]): Promise<number> {
    try {
        const result = await BumpCooldown.deleteMany({
            guildId,
            channelId: { $nin: existingChannelIds }
        });

        return result.deletedCount || 0;
    } catch (error) {
        console.error('Error cleaning up old bump cooldowns:', error);
        return 0;
    }
}