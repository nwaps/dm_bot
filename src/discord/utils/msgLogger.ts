// src/discord/utils/msgLogger.ts
import { TextChannel, EmbedBuilder, Client, ChannelType, ThreadChannel, Webhook } from 'discord.js';
import { msg_logging_config_model, MsgLoggingConfig } from '../models/msg_logging_config';
import { msg_logging_event_model, MsgEventType, MsgLoggingEvent } from '../models/msg_logging_events';
import { msg_command_settings_model, MsgCommandSettings } from '../models/msg_command_settings';

export interface MsgLogEvent {
    type: 'success' | 'spam_blocked' | 'automod_blocked' | 'timeout_blocked' | 'ban_blocked' | 'moderation' | 'side_chat';
    userId: string;
    username: string;
    avatarURL: string;
    messageContent?: string;
    messageAttachment?: string;
    channelId?: string;
    channelName?: string;
    reason?: string;
    duration?: string;
    infractions?: number;
    moderator?: string;
}

/**
 * Setup or update message logging configuration
 */
export async function setupMsgLogging(
    guildId: string,
    channelId: string,
    threadName?: string
): Promise<{ success: boolean; threadId?: string; error?: string }> {
    try {
        // Find existing config or create new one
        let config = await msg_logging_config_model.findOne({ guild_id: guildId });

        if (!config) {
            config = new msg_logging_config_model({
                guild_id: guildId,
                enabled: true,
                channel_id: channelId,
                thread_name: threadName || undefined,
                thread_id: undefined
            });
        } else {
            config.enabled = true;
            config.channel_id = channelId;
            config.thread_name = threadName || undefined;
            // Reset thread_id when config changes, it will be resolved on first log
            config.thread_id = undefined;
        }

        await config.save();

        return { success: true };
    } catch (error) {
        console.error('[Msg Logger] Error setting up logging:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Get current message logging configuration
 */
export async function getMsgLoggingConfig(guildId: string): Promise<MsgLoggingConfig | null> {
    try {
        const config = await msg_logging_config_model.findOne({ guild_id: guildId });

        if (!config) {
            return null;
        }

        return config;
    } catch (error) {
        console.error('[Msg Logger] Error getting logging config:', error);
        return null;
    }
}

/**
 * Check if /msg command is enabled for a guild
 */
export async function isMsgCommandEnabled(guildId: string): Promise<boolean> {
    try {
        const settings = await msg_command_settings_model.findOne({ guild_id: guildId });

        // If no settings exist, command is enabled by default
        if (!settings) {
            return true;
        }

        return settings.command_enabled;
    } catch (error) {
        console.error('[Msg Command] Error checking command enabled state:', error);
        // On error, allow the command to prevent blocking users
        return true;
    }
}

/**
 * Enable /msg command for a guild
 */
export async function enableMsgCommand(guildId: string): Promise<boolean> {
    try {
        let settings = await msg_command_settings_model.findOne({ guild_id: guildId });

        if (!settings) {
            settings = new msg_command_settings_model({
                guild_id: guildId,
                command_enabled: true
            });
        } else {
            settings.command_enabled = true;
        }

        await settings.save();
        return true;
    } catch (error) {
        console.error('[Msg Command] Error enabling command:', error);
        return false;
    }
}

/**
 * Disable /msg command for a guild
 */
export async function disableMsgCommand(guildId: string): Promise<boolean> {
    try {
        let settings = await msg_command_settings_model.findOne({ guild_id: guildId });

        if (!settings) {
            settings = new msg_command_settings_model({
                guild_id: guildId,
                command_enabled: false
            });
        } else {
            settings.command_enabled = false;
        }

        await settings.save();
        return true;
    } catch (error) {
        console.error('[Msg Command] Error disabling command:', error);
        return false;
    }
}

/**
 * Clear/disable message logging
 */
export async function clearMsgLogging(guildId: string): Promise<boolean> {
    try {
        const config = await msg_logging_config_model.findOne({ guild_id: guildId });

        if (!config) {
            return false;
        }

        // Option 1: Delete the config entirely
        await msg_logging_config_model.deleteOne({ guild_id: guildId });

        // Option 2: Just disable it (uncomment if you prefer this)
        // config.enabled = false;
        // await config.save();

        return true;
    } catch (error) {
        console.error('[Msg Logger] Error clearing logging config:', error);
        return false;
    }
}

/**
 * Get or create a thread in the logging channel
 */
async function getOrCreateThread(
    client: Client,
    channelId: string,
    threadName: string,
    cachedThreadId?: string
): Promise<ThreadChannel | null> {
    try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || channel.type !== ChannelType.GuildText) {
            return null;
        }

        const textChannel = channel as TextChannel;

        // Try to use cached thread ID first
        if (cachedThreadId) {
            try {
                const cachedThread = await textChannel.threads.fetch(cachedThreadId);
                if (cachedThread && !cachedThread.archived) {
                    return cachedThread;
                }
            } catch {
                // Thread doesn't exist or is deleted, continue to search/create
            }
        }

        // Search for existing active threads with the name
        const activeThreads = await textChannel.threads.fetchActive();
        const existingThread = activeThreads.threads.find(t => t.name === threadName);

        if (existingThread) {
            return existingThread;
        }

        // Search archived threads
        const archivedThreads = await textChannel.threads.fetchArchived();
        const archivedThread = archivedThreads.threads.find(t => t.name === threadName);

        if (archivedThread) {
            // Unarchive and return
            await archivedThread.setArchived(false);
            return archivedThread;
        }

        // Create new thread
        const newThread = await textChannel.threads.create({
            name: threadName,
            autoArchiveDuration: 10080, // 7 days
            reason: 'Message logging thread for /msg command'
        });

        return newThread;
    } catch (error) {
        console.error('[Msg Logger] Error getting/creating thread:', error);
        return null;
    }
}

/**
 * Webhook cache to avoid repeated fetching
 */
const webhookCache = new Map<string, Webhook>();

/**
 * Get or create webhook for a channel
 */
async function getOrCreateWebhook(
    client: Client,
    channelId: string,
    name: string = 'Msg Command'
): Promise<Webhook | null> {
    try {
        // Check cache first
        const cached = webhookCache.get(channelId);
        if (cached) {
            // Verify webhook still exists by checking if it has an ID
            if (cached.id) {
                return cached;
            } else {
                // Webhook was deleted, remove from cache
                webhookCache.delete(channelId);
            }
        }

        if (!client.isReady()) {
            console.warn('[Msg Logger] Discord client not ready');
            return null;
        }

        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
            console.warn('[Msg Logger] Invalid channel for webhook');
            return null;
        }

        // Look for existing webhook
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.name === name && wh.owner?.id === client.user?.id);

        // Create webhook if doesn't exist
        if (!webhook) {
            webhook = await channel.createWebhook({
                name,
                reason: 'Msg command event logging'
            });
            console.log(`[Msg Logger] Created webhook for channel ${channelId}`);
        }

        // Cache webhook
        webhookCache.set(channelId, webhook);

        return webhook;
    } catch (error) {
        console.error('[Msg Logger] Error getting/creating webhook:', error);
        return null;
    }
}

