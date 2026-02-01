// discord/events/MessageCreate_autodelete_command_realtime.ts

import { Client, Events, Message, TextChannel, NewsChannel, ThreadChannel } from 'discord.js';
import { AutoDeleteConfig, TimeUnit, autoDeleteConfigs, getRepository } from '../models/autodelete';
import { handleNewMessage, getPerformanceStats } from '../util/autodelete';

// Helper function to check if a channel is a text-based channel that can send messages
function isTextBasedChannel(channel: any): channel is TextChannel | NewsChannel | ThreadChannel {
    return channel.isTextBased && channel.isTextBased() && typeof channel.send === 'function';
}

// Helper function to parse time string like "12h", "5m", "2d"
function parseTimeString(timeString: string): { value: number, unit: TimeUnit } | null {
    const match = /^(\d+)([mhd])$/i.exec(timeString);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unitChar = match[2].toLowerCase();

    let unit: TimeUnit;
    switch (unitChar) {
        case 'm': unit = TimeUnit.MINUTES; break;
        case 'h': unit = TimeUnit.HOURS; break;
        case 'd': unit = TimeUnit.DAYS; break;
        default: return null;
    }

    return { value, unit };
}

export default {
    name: Events.MessageCreate,
    async execute(client: Client, message: Message) {
        // Ignore messages from other bots (except itself) or DMs
        if ((message.author.bot && message.author.id !== client.user?.id) || !message.guild) return;

        // Make sure we have a text-based channel
        if (!message.channel || !isTextBasedChannel(message.channel)) return;

        // Check if message is mentioning the bot
        if (message.mentions.has(client.user?.id!)) {
            // Check if this is a self-mention (bot mentioning itself)
            const isSelfMention = message.author.id === client.user?.id;

            // Get the message content without the mention to parse the command
            const content = message.content
                .replace(new RegExp(`<@!?${client.user?.id}>`, 'g'), '')
                .trim();

            // Split the content into parts
            const parts = content.split(/\s+/);

            // Check if it's a setup command
            if (parts[0]?.toLowerCase() === 'setup' && parts.length >= 3) {
                // If not a self-mention, check permissions
                if (!isSelfMention) {
                    // Check if user has Manage Messages permission
                    const member = await message.guild.members.fetch(message.author);
                    if (!member.permissions.has('ManageMessages')) {
                        await message.reply('You need the "Manage Messages" permission to set up auto-deletion.');
                        return;
                    }
                }

                // Parse the parameters - we accept either order: [count time] or [time count]
                let maxMessages = 0;
                let maxAge = 0;
                let timeUnit = TimeUnit.HOURS;

                // Try to parse each parameter
                for (let i = 1; i < parts.length && i <= 2; i++) {
                    const part = parts[i];

                    // Check if it's a time string (like 12h, 5m, 2d)
                    const timeResult = parseTimeString(part);
                    if (timeResult) {
                        maxAge = timeResult.value;
                        timeUnit = timeResult.unit;
                        continue;
                    }

                    // Otherwise assume it's a message count
                    const count = parseInt(part, 10);
                    if (!isNaN(count) && count >= 0) {
                        maxMessages = count;
                    }
                }

                // Validate we have at least one parameter
                if (maxMessages === 0 && maxAge === 0) {
                    const reply = 'Please specify either a maximum message count, a time period, or both. Example: `@bot setup 100 24h`';
                    if (isSelfMention) {
                        await message.channel.send(reply);
                    } else {
                        await message.reply(reply);
                    }
                    return;
                }

                // Create config
                const channelId = message.channel.id;
                const guildId = message.guild.id;

                // Fetch pinned messages to preserve them
                const pinnedResponse = await message.channel.messages.fetchPins();
                const pinnedIds = new Set<string>(pinnedResponse.items.map(pin => pin.message.id));

                // Create or update configuration
                const config: AutoDeleteConfig = {
                    channelId,
                    guildId,
                    maxMessages,
                    maxAge,
                    timeUnit,
                    enabled: true,
                    lastProcessed: new Date(),
                    keepMessages: pinnedIds
                };

                // Save to database and cache
                autoDeleteConfigs.set(channelId, config);
                await getRepository().saveConfig(config);

                // Trigger immediate real-time cleanup check
                setTimeout(() => {
                    handleNewMessage(client, channelId, 'setup-trigger', Date.now(), false, {
                        isCatchup: true,
                        totalToDelete: 0,
                        reason: 'setup'
                    }).catch(err => console.error(`Error triggering real-time cleanup after setup for channel ${channelId}:`, err));
                }, 2000);


                // Reply with confirmation - emphasize real-time nature
                const timeString = maxAge > 0 ? `${maxAge} ${timeUnit.toLowerCase()}` : 'no time limit';
                const countString = maxMessages > 0 ? `${maxMessages} messages` : 'no message limit';

                const confirmationMessage = `Messages will be deleted after ${timeString} or ${countString} messages, whichever comes first.`;

                if (isSelfMention) {
                    // await message.channel.send(confirmationMessage);
                } else {
                    await message.reply(confirmationMessage);
                }

                // Add emoji reaction to confirm setup
                try {
                    if (!isSelfMention)
                        await message.react('✅');
                    // await message.react('⚡');
                } catch (error) {
                    // Ignore reaction errors
                }

                return;
            }

            // Help command - updated for real-time system
            else if (parts[0]?.toLowerCase() === 'help') {
                const helpMessage =
                    `🤖 **Real-time AutoDelete Commands:**\n\n` +
                    `\`@bot setup [count] [time]\` - Set up real-time auto-deletion\n` +
                    `   Example: \`@bot setup 100 24h\`\n` +
                    `\`@bot disable\` - Disable auto-deletion for this channel\n` +
                    `\`@bot enable\` - Enable auto-deletion for this channel\n` +
                    `\`@bot status\` - Show current settings and performance\n` +
                    `\`@bot stats\` - Show detailed real-time performance statistics\n\n` +
                    `⏱️ **Time formats:**\n` +
                    `• \`m\` = minutes (e.g., \`30m\`)\n` +
                    `• \`h\` = hours (e.g., \`12h\`)\n` +
                    `• \`d\` = days (e.g., \`7d\`)\n\n`
                    ;

                if (message.author.id === client.user?.id) {
                    await message.channel.send(helpMessage);
                } else {
                    await message.reply(helpMessage);
                }
                return;
            }

            // Disable command
            else if (parts[0]?.toLowerCase() === 'disable') {
                const isSelfMention = message.author.id === client.user?.id;

                // If not a self-mention, check permissions
                if (!isSelfMention) {
                    // Check permissions
                    const member = await message.guild.members.fetch(message.author);
                    if (!member.permissions.has('ManageMessages')) {
                        await message.reply('You need the "Manage Messages" permission to disable auto-deletion.');
                        return;
                    }
                }

                const channelId = message.channel.id;
                const config = autoDeleteConfigs.get(channelId);

                if (!config) {
                    const response = '❌ Real-time auto-deletion is not set up for this channel.';
                    if (isSelfMention) {
                        await message.channel.send(response);
                    } else {
                        await message.reply(response);
                    }
                    return;
                }

                config.enabled = false;
                autoDeleteConfigs.set(channelId, config);
                await getRepository().saveConfig(config);

                const response = '🛑 **Real-time auto-deletion has been disabled** for this channel.\n\n' +
                    'Your configuration is saved and can be re-enabled with `@bot enable`.';
                if (isSelfMention) {
                    await message.channel.send(response);
                } else {
                    await message.reply(response);
                }

                try {
                    await message.react('✅');
                } catch (error) {
                    // Ignore reaction errors
                }

                return;
            }

            // Enable command
            else if (parts[0]?.toLowerCase() === 'enable') {
                const isSelfMention = message.author.id === client.user?.id;

                // If not a self-mention, check permissions
                if (!isSelfMention) {
                    // Check permissions
                    const member = await message.guild.members.fetch(message.author);
                    if (!member.permissions.has('ManageMessages')) {
                        await message.reply('You need the "Manage Messages" permission to enable auto-deletion.');
                        return;
                    }
                }

                const channelId = message.channel.id;
                const config = autoDeleteConfigs.get(channelId);

                if (!config) {
                    const response = '❌ Real-time auto-deletion is not set up for this channel. Use `@bot setup` first.';
                    if (isSelfMention) {
                        await message.channel.send(response);
                    } else {
                        await message.reply(response);
                    }
                    return;
                }

                config.enabled = true;
                autoDeleteConfigs.set(channelId, config);
                await getRepository().saveConfig(config);

                // Trigger immediate real-time cleanup check
                setTimeout(() => {
                    handleNewMessage(client, channelId, 'enable-trigger', Date.now(), false, {
                        isCatchup: true,
                        totalToDelete: 0,
                        reason: 'enable'
                    }).catch(err => console.error(`Error triggering real-time cleanup after enable for channel ${channelId}:`, err));
                }, 2000);

                const response = '✅ **Real-time auto-deletion has been enabled** for this channel!\n\n' +
                    '⚡ Messages will be deleted within **10-20 seconds** when limits are exceeded.\n' +
                    '🧠 System will automatically optimize performance for your server.';
                if (isSelfMention) {
                    await message.channel.send(response);
                } else {
                    await message.reply(response);
                }

                try {
                    await message.react('✅');
                    await message.react('⚡');
                } catch (error) {
                    // Ignore reaction errors
                }

                return;
            }

            // Status command - enhanced with performance info
            else if (parts[0]?.toLowerCase() === 'status') {
                const isSelfMention = message.author.id === client.user?.id;
                const channelId = message.channel.id;
                const config = autoDeleteConfigs.get(channelId);

                if (!config) {
                    const response = '❌ Real-time auto-deletion is not set up for this channel.';
                    if (isSelfMention) {
                        await message.channel.send(response);
                    } else {
                        await message.reply(response);
                    }
                    return;
                }

                const timeString = config.maxAge > 0 ? `${config.maxAge} ${config.timeUnit.toLowerCase()}` : 'no time limit';
                const countString = config.maxMessages > 0 ? `${config.maxMessages} messages` : 'no message limit';
                const status = config.enabled ? '✅ **Enabled (Real-time)**' : '🛑 **Disabled**';

                // Get performance stats for this channel
                const stats = getPerformanceStats();
                const channelStats = stats.channels.find(c => c.channelId === channelId);

                let statusMessage =
                    `🤖 **Real-time Auto-deletion Status**\n\n` +
                    `📊 **Configuration:**\n` +
                    `• Status: ${status}\n` +
                    `• Maximum messages: ${countString}\n` +
                    `• Maximum age: ${timeString}\n` +
                    `• Protected messages: ${config.keepMessages.size} (pinned messages are automatically protected)\n\n`;

                if (config.enabled && channelStats) {
                    // Add performance information
                    const activityStatus = channelStats.stats.isHighActivity ? '🔥 High Activity' : '📊 Normal Activity';
                    const performanceStatus = channelStats.stats.averageResponseTime < 300 ?
                        '🟢 Excellent Performance' :
                        channelStats.stats.averageResponseTime < 800 ?
                            '🟡 Good Performance' :
                            '🟠 Moderate Performance';

                    statusMessage +=
                        `**Real-time Performance:**\n` +
                        `• Activity Level: ${activityStatus}\n` +
                        `• Performance: ${performanceStatus} (${channelStats.stats.averageResponseTime.toFixed(0)}ms avg)\n` +
                        `• Batch Size: ${channelStats.stats.batchSize} messages\n` +
                        `• API Efficiency: ${channelStats.stats.apiCallsThisMinute}/${channelStats.stats.maxApiCallsPerMinute} calls/min\n` +
                        `• Pending Operations: ${channelStats.stats.pendingDeletionsCount + channelStats.stats.batchQueueLength}\n\n` +
                        `**Auto-Optimization:** System automatically adjusts based on server performance`;
                } else if (config.enabled) {
                    statusMessage +=
                        `**Real-time System:** Active and ready\n` +
                        `**Auto-Optimization:** Will begin after first few messages\n` +
                        ` **Response Time:** 10-20 seconds for message limit violations`;
                }

                if (isSelfMention) {
                    await message.channel.send(statusMessage);
                } else {
                    await message.reply(statusMessage);
                }

                return;
            }

            // Stats command - detailed performance statistics
            else if (parts[0]?.toLowerCase() === 'stats') {
                const isSelfMention = message.author.id === client.user?.id;
                const channelId = message.channel.id;
                const config = autoDeleteConfigs.get(channelId);

                if (!config) {
                    const response = '❌ Real-time auto-deletion is not set up for this channel. Use `@bot setup` first.';
                    if (isSelfMention) {
                        await message.channel.send(response);
                    } else {
                        await message.reply(response);
                    }
                    return;
                }

                const stats = getPerformanceStats();
                const channelStats = stats.channels.find(c => c.channelId === channelId);

                let statsMessage = `📈 **Real-time AutoDelete Performance Statistics**\n\n`;

                // Global stats
                statsMessage +=
                    `🌐 **Global Performance:**\n` +
                    `• Total API Calls: ${stats.global.totalApiCalls}\n` +
                    `• Total Errors: ${stats.global.totalErrors}\n` +
                    `• Rate Limit Hits: ${stats.global.rateLimitHits}\n` +
                    `• Active Channels: ${stats.channels.length}\n\n`;

                if (channelStats) {
                    // Channel-specific stats
                    const activityIndicator = channelStats.stats.isHighActivity ? '🔥' : '📊';
                    const performanceIndicator = channelStats.stats.averageResponseTime < 300 ? '🟢' :
                        channelStats.stats.averageResponseTime < 800 ? '🟡' : '🟠';

                    statsMessage +=
                        `${activityIndicator} **This Channel:**\n` +
                        `• Messages Tracked: ${channelStats.stats.messageCount}\n` +
                        `• Activity Level: ${channelStats.stats.isHighActivity ? 'High Activity' : 'Normal Activity'}\n` +
                        `• Pending Deletions: ${channelStats.stats.pendingDeletionsCount}\n` +
                        `• Batch Queue: ${channelStats.stats.batchQueueLength}\n\n` +

                        `${performanceIndicator} **Dynamic Optimization:**\n` +
                        `• Batch Size: ${channelStats.stats.batchSize} messages\n` +
                        `• Batch Delay: ${channelStats.stats.batchDelay}ms\n` +
                        `• Average Response: ${channelStats.stats.averageResponseTime.toFixed(0)}ms\n` +
                        `• API Calls/Min: ${channelStats.stats.apiCallsThisMinute}/${channelStats.stats.maxApiCallsPerMinute}\n\n`;

                    // Performance assessment
                    if (channelStats.stats.averageResponseTime < 300) {
                        statsMessage += `🟢 **Status:** Excellent performance - system running optimally\n`;
                    } else if (channelStats.stats.averageResponseTime < 800) {
                        statsMessage += `🟡 **Status:** Good performance - minor optimizations active\n`;
                    } else {
                        statsMessage += `🟠 **Status:** Moderate performance - system auto-adjusting for stability\n`;
                    }

                    if (stats.global.rateLimitHits > 5) {
                        statsMessage += `⚠️ **Note:** Rate limits detected - system automatically reducing API usage\n`;
                    }
                } else {
                    statsMessage +=
                        `📊 **This Channel:**\n` +
                        `• Status: Initialized but no activity tracked yet\n` +
                        `• Performance tracking will begin with the next few messages\n\n`;
                }

                if (isSelfMention) {
                    await message.channel.send(statsMessage);
                } else {
                    await message.reply(statsMessage);
                }

                return;
            }
        }
    }
};