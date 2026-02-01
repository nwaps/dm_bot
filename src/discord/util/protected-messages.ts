// src/discord/util/protected-messages.ts

import { autoDeleteConfigs, getRepository } from '../models/autodelete';

/**
 * Add a message to the protected messages list for a channel
 * This prevents the message from being deleted by the autodelete system
 */
export async function addProtectedMessage(channelId: string, messageId: string): Promise<boolean> {
    try {
        const config = autoDeleteConfigs.get(channelId);
        
        if (!config) {
            console.warn(`No autodelete config found for channel ${channelId}, cannot protect message ${messageId}`);
            return false;
        }

        // Add to the keepMessages set
        config.keepMessages.add(messageId);
        
        // Save to database
        await getRepository().saveConfig(config);
        
        console.log(`Protected message ${messageId} in channel ${channelId} from autodelete`);
        return true;
    } catch (error) {
        console.error(`Error protecting message ${messageId} in channel ${channelId}:`, error);
        return false;
    }
}

/**
 * Remove a message from the protected messages list for a channel
 * This allows the message to be deleted by the autodelete system again
 */
export async function removeProtectedMessage(channelId: string, messageId: string): Promise<boolean> {
    try {
        const config = autoDeleteConfigs.get(channelId);
        
        if (!config) {
            console.warn(`No autodelete config found for channel ${channelId}, cannot unprotect message ${messageId}`);
            return false;
        }

        // Remove from the keepMessages set
        const wasRemoved = config.keepMessages.delete(messageId);
        
        if (wasRemoved) {
            // Save to database
            await getRepository().saveConfig(config);
            console.log(`Unprotected message ${messageId} in channel ${channelId} from autodelete`);
        }
        
        return wasRemoved;
    } catch (error) {
        console.error(`Error unprotecting message ${messageId} in channel ${channelId}:`, error);
        return false;
    }
}

/**
 * Check if a message is protected from deletion
 */
export function isMessageProtected(channelId: string, messageId: string): boolean {
    const config = autoDeleteConfigs.get(channelId);
    return config ? config.keepMessages.has(messageId) : false;
}

/**
 * Get all protected messages for a channel
 */
export function getProtectedMessages(channelId: string): Set<string> {
    const config = autoDeleteConfigs.get(channelId);
    return config ? new Set(config.keepMessages) : new Set();
}

/**
 * Extract message ID from Discord message URL
 * Example: https://discord.com/channels/guildId/channelId/messageId
 */
export function extractMessageIdFromUrl(messageUrl: string): string | null {
    try {
        const urlParts = messageUrl.split('/');
        const messageId = urlParts[urlParts.length - 1];
        
        // Basic validation - Discord message IDs are snowflakes (18-19 digits)
        if (/^\d{17,19}$/.test(messageId)) {
            return messageId;
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting message ID from URL:', error);
        return null;
    }
}

/**
 * Protect a VC interface message from autodelete using the message URL
 * This is the main function to use when setting up VC interfaces
 */
export async function protectVCInterfaceMessage(messageUrl: string): Promise<boolean> {
    try {
        const messageId = extractMessageIdFromUrl(messageUrl);
        if (!messageId) {
            console.error('Could not extract message ID from URL:', messageUrl);
            return false;
        }

        // Extract channel ID from URL as well
        const urlParts = messageUrl.split('/');
        const channelId = urlParts[urlParts.length - 2];
        
        if (!/^\d{17,19}$/.test(channelId)) {
            console.error('Could not extract valid channel ID from URL:', messageUrl);
            return false;
        }

        return await addProtectedMessage(channelId, messageId);
    } catch (error) {
        console.error('Error protecting VC interface message:', error);
        return false;
    }
}