/**
 * Update thread ID in settings
 */
async function updateThreadId(guildId: string, threadId: string): Promise<void> {
    try {
        const config = await msg_logging_config_model.findOne({ guild_id: guildId });

        if (config) {
            config.thread_id = threadId;
            await config.save();
        }
    } catch (error) {
        console.error('[Msg Logger] Error updating thread ID:', error);
    }
}

/**
 * Log a message event
 */
export async function logMsgEvent(client: Client, guildId: string, event: MsgLogEvent): Promise<boolean> {
    try {
        const config = await getMsgLoggingConfig(guildId);

        if (!config || !config.enabled || !config.channel_id) {
            return false;
        }

        let targetChannelId = config.channel_id;
        let threadId: string | undefined;

        // Handle thread if configured
        if (config.thread_name) {
            const thread = await getOrCreateThread(
                client,
                config.channel_id,
                config.thread_name,
                config.thread_id
            );

            if (thread) {
                threadId = thread.id;

                // Update cached thread ID if it changed
                if (config.thread_id !== thread.id) {
                    await updateThreadId(guildId, thread.id);
                }
            } else {
                // Thread creation failed, fall back to main channel
                console.warn('[Msg Logger] Thread creation/fetch failed, using main channel');
            }
        }

        // Save event to database
        const dbEvent = new msg_logging_event_model({
            guild_id: guildId,
            event_type: event.type,
            user_id: event.userId,
            username: event.username,
            avatar_url: event.avatarURL,
            message_content: event.messageContent,
            message_attachment: event.messageAttachment,
            channel_id: event.channelId,
            channel_name: event.channelName,
            reason: event.reason,
            duration: event.duration,
            infractions: event.infractions,
            moderator: event.moderator,
            timestamp: new Date()
        });

        await dbEvent.save();

        // Build embed based on event type
        const embed = buildLogEmbed(event);

        // Send via webhook for better formatting
        const webhook = await getOrCreateWebhook(client, targetChannelId, 'Msg Command');

        if (!webhook) {
            console.warn('[Msg Logger] Failed to get webhook, cannot send log to Discord');
            // Event is still saved to DB, so return true
            return true;
        }

        // Send the log message to Discord
        const messageOptions: any = {
            embeds: [embed],
            username: 'Msg Logger'
        };

        if (threadId) {
            messageOptions.threadId = threadId;
        }

        await webhook.send(messageOptions);

        return true;
    } catch (error) {
        console.error('[Msg Logger] Error logging event:', error);
        return false;
    }
}

/**
 * Build embed for log event
 */
function buildLogEmbed(event: MsgLogEvent): EmbedBuilder {
    const embed = new EmbedBuilder().setTimestamp();

    switch (event.type) {
        case 'success':
            embed
                .setColor(0x00FF00)
                .setTitle('Message Sent')
                .setAuthor({ name: event.username, iconURL: event.avatarURL })
                .addFields(
                    {
                        name: 'User',
                        value: `<@${event.userId}>`,
                        inline: true
                    },
                    {
                        name: 'Channel',
                        value: event.channelName ? `<#${event.channelId}> (${event.channelName})` : `<#${event.channelId}>`,
                        inline: true
                    }
                );

            if (event.messageContent) {
                const preview = event.messageContent.length > 100
                    ? event.messageContent.substring(0, 100) + '...'
                    : event.messageContent;
                embed.addFields({
                    name: 'Content Preview',
                    value: preview || '*[No text content]*',
                    inline: false
                });
            }

            if (event.messageAttachment) {
                embed.addFields({
                    name: 'Attachment',
                    value: ` ${event.messageAttachment}`,
                    inline: false
                });
            }
            break;

        case 'spam_blocked':
            embed
                .setColor(0xFFFF00)
                .setTitle('⚠️ Spam Detected - Message Blocked')
                .setAuthor({ name: event.username, iconURL: event.avatarURL })
                .addFields(
                    {
                        name: 'User',
                        value: `<@${event.userId}>`,
                        inline: true
                    },
                    {
                        name: 'Infractions',
                        value: `${event.infractions}/5`,
                        inline: true
                    }
                );

            if (event.duration) {
                embed.addFields({
                    name: 'Timeout Duration',
                    value: event.duration,
                    inline: true
                });
            }

            if (event.reason) {
                embed.addFields({
                    name: 'Reason',
                    value: event.reason,
                    inline: false
                });
            }
            break;

        case 'automod_blocked':
            embed
                .setColor(0x808080)
                .setTitle('⚫ AutoMod Block')
                .setAuthor({ name: event.username, iconURL: event.avatarURL })
                .addFields(
                    {
                        name: 'User',
                        value: `<@${event.userId}>`,
                        inline: true
                    },
                    {
                        name: 'Reason',
                        value: event.reason || 'AutoMod rule violation',
                        inline: true
                    }
                );

            if (event.messageContent) {
                const preview = event.messageContent.length > 100
                    ? event.messageContent.substring(0, 100) + '...'
                    : event.messageContent;
                embed.addFields({
                    name: 'Blocked Content',
                    value: preview,
                    inline: false
                });
            }
            break;

        case 'timeout_blocked':
        case 'ban_blocked':
            const isPermanent = event.type === 'ban_blocked';
            embed
                .setColor(0xFF0000)
                .setTitle(isPermanent ? '🔴 Permanent Ban - Message Blocked' : '🟡 Timeout - Message Blocked')
                .setAuthor({ name: event.username, iconURL: event.avatarURL })
                .addFields(
                    {
                        name: 'User',
                        value: `<@${event.userId}>`,
                        inline: true
                    },
                    {
                        name: 'Status',
                        value: isPermanent ? 'Permanently Banned' : 'Timed Out',
                        inline: true
                    }
                );

            if (event.reason) {
                embed.addFields({
                    name: 'Reason',
                    value: event.reason,
                    inline: false
                });
            }

            if (event.duration && !isPermanent) {
                embed.addFields({
                    name: 'Time Remaining',
                    value: event.duration,
                    inline: true
                });
            }
            break;

        case 'side_chat':
            embed
                .setColor(0xCC8833)
                .setTitle('🟠 Side chat - Message Blocked')
                .setAuthor({ name: event.username, iconURL: event.avatarURL })
                .addFields(
                    {
                        name: 'User',
                        value: `<@${event.userId}> (${event.userId})`,
                        inline: true
                    },
                    {
                        name: 'Status',
                        value: 'Message blocked',
                        inline: true
                    }
                );

            if (event.messageContent) {
                embed.addFields({
                    name: 'Content',
                    value: event.messageContent,
                    inline: false
                });
            }

            if (event.messageAttachment) {
                embed.addFields({
                    name: 'Attachment',
                    value: `${event.messageAttachment}`,
                    inline: false
                });
            }

            if (event.reason) {
                embed.addFields({
                    name: 'Reason',
                    value: event.reason,
                    inline: false
                });
            }

            if (event.duration) {
                embed.addFields({
                    name: 'Time Remaining',
                    value: event.duration,
                    inline: true
                });
            }
            break;
        case 'moderation':
            embed
                .setColor(0xFF4500)
                .setTitle('Moderation Action')
                .addFields(
                    {
                        name: 'User',
                        value: `<@${event.userId}> (${event.username})`,
                        inline: true
                    }
                );

            if (event.moderator) {
                embed.addFields({
                    name: 'Moderator',
                    value: event.moderator,
                    inline: true
                });
            }

            if (event.reason) {
                embed.addFields({
                    name: 'Action',
                    value: event.reason,
                    inline: false
                });
            }

            if (event.duration) {
                embed.addFields({
                    name: 'Duration',
                    value: event.duration,
                    inline: true
                });
            }

            if (event.infractions !== undefined) {
                embed.addFields({
                    name: 'Infractions',
                    value: event.infractions.toString(),
                    inline: true
                });
            }
            break;
    }

    return embed;
}

/**
 * Get recent log events for a guild
 */
export async function getRecentLogs(
    guildId: string,
    limit: number = 50,
    eventType?: MsgEventType
): Promise<MsgLoggingEvent[]> {
    try {
        const query: any = { guild_id: guildId };

        if (eventType) {
            query.event_type = eventType;
        }

        const events = await msg_logging_event_model
            .find(query)
            .sort({ timestamp: -1 })
            .limit(limit);

        return events;
    } catch (error) {
        console.error('[Msg Logger] Error getting recent logs:', error);
        return [];
    }
}

/**
 * Get log events for a specific user
 */
export async function getUserLogs(
    guildId: string,
    userId: string,
    limit: number = 50
): Promise<MsgLoggingEvent[]> {
    try {
        const events = await msg_logging_event_model
            .find({ guild_id: guildId, user_id: userId })
            .sort({ timestamp: -1 })
            .limit(limit);

        return events;
    } catch (error) {
        console.error('[Msg Logger] Error getting user logs:', error);
        return [];
    }
}

/**
 * Get log event statistics for a guild
 */
export async function getLogStats(guildId: string, days: number = 7): Promise<{
    total: number;
    success: number;
    spam_blocked: number;
    automod_blocked: number;
    timeout_blocked: number;
    ban_blocked: number;
    moderation: number;
    side_chat: number;
}> {
    try {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const stats = await msg_logging_event_model.aggregate([
            {
                $match: {
                    guild_id: guildId,
                    timestamp: { $gte: since }
                }
            },
            {
                $group: {
                    _id: '$event_type',
                    count: { $sum: 1 }
                }
            }
        ]);

        const result = {
            total: 0,
            success: 0,
            spam_blocked: 0,
            automod_blocked: 0,
            timeout_blocked: 0,
            ban_blocked: 0,
            moderation: 0,
            side_chat: 0
        };

        stats.forEach((stat) => {
            const type = stat._id as MsgEventType;
            const count = stat.count;
            result[type] = count;
            result.total += count;
        });

        return result;
    } catch (error) {
        console.error('[Msg Logger] Error getting log stats:', error);
        return {
            total: 0,
            success: 0,
            spam_blocked: 0,
            automod_blocked: 0,
            timeout_blocked: 0,
            ban_blocked: 0,
            moderation: 0,
            side_chat: 0
        };
    }
}

/**
 * Delete old log events (cleanup)
 */
export async function cleanupOldLogs(guildId: string, daysToKeep: number = 30): Promise<number> {
    try {
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

        const result = await msg_logging_event_model.deleteMany({
            guild_id: guildId,
            timestamp: { $lt: cutoffDate }
        });

        return result.deletedCount || 0;
    } catch (error) {
        console.error('[Msg Logger] Error cleaning up old logs:', error);
        return 0;
    }
}
