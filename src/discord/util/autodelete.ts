// src/discord/util/autodelete.ts

import { Client, Collection, Message, Snowflake, TextChannel, NewsChannel, ThreadChannel, VoiceChannel, StageChannel, ForumChannel, MediaChannel, GuildBasedChannel } from 'discord.js';
import { AutoDeleteConfig, TimeUnit, autoDeleteConfigs, getRepository } from '../models/autodelete';

// Type for all text-based channels that can have messages
type TextBasedGuildChannel = TextChannel | NewsChannel | ThreadChannel | VoiceChannel | StageChannel;

interface ProcessingContext {
    isCatchup: boolean;
    totalToDelete: number;
    reason: 'startup' | 'enable' | 'setup' | 'manual' | 'normal' | 'age-check';
    silent?: boolean; // Suppress logs during bulk startup operations
}

// Real-time channel state tracking
interface ChannelState {
    // Message tracking
    messageCount: number;
    lastKnownMessages: Map<string, { timestamp: number; pinned: boolean }>; // Cache recent messages

    // Activity tracking with precise timing
    recentMessageTimes: number[]; // Timestamps of recent messages
    currentMessagesPerSecond: number;
    lastActivityCalculation: number;

    // Processing mode
    processingMode: 'single' | 'batch' | 'paused';
    lastModeSwitch: number;

    // Pending operations
    pendingDeletions: Set<string>;
    singleDeleteQueue: string[]; // Queue for individual deletions
    batchDeleteQueue: string[]; // Queue for batch deletions

    // Processing state
    isProcessing: boolean;
    lastProcessTime: number;
    processDelay: number; // Dynamic delay between operations

    // Performance tracking
    apiCallsThisMinute: number;
    lastApiCallReset: number;
    recentResponseTimes: number[];
    consecutiveErrors: number;

    // Rate limiting
    maxApiCallsPerMinute: number;
    rateLimitBackoff: number;

    // Channel type tracking
    channelType: string;

    // Age-based deletion tracking - NEW
    lastAgeCheck: number;
    nextScheduledAgeCheck: number;
    ageCheckInterval: number; // Dynamic interval based on activity
}

// Global state management
const channelStates = new Map<string, ChannelState>();

// Global performance tracker
const globalPerformanceTracker = {
    totalApiCalls: 0,
    totalErrors: 0,
    averageLatency: 0,
    rateLimitHits: 0,
    lastRateLimitHit: 0
};

// Age monitoring system - NEW
const ageMonitoringTimeouts = new Map<string, NodeJS.Timeout>();

// Configuration for different processing modes
const PROCESSING_CONFIG = {
    // Activity thresholds (messages per second)
    SINGLE_MODE_THRESHOLD: 0.8,        // Below this = single deletion mode
    BATCH_MODE_THRESHOLD: 1.8,         // Above this = batch deletion mode
    PAUSE_MODE_THRESHOLD: 8.0,         // Above this = pause and wait

    // Timing controls
    SINGLE_DELETE_DELAY: 75,          // 100ms between single deletes
    BATCH_PROCESS_DELAY: 1000,         // 2 seconds for batch processing
    ACTIVITY_WINDOW: 10000,            // 10 seconds to calculate activity

    // API limits
    MAX_API_CALLS_NORMAL: 40,          // Normal API limit per minute
    MAX_API_CALLS_CONSERVATIVE: 20,    // Conservative limit when errors occur

    // Queue limits
    MAX_SINGLE_QUEUE: 20,              // Max messages in single delete queue
    MAX_BATCH_QUEUE: 100,               // Max messages in batch delete queue

    // Age checking intervals - NEW
    AGE_CHECK_HIGH_ACTIVITY: 30000,    // 30 seconds for high activity channels
    AGE_CHECK_NORMAL_ACTIVITY: 120000, // 2 minutes for normal activity channels
    AGE_CHECK_LOW_ACTIVITY: 300000,    // 5 minutes for low activity channels
    AGE_CHECK_INACTIVE: 600000,        // 10 minutes for completely inactive channels
};

/**
 * Helper function to check if a channel is a supported text-based channel
 */
function isTextBasedGuildChannel(channel: any): channel is TextBasedGuildChannel {
    if (!channel || !channel.guild) return false;

    // Check if channel has text capabilities
    if (!channel.isTextBased || !channel.isTextBased()) return false;

    // Check for send method (ability to send messages)
    if (typeof channel.send !== 'function') return false;

    // Check for messages property/method (ability to manage messages)
    if (!channel.messages) return false;

    return true;
}

/**
 * Get channel type string for logging/debugging
 */
function getChannelTypeString(channel: GuildBasedChannel): string {
    switch (channel.type) {
        case 0: return 'Text Channel';
        case 2: return 'Voice Channel';
        case 5: return 'News Channel';
        case 10: return 'News Thread';
        case 11: return 'Public Thread';
        case 12: return 'Private Thread';
        case 13: return 'Stage Channel';
        case 15: return 'Forum Channel';
        case 16: return 'Media Channel';
        default: return `Unknown (${channel.type})`;
    }
}

/**
 * Interface for performance statistics return type
 */
interface ChannelPerformanceStats {
    messageCount: number;
    pendingDeletionsCount: number;
    batchSize: number;
    batchDelay: number;
    maxApiCallsPerMinute: number;
    averageResponseTime: number;
    isHighActivity: boolean;
    apiCallsThisMinute: number;
    batchQueueLength: number;
    processingMode?: string;
    messagesPerSecond?: number;
    channelType?: string;
    lastAgeCheck?: number;
    nextAgeCheck?: number;
}

/**
 * Initialize or get channel state with smart defaults
 */
function getChannelState(channelId: string, channelType?: string): ChannelState {
    if (!channelStates.has(channelId)) {
        const now = Date.now();
        const state: ChannelState = {
            messageCount: 0,
            lastKnownMessages: new Map(),

            recentMessageTimes: [],
            currentMessagesPerSecond: 0,
            lastActivityCalculation: now,

            processingMode: 'single',
            lastModeSwitch: now,

            pendingDeletions: new Set(),
            singleDeleteQueue: [],
            batchDeleteQueue: [],

            isProcessing: false,
            lastProcessTime: 0,
            processDelay: PROCESSING_CONFIG.SINGLE_DELETE_DELAY,

            apiCallsThisMinute: 0,
            lastApiCallReset: now,
            recentResponseTimes: [],
            consecutiveErrors: 0,

            maxApiCallsPerMinute: PROCESSING_CONFIG.MAX_API_CALLS_NORMAL,
            rateLimitBackoff: 0,

            channelType: channelType || 'Unknown',

            // Age-based deletion tracking - NEW
            lastAgeCheck: now,
            nextScheduledAgeCheck: now + PROCESSING_CONFIG.AGE_CHECK_LOW_ACTIVITY,
            ageCheckInterval: PROCESSING_CONFIG.AGE_CHECK_LOW_ACTIVITY,
        };
        channelStates.set(channelId, state);
    }
    return channelStates.get(channelId)!;
}

/**
 * Calculate current activity level and adjust processing mode
 */
function updateActivityTracking(state: ChannelState): void {
    const now = Date.now();

    // Clean old message times (keep only recent ones)
    state.recentMessageTimes = state.recentMessageTimes.filter(
        time => (now - time) < PROCESSING_CONFIG.ACTIVITY_WINDOW
    );

    // Calculate messages per second
    if (state.recentMessageTimes.length > 0) {
        const timeSpan = Math.max(now - state.recentMessageTimes[0], 1000); // At least 1 second
        state.currentMessagesPerSecond = (state.recentMessageTimes.length / timeSpan) * 1000;
    } else {
        state.currentMessagesPerSecond = 0;
    }

    // Determine processing mode based on activity
    let newMode: 'single' | 'batch' | 'paused' = 'single';

    if (state.currentMessagesPerSecond >= PROCESSING_CONFIG.PAUSE_MODE_THRESHOLD) {
        newMode = 'paused';
    } else if (state.currentMessagesPerSecond >= PROCESSING_CONFIG.BATCH_MODE_THRESHOLD) {
        newMode = 'batch';
    } else {
        newMode = 'single';
    }

    // Switch modes if needed (with some hysteresis to prevent rapid switching)
    if (newMode !== state.processingMode && (now - state.lastModeSwitch) > 2000) {
        // console.log(`${state.channelType} activity: ${state.currentMessagesPerSecond.toFixed(2)} msg/s - switching to ${newMode} mode`);
        state.processingMode = newMode;
        state.lastModeSwitch = now;

        // Adjust processing delay based on mode
        switch (newMode) {
            case 'single':
                state.processDelay = PROCESSING_CONFIG.SINGLE_DELETE_DELAY;
                break;
            case 'batch':
                state.processDelay = PROCESSING_CONFIG.BATCH_PROCESS_DELAY;
                break;
            case 'paused':
                state.processDelay = 5000; // Wait 5 seconds before resuming
                break;
        }
    }

    // Update age check interval based on activity - NEW
    updateAgeCheckInterval(state);

    state.lastActivityCalculation = now;
}

/**
 * Update age check interval based on activity level - NEW
 */
function updateAgeCheckInterval(state: ChannelState): void {
    let newInterval: number;

    if (state.currentMessagesPerSecond > PROCESSING_CONFIG.BATCH_MODE_THRESHOLD) {
        // High activity - check more frequently
        newInterval = PROCESSING_CONFIG.AGE_CHECK_HIGH_ACTIVITY;
    } else if (state.currentMessagesPerSecond > 0.1) {
        // Normal activity
        newInterval = PROCESSING_CONFIG.AGE_CHECK_NORMAL_ACTIVITY;
    } else if (state.recentMessageTimes.length > 0) {
        // Low activity but some recent messages
        newInterval = PROCESSING_CONFIG.AGE_CHECK_LOW_ACTIVITY;
    } else {
        // Completely inactive
        newInterval = PROCESSING_CONFIG.AGE_CHECK_INACTIVE;
    }

    // Only update if significantly different to avoid constant rescheduling
    if (Math.abs(newInterval - state.ageCheckInterval) > 30000) {
        state.ageCheckInterval = newInterval;
        // The next scheduled check will be updated when the current one completes
    }
}

/**
 * Schedule age-based monitoring for a channel - NEW
 */
function scheduleAgeMonitoring(client: Client, channelId: string): void {
    // Clear existing timeout
    const existingTimeout = ageMonitoringTimeouts.get(channelId);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
    }

    const config = autoDeleteConfigs.get(channelId);
    if (!config || !config.enabled || config.maxAge <= 0) {
        ageMonitoringTimeouts.delete(channelId);
        return;
    }

    const state = getChannelState(channelId);
    const now = Date.now();

    // Calculate when the next check should happen
    let nextCheckDelay = state.ageCheckInterval;

    // If we have a scheduled check time that's reasonable, use it
    if (state.nextScheduledAgeCheck > now && state.nextScheduledAgeCheck < now + state.ageCheckInterval * 2) {
        nextCheckDelay = state.nextScheduledAgeCheck - now;
    }

    // Ensure minimum delay to prevent spam
    nextCheckDelay = Math.max(nextCheckDelay, 10000); // At least 10 seconds

    const timeout = setTimeout(() => {
        performAgeCheck(client, channelId);
    }, nextCheckDelay);

    ageMonitoringTimeouts.set(channelId, timeout);
    state.nextScheduledAgeCheck = now + nextCheckDelay;
}

/**
 * Perform age-based check for expired messages - NEW
 */
async function performAgeCheck(client: Client, channelId: string): Promise<void> {
    const config = autoDeleteConfigs.get(channelId);
    const state = getChannelState(channelId);

    if (!config || !config.enabled || config.maxAge <= 0) {
        ageMonitoringTimeouts.delete(channelId);
        return;
    }

    state.lastAgeCheck = Date.now();

    try {
        // Update activity tracking to adjust intervals
        updateActivityTracking(state);

        // Process the channel for age-based deletions
        await handleNewMessage(client, channelId, 'age-check-trigger', Date.now(), false, {
            isCatchup: false,
            totalToDelete: 0,
            reason: 'age-check'
        });

    } catch (error) {
        console.error(`Error during age check for channel ${channelId}:`, error);
    } finally {
        // Schedule the next age check
        scheduleAgeMonitoring(client, channelId);
    }
}

/**
 * Check if we can make an API call without hitting rate limits
 */
function canMakeApiCall(channelId: string): boolean {
    const state = getChannelState(channelId);
    const now = Date.now();

    // Reset counters if needed
    if (now - state.lastApiCallReset > 60000) {
        state.apiCallsThisMinute = 0;
        state.lastApiCallReset = now;
    }

    // Check channel-specific limits
    if (state.apiCallsThisMinute >= state.maxApiCallsPerMinute) {
        return false;
    }

    // Check rate limit backoff
    if (state.rateLimitBackoff > now) {
        return false;
    }

    // Check global rate limit buffer
    if (now - globalPerformanceTracker.lastRateLimitHit < 10000) {
        return false; // Wait 10 seconds after any rate limit hit
    }

    return true;
}

/**
 * Handle new message with smart processing mode detection
 */
export async function handleNewMessage(
    client: Client,
    channelId: string,
    messageId: string,
    timestamp: number,
    pinned: boolean = false,
    context?: ProcessingContext
): Promise<void> {
    const config = autoDeleteConfigs.get(channelId);
    if (!config || !config.enabled) return;

    // Get channel to determine type
    const channel = client.channels.cache.get(channelId);
    if (!channel || !isTextBasedGuildChannel(channel)) return;

    const channelTypeString = getChannelTypeString(channel);
    const state = getChannelState(channelId, channelTypeString);
    const now = Date.now();

    // Enhanced catchup detection
    const isCatchupOperation = context?.isCatchup ||
        messageId.includes('startup') ||
        messageId.includes('setup') ||
        messageId.includes('enable') ||
        messageId.includes('manual') ||
        context?.reason === 'startup' ||
        context?.reason === 'setup' ||
        context?.reason === 'enable' ||
        context?.reason === 'manual';

    // For catchup operations, use the optimized catchup system
    if (isCatchupOperation) {
        if (!context?.silent) {
            console.log(`Triggering optimized catchup for ${channelTypeString} ${getChannelDisplayName(channel)}`);
        }

        setTimeout(() => {
            handleCatchupOperation(client, channelId, context || {
                isCatchup: true,
                totalToDelete: 0,
                reason: 'startup'
            }).then(() => {
                // Start age monitoring after catchup
                if (config.maxAge > 0) {
                    scheduleAgeMonitoring(client, channelId);
                }
            }).catch(err => {
                console.error(`Error in optimized catchup for channel ${channelId}:`, err);
                // Still start age monitoring even if there was an error
                if (config.maxAge > 0) {
                    scheduleAgeMonitoring(client, channelId);
                }
            });
        }, 100);

        return;
    }

    // Check if this is an age-check trigger
    const isAgeCheckTrigger = context?.reason === 'age-check' || messageId.includes('age-check');

    // For age-check triggers, process immediately but don't track as new activity
    if (isAgeCheckTrigger) {
        setTimeout(() => processChannelQueue(client, channelId, context), 100);
        return;
    }

    // Track this message's arrival time for normal operations
    state.recentMessageTimes.push(now);

    // Update activity tracking and processing mode
    updateActivityTracking(state);

    // Cache this message
    state.lastKnownMessages.set(messageId, { timestamp, pinned });

    // Clean old cached messages
    if (state.lastKnownMessages.size > 200) {
        const entries = Array.from(state.lastKnownMessages.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, 100); // Remove oldest 100
        toRemove.forEach(([id]) => state.lastKnownMessages.delete(id));
    }

    // Skip pinned messages
    if (pinned) {
        config.keepMessages.add(messageId);
        return;
    }

    // Start age monitoring if it's not already running and we have age-based deletion
    if (config.maxAge > 0 && !ageMonitoringTimeouts.has(channelId)) {
        scheduleAgeMonitoring(client, channelId);
    }

    // For message count limits, we need to check if we need to delete something
    if (config.maxMessages > 0) {
        // Schedule processing based on current mode
        if (!state.isProcessing) {
            if (state.processingMode === 'paused') {
                // In pause mode, wait longer before processing
                setTimeout(() => processChannelQueue(client, channelId), 5000);
            } else {
                // Normal processing
                setTimeout(() => processChannelQueue(client, channelId), state.processDelay);
            }
        }
    }

    // Handle age-based deletion separately
    if (config.maxAge > 0) {
        const ageLimit = calculateMaxAge(config);
        const messageAge = now - timestamp;

        if (messageAge > ageLimit) {
            // This message is already expired, process immediately
            setTimeout(() => processChannelQueue(client, channelId), 100);
        }
    }
}


/**
 * Process the channel's deletion queue based on current mode
 */
async function processChannelQueue(client: Client, channelId: string, context?: ProcessingContext): Promise<void> {
    const config = autoDeleteConfigs.get(channelId);
    const state = getChannelState(channelId);

    if (!config || !config.enabled || state.isProcessing) {
        return;
    }

    // For catchup operations, be more lenient with rate limits
    const isCatchupOperation = context?.isCatchup || false;
    const isAgeCheck = context?.reason === 'age-check';

    if (!isCatchupOperation && !isAgeCheck && !canMakeApiCall(channelId)) {
        // Reschedule for later
        setTimeout(() => processChannelQueue(client, channelId, context), 5000);
        return;
    }

    state.isProcessing = true;

    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel || !isTextBasedGuildChannel(channel)) {
            channelStates.delete(channelId);
            await getRepository().deleteConfig(channelId);
            return;
        }

        // Update channel type in state if needed
        const channelTypeString = getChannelTypeString(channel);
        state.channelType = channelTypeString;

        // Get current accurate message count
        const { deletableMessages, totalFetched } = await getAccurateMessageCount(channel, config, state);
        state.messageCount = deletableMessages.length;

        const channelName = getChannelDisplayName(channel);

        // Determine what needs to be deleted
        const messagesToDelete: Message[] = [];
        const now = Date.now();
        const ageLimit = config.maxAge > 0 ? calculateMaxAge(config) : 0;

        // Age-based deletion - check all messages for expiration
        if (config.maxAge > 0) {
            const expiredMessages = deletableMessages.filter(msg =>
                (now - msg.createdTimestamp) > ageLimit
            );
            messagesToDelete.push(...expiredMessages);

            // For age checks, log if we found expired messages
            if (isAgeCheck && expiredMessages.length > 0) {
                console.log(`${channelTypeString} ${channelName}: Age check found ${expiredMessages.length} expired messages`);
            }
        }

        // Count-based deletion
        if (config.maxMessages > 0 && deletableMessages.length > config.maxMessages) {
            const sortedMessages = deletableMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            const excessCount = deletableMessages.length - config.maxMessages;
            const excessMessages = sortedMessages.slice(0, excessCount);

            // Add excess messages (avoid duplicates)
            for (const msg of excessMessages) {
                if (!messagesToDelete.some(m => m.id === msg.id)) {
                    messagesToDelete.push(msg);
                }
            }
        }

        // Execute deletions based on current mode and context
        if (messagesToDelete.length > 0) {
            await executeSmartDeletion(channel, messagesToDelete, state, context);
        }

    } catch (error) {
        console.error(`Error processing channel queue for ${channelId}:`, error);
        state.consecutiveErrors++;

        // Handle rate limits
        if (error && typeof error === 'object' && 'code' in error) {
            if ((error as any).code === 429) {
                globalPerformanceTracker.rateLimitHits++;
                globalPerformanceTracker.lastRateLimitHit = Date.now();
            }
        }

        // Reduce API limit if too many errors
        if (state.consecutiveErrors > 3) {
            state.maxApiCallsPerMinute = PROCESSING_CONFIG.MAX_API_CALLS_CONSERVATIVE;
        }

    } finally {
        state.isProcessing = false;
        state.lastProcessTime = Date.now();

        // Schedule next processing if we're in continuous mode and not a one-time catchup
        if (!context?.isCatchup && !isAgeCheck) {
            if (state.processingMode === 'single' && state.singleDeleteQueue.length > 0) {
                setTimeout(() => processChannelQueue(client, channelId), state.processDelay);
            } else if (state.processingMode === 'batch' && state.batchDeleteQueue.length > 0) {
                setTimeout(() => processChannelQueue(client, channelId), state.processDelay);
            }
        }
    }
}

/**
 * Get channel display name for logging
 */
function getChannelDisplayName(channel: TextBasedGuildChannel): string {
    // For threads, show parent channel name + thread name
    if (channel.isThread()) {
        const parent = channel.parent;
        const parentName = parent?.name || 'Unknown Parent';
        return `${parentName} > ${channel.name}`;
    }

    // For voice/stage channels, they might not have a traditional name
    if ('name' in channel && channel.name) {
        return channel.name;
    }

    // Fallback to channel ID
    return channel.id;
}

/**
 * Get accurate message count with smart fetching
 */
async function getAccurateMessageCount(
    channel: TextBasedGuildChannel,
    config: AutoDeleteConfig,
    state: ChannelState
): Promise<{ deletableMessages: Message[]; totalFetched: number }> {
    // Fetch enough messages to get accurate count
    const fetchLimit = Math.max(config.maxMessages * 2, 50);

    try {
        const messages = await channel.messages.fetch({ limit: Math.min(fetchLimit, 100) });

        state.apiCallsThisMinute++;
        globalPerformanceTracker.totalApiCalls++;

        const deletableMessages = Array.from(messages.values()).filter(msg =>
            !msg.pinned &&
            !config.keepMessages.has(msg.id) &&
            !state.pendingDeletions.has(msg.id)
        );

        return { deletableMessages, totalFetched: messages.size };
    } catch (error) {
        console.error(`Error fetching messages from ${state.channelType} ${channel.id}:`, error);
        throw error;
    }
}

/**
 * Execute smart deletion based on current processing mode
 */
async function executeSmartDeletion(
    channel: TextBasedGuildChannel,
    messagesToDelete: Message[],
    state: ChannelState,
    context?: ProcessingContext
): Promise<void> {
    const channelName = getChannelDisplayName(channel);
    const isCatchupOperation = context?.isCatchup || false;

    // Mark messages as pending
    messagesToDelete.forEach(msg => state.pendingDeletions.add(msg.id));

    try {
        // For catchup operations with many messages, force batch mode
        if (isCatchupOperation && messagesToDelete.length > 5) {
            await executeBatchDeletions(channel, messagesToDelete, state, true); // Force batch mode
        } else if (state.processingMode === 'single') {
            // Single deletion mode - but allow more messages for catchup
            await executeSingleDeletions(channel, messagesToDelete, state, isCatchupOperation);
        } else if (state.processingMode === 'batch') {
            // Batch deletion mode - group deletions
            await executeBatchDeletions(channel, messagesToDelete, state);
        }
        // If paused, don't delete anything right now

    } catch (error) {
        console.error(`Error in smart deletion for ${state.channelType} ${channelName}:`, error);
        state.consecutiveErrors++;
    } finally {
        // Clean up pending deletions
        messagesToDelete.forEach(msg => state.pendingDeletions.delete(msg.id));
    }
}

/**
 * Execute single deletions - one message at a time with small delays
 */
async function executeSingleDeletions(
    channel: TextBasedGuildChannel,
    messagesToDelete: Message[],
    state: ChannelState,
    isCatchupOperation: boolean = false
): Promise<void> {
    // Sort by age (oldest first) for proper deletion order
    const sortedMessages = messagesToDelete.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // In catchup mode, process more messages at once
    // In normal single mode, only delete 1-2 messages at a time to stay responsive
    const maxToDelete = isCatchupOperation ?
        Math.min(sortedMessages.length, 15) : // Up to 15 for catchup
        Math.min(2, sortedMessages.length);   // Max 2 for normal operation

    const toDelete = sortedMessages.slice(0, maxToDelete);

    // Use shorter delays for catchup operations
    const deleteDelay = isCatchupOperation ? 50 : PROCESSING_CONFIG.SINGLE_DELETE_DELAY;

    for (const msg of toDelete) {
        try {
            await msg.delete();

            // Shorter delay for catchup operations
            if (deleteDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, deleteDelay));
            }

        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error) {
                if ((error as any).code !== 10008) { // Not "Unknown Message"
                    console.error(`Error in single deletion from ${state.channelType}:`, error);
                    throw error; // Re-throw non-trivial errors
                }
            }
        }
    }
}

/**
 * Execute batch deletions - group messages for efficiency
 */
async function executeBatchDeletions(
    channel: TextBasedGuildChannel,
    messagesToDelete: Message[],
    state: ChannelState,
    forceBatch: boolean = false
): Promise<void> {
    const now = Date.now();
    const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);

    // Separate by age for bulk vs individual deletion
    const recentMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);
    const oldMessages = messagesToDelete.filter(msg => msg.createdTimestamp <= twoWeeksAgo);

    // Check if channel supports bulk delete (some channels like threads might have limitations)
    const supportsBulkDelete = 'bulkDelete' in channel && typeof channel.bulkDelete === 'function';

    // Bulk delete recent messages if supported
    if (supportsBulkDelete && (recentMessages.length >= 2 || forceBatch)) {
        for (let i = 0; i < recentMessages.length; i += 100) {
            const batch = recentMessages.slice(i, i + 100);
            try {
                await (channel as any).bulkDelete(batch);
                // console.log(`Batch deleted ${batch.length} recent messages from ${state.channelType}`);

                // Shorter delay between batches for catchup operations
                if (i + 100 < recentMessages.length) {
                    await new Promise(resolve => setTimeout(resolve, forceBatch ? 500 : 1000));
                }
            } catch (error) {
                console.error(`Error in bulk delete for ${state.channelType}:`, error);
                // Fall back to individual deletion
                for (const msg of batch) {
                    try {
                        await msg.delete();
                        await new Promise(resolve => setTimeout(resolve, forceBatch ? 100 : 300));
                    } catch (individualError) {
                        if (individualError && typeof individualError === 'object' && 'code' in individualError) {
                            if ((individualError as any).code !== 10008) {
                                console.error(`Error in fallback individual deletion:`, individualError);
                            }
                        }
                    }
                }
            }
        }
    } else if (recentMessages.length === 1) {
        // Single recent message
        try {
            await recentMessages[0].delete();
            // console.log(`Individually deleted 1 recent message from ${state.channelType}`);
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error) {
                if ((error as any).code !== 10008) {
                    console.error(`Error deleting single recent message from ${state.channelType}:`, error);
                }
            }
        }
    } else if (!supportsBulkDelete && recentMessages.length > 1) {
        // Channel doesn't support bulk delete, delete individually
        const deleteDelay = forceBatch ? 100 : 200; // Faster for catchup
        for (const msg of recentMessages) {
            try {
                await msg.delete();
                await new Promise(resolve => setTimeout(resolve, deleteDelay));
            } catch (error) {
                if (error && typeof error === 'object' && 'code' in error) {
                    if ((error as any).code !== 10008) {
                        console.error(`Error in individual deletion from ${state.channelType}:`, error);
                    }
                }
            }
        }
    }

    // Delete old messages individually with appropriate delays
    const oldMessageDelay = forceBatch ? 150 : 300;
    for (const msg of oldMessages) {
        try {
            await msg.delete();
            await new Promise(resolve => setTimeout(resolve, oldMessageDelay));
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error) {
                if ((error as any).code !== 10008) { // Not "Unknown Message"
                    console.error(`Error in batch individual deletion from ${state.channelType}:`, error);
                }
            }
        }
    }
}

/**
 * Calculate max age in milliseconds
 */
function calculateMaxAge(config: AutoDeleteConfig): number {
    switch (config.timeUnit) {
        case TimeUnit.MINUTES:
            return config.maxAge * 60 * 1000;
        case TimeUnit.HOURS:
            return config.maxAge * 60 * 60 * 1000;
        case TimeUnit.DAYS:
            return config.maxAge * 24 * 60 * 60 * 1000;
        default:
            return 0;
    }
}

/**
 * Handle message deletion tracking
 */
export function handleMessageDeleted(channelId: string, messageId: string): void {
    const state = getChannelState(channelId);

    // Remove from our cache
    state.lastKnownMessages.delete(messageId);
    state.pendingDeletions.delete(messageId);

    // Remove from queues
    let index = state.singleDeleteQueue.indexOf(messageId);
    if (index > -1) state.singleDeleteQueue.splice(index, 1);

    index = state.batchDeleteQueue.indexOf(messageId);
    if (index > -1) state.batchDeleteQueue.splice(index, 1);
}

/**
 * Handle bulk message deletion tracking
 */
export function handleBulkMessageDeleted(channelId: string, deletedCount: number): void {
    const state = getChannelState(channelId);

    // Clear all caches since bulk delete changes everything
    state.lastKnownMessages.clear();
    state.pendingDeletions.clear();
    state.singleDeleteQueue = [];
    state.batchDeleteQueue = [];
    state.messageCount = 0;
}

/**
 * Start age monitoring for a channel - PUBLIC EXPORT
 */
export function startAgeMonitoring(client: Client, channelId: string): void {
    const config = autoDeleteConfigs.get(channelId);
    if (config && config.enabled && config.maxAge > 0) {
        scheduleAgeMonitoring(client, channelId);
    }
}

/**
 * Stop age monitoring for a channel - PUBLIC EXPORT
 */
export function stopAgeMonitoring(channelId: string): void {
    const timeout = ageMonitoringTimeouts.get(channelId);
    if (timeout) {
        clearTimeout(timeout);
        ageMonitoringTimeouts.delete(channelId);
    }
}

/**
 * Get performance statistics for monitoring
 */
export function getPerformanceStats(): {
    global: typeof globalPerformanceTracker;
    channels: Array<{ channelId: string; stats: ChannelPerformanceStats }>;
} {
    const channelStats = Array.from(channelStates.entries()).map(([channelId, state]) => ({
        channelId,
        stats: {
            messageCount: state.messageCount,
            pendingDeletionsCount: state.pendingDeletions.size,
            batchSize: Math.max(state.singleDeleteQueue.length, state.batchDeleteQueue.length),
            batchDelay: state.processDelay,
            maxApiCallsPerMinute: state.maxApiCallsPerMinute,
            averageResponseTime: state.recentResponseTimes.length > 0 ?
                state.recentResponseTimes.reduce((a, b) => a + b, 0) / state.recentResponseTimes.length : 0,
            isHighActivity: state.currentMessagesPerSecond > PROCESSING_CONFIG.BATCH_MODE_THRESHOLD,
            apiCallsThisMinute: state.apiCallsThisMinute,
            batchQueueLength: state.singleDeleteQueue.length + state.batchDeleteQueue.length,
            processingMode: state.processingMode,
            messagesPerSecond: state.currentMessagesPerSecond,
            channelType: state.channelType,
            lastAgeCheck: state.lastAgeCheck,
            nextAgeCheck: state.nextScheduledAgeCheck
        }
    }));

    return {
        global: { ...globalPerformanceTracker },
        channels: channelStats
    };
}

/**
 * Initialize the dynamic real-time system
 */
export function initializeDynamicRealtime(client: Client): void {
    // Clean up old channel states and reset activity periodically
    setInterval(() => {
        const now = Date.now();

        for (const [channelId, state] of channelStates.entries()) {
            // Reset API call counters
            if (now - state.lastApiCallReset > 60000) {
                state.apiCallsThisMinute = 0;
                state.lastApiCallReset = now;

                // Reset error count if we've had a good minute
                if (state.consecutiveErrors > 0) {
                    state.consecutiveErrors = Math.max(0, state.consecutiveErrors - 1);
                }
            }

            // Update activity tracking
            updateActivityTracking(state);

            // Clean up old response times
            if (state.recentResponseTimes.length > 10) {
                state.recentResponseTimes = state.recentResponseTimes.slice(-5);
            }

            // Remove completely inactive channel states
            if (state.recentMessageTimes.length === 0 &&
                state.pendingDeletions.size === 0 &&
                state.singleDeleteQueue.length === 0 &&
                state.batchDeleteQueue.length === 0 &&
                now - state.lastProcessTime > 3600000) { // 1 hour inactive

                // Stop age monitoring for this channel
                stopAgeMonitoring(channelId);
                channelStates.delete(channelId);
            }
        }
    }, 60000); // Every minute
}

/**
 * Clean up channel state when a channel is deleted
 */
export function cleanupChannelState(channelId: string): void {
    // Remove from channel states tracking
    if (channelStates.has(channelId)) {
        const state = channelStates.get(channelId)!;
        console.log(`Cleaning up channel state for deleted channel: ${channelId} (${state.channelType})`);

        // Clear all pending operations
        state.pendingDeletions.clear();
        state.singleDeleteQueue = [];
        state.batchDeleteQueue = [];
        state.lastKnownMessages.clear();

        // Remove from tracking
        channelStates.delete(channelId);
    }
}

/**
 * Export the channel type checker for use in other files
 */
export { isTextBasedGuildChannel, getChannelTypeString, getChannelDisplayName };

// catchup stuff

const CATCHUP_CONFIG = {
    // More aggressive batching for catchup
    CATCHUP_BULK_DELETE_THRESHOLD: 3,    // Use bulk delete for 3+ messages (was 2)
    CATCHUP_MAX_BULK_SIZE: 100,          // Max bulk delete size
    CATCHUP_BULK_DELAY: 200,             // Very short delay between bulk operations
    CATCHUP_INDIVIDUAL_DELAY: 50,        // Minimal delay for individual deletes
    CATCHUP_BATCH_DELAY: 300,            // Short delay between different age groups
    
    // Parallel processing limits
    CATCHUP_MAX_PARALLEL_OPERATIONS: 3,  // Process multiple age groups simultaneously
    CATCHUP_CHUNK_SIZE: 150,             // Process messages in chunks
    
    // API optimization
    CATCHUP_API_BURST_LIMIT: 80,         // Higher API limit during catchup
    CATCHUP_ERROR_THRESHOLD: 5,          // More tolerant of errors during catchup
};

/**
 * Enhanced catchup-specific message processing
 */
async function handleCatchupOperation(
    client: Client,
    channelId: string,
    context: ProcessingContext
): Promise<void> {
    const config = autoDeleteConfigs.get(channelId);
    const state = getChannelState(channelId);

    if (!config || !config.enabled) return;

    const channel = client.channels.cache.get(channelId);
    if (!channel || !isTextBasedGuildChannel(channel)) return;

    const silent = context?.silent || false;

    if (!silent) {
        console.log(`Starting optimized catchup for ${state.channelType} ${getChannelDisplayName(channel)}`);
    }

    // Temporarily increase API limits for catchup
    const originalApiLimit = state.maxApiCallsPerMinute;
    state.maxApiCallsPerMinute = CATCHUP_CONFIG.CATCHUP_API_BURST_LIMIT;

    try {
        // Fetch more messages for better catchup assessment
        const allMessages = await fetchAllRelevantMessages(channel, config, silent);
        if (!silent) {
            console.log(`Fetched ${allMessages.length} messages for catchup analysis`);
        }

        // Analyze and categorize messages for optimal deletion strategy
        const deletionPlan = createOptimalDeletionPlan(allMessages, config);

        if (deletionPlan.totalToDelete === 0) {
            if (!silent) {
                console.log(`No messages need deletion in ${getChannelDisplayName(channel)}`);
            }
            return;
        }

        if (!silent) {
            console.log(`Catchup deletion plan: ${deletionPlan.totalToDelete} messages (${deletionPlan.bulkEligible} bulk, ${deletionPlan.individualRequired} individual)`);
        }

        // Execute parallel deletion strategy
        await executeParallelCatchupDeletion(channel, deletionPlan, state);

    } finally {
        // Restore original API limits
        state.maxApiCallsPerMinute = originalApiLimit;
        if (!silent) {
            console.log(`Catchup completed for ${getChannelDisplayName(channel)}`);
        }
    }
}

/**
 * Fetch all relevant messages more efficiently for catchup
 */
async function fetchAllRelevantMessages(
    channel: TextBasedGuildChannel,
    config: AutoDeleteConfig,
    silent: boolean = false
): Promise<Message[]> {
    const allMessages: Message[] = [];
    const now = Date.now();
    const ageLimit = config.maxAge > 0 ? calculateMaxAge(config) : 0;
    
    // Calculate how many messages we might need to fetch
    const estimatedFetchLimit = config.maxMessages > 0 
        ? Math.max(config.maxMessages * 3, 200) // Fetch 3x the limit to account for deletions
        : 500; // Default for age-only deletion
    
    let lastMessageId: string | undefined;
    let fetchedCount = 0;
    const maxFetches = Math.ceil(estimatedFetchLimit / 100); // Limit total API calls
    
    for (let i = 0; i < maxFetches; i++) {
        try {
            const options: { limit: number; before?: string } = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }
            
            const messagesCollection = await channel.messages.fetch(options);
            
            if (messagesCollection.size === 0) break; // No more messages
            
            const messageArray = Array.from(messagesCollection.values()) as Message[];
            
            // Filter out messages we want to keep
            const relevantMessages = messageArray.filter((msg: Message) => 
                !msg.pinned && 
                !config.keepMessages.has(msg.id)
            );
            
            allMessages.push(...relevantMessages);
            fetchedCount += messagesCollection.size;
            
            // Set up for next iteration
            lastMessageId = messageArray[messageArray.length - 1].id;
            
            // Stop early if we have enough for our needs
            if (config.maxMessages > 0 && allMessages.length >= config.maxMessages * 2) {
                break;
            }
            
            // For age-based deletion, stop if we've gone past the age limit
            if (config.maxAge > 0) {
                const oldestFetched = messageArray[messageArray.length - 1];
                if ((now - oldestFetched.createdTimestamp) > ageLimit * 1.5) {
                    // We've fetched well beyond the age limit
                    break;
                }
            }
            
            // Small delay between fetches to be API-friendly
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error(`Error fetching messages during catchup:`, error);
            break;
        }
    }

    if (!silent) {
        console.log(`Fetched ${fetchedCount} total messages, ${allMessages.length} relevant for deletion analysis`);
    }
    return allMessages;
}

/**
 * Create an optimal deletion plan for catchup
 */
function createOptimalDeletionPlan(
    messages: Message[],
    config: AutoDeleteConfig
): {
    bulkDeletableGroups: Message[][];
    individualMessages: Message[];
    totalToDelete: number;
    bulkEligible: number;
    individualRequired: number;
} {
    const now = Date.now();
    const ageLimit = config.maxAge > 0 ? calculateMaxAge(config) : 0;
    const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);
    
    // Determine which messages need to be deleted
    const messagesToDelete: Message[] = [];
    
    // Age-based deletion
    if (config.maxAge > 0) {
        const expiredMessages = messages.filter(msg => 
            (now - msg.createdTimestamp) > ageLimit
        );
        messagesToDelete.push(...expiredMessages);
    }
    
    // Count-based deletion
    if (config.maxMessages > 0 && messages.length > config.maxMessages) {
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const excessCount = messages.length - config.maxMessages;
        const excessMessages = sortedMessages.slice(0, excessCount);
        
        // Add excess messages (avoid duplicates)
        for (const msg of excessMessages) {
            if (!messagesToDelete.some(m => m.id === msg.id)) {
                messagesToDelete.push(msg);
            }
        }
    }
    
    if (messagesToDelete.length === 0) {
        return {
            bulkDeletableGroups: [],
            individualMessages: [],
            totalToDelete: 0,
            bulkEligible: 0,
            individualRequired: 0
        };
    }
    
    // Separate by bulk-deletable vs individual
    const recentMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);
    const oldMessages = messagesToDelete.filter(msg => msg.createdTimestamp <= twoWeeksAgo);
    
    // Group recent messages into bulk-delete batches
    const bulkGroups: Message[][] = [];
    if (recentMessages.length >= CATCHUP_CONFIG.CATCHUP_BULK_DELETE_THRESHOLD) {
        for (let i = 0; i < recentMessages.length; i += CATCHUP_CONFIG.CATCHUP_MAX_BULK_SIZE) {
            const batch = recentMessages.slice(i, i + CATCHUP_CONFIG.CATCHUP_MAX_BULK_SIZE);
            bulkGroups.push(batch);
        }
    }
    
    // Individual messages: old messages + small groups of recent messages
    const individualMessages: Message[] = [...oldMessages];
    if (recentMessages.length < CATCHUP_CONFIG.CATCHUP_BULK_DELETE_THRESHOLD) {
        individualMessages.push(...recentMessages);
    }
    
    const bulkEligible = bulkGroups.reduce((sum, group) => sum + group.length, 0);
    const individualRequired = individualMessages.length;
    
    return {
        bulkDeletableGroups: bulkGroups,
        individualMessages,
        totalToDelete: messagesToDelete.length,
        bulkEligible,
        individualRequired
    };
}

/**
 * Execute parallel deletion for maximum speed during catchup
 */
async function executeParallelCatchupDeletion(
    channel: TextBasedGuildChannel,
    deletionPlan: ReturnType<typeof createOptimalDeletionPlan>,
    state: ChannelState
): Promise<void> {
    const channelName = getChannelDisplayName(channel);
    const supportsBulkDelete = 'bulkDelete' in channel && typeof channel.bulkDelete === 'function';
    
    // Execute bulk deletions first (most efficient)
    if (supportsBulkDelete && deletionPlan.bulkDeletableGroups.length > 0) {
        console.log(`Executing ${deletionPlan.bulkDeletableGroups.length} bulk delete operations for ${channelName}`);
        
        for (const [index, group] of deletionPlan.bulkDeletableGroups.entries()) {
            try {
                await (channel as any).bulkDelete(group);
                console.log(`Bulk deleted batch ${index + 1}/${deletionPlan.bulkDeletableGroups.length} (${group.length} messages)`);
                
                // Very short delay between bulk operations
                if (index < deletionPlan.bulkDeletableGroups.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, CATCHUP_CONFIG.CATCHUP_BULK_DELAY));
                }
                
            } catch (error) {
                console.error(`Bulk delete failed for batch ${index + 1}, falling back to individual deletion:`, error);
                
                // Fallback to individual deletion for this batch
                await executeOptimizedIndividualDeletion(group, CATCHUP_CONFIG.CATCHUP_INDIVIDUAL_DELAY);
            }
        }
    }
    
    // Execute individual deletions with chunking for better progress
    if (deletionPlan.individualMessages.length > 0) {
        console.log(`Executing individual deletions for ${deletionPlan.individualMessages.length} messages in ${channelName}`);
        
        // Process individual messages in chunks for better progress reporting
        const chunks = chunkArray(deletionPlan.individualMessages, CATCHUP_CONFIG.CATCHUP_CHUNK_SIZE);
        
        for (const [chunkIndex, chunk] of chunks.entries()) {
            console.log(`Processing individual deletion chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} messages)`);
            
            await executeOptimizedIndividualDeletion(chunk, CATCHUP_CONFIG.CATCHUP_INDIVIDUAL_DELAY);
            
            // Short delay between chunks
            if (chunkIndex < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, CATCHUP_CONFIG.CATCHUP_BATCH_DELAY));
            }
        }
    }
    
    console.log(`Catchup deletion completed for ${channelName}: ${deletionPlan.totalToDelete} messages processed`);
}

/**
 * Optimized individual deletion with minimal delays
 */
async function executeOptimizedIndividualDeletion(
    messages: Message[],
    delay: number
): Promise<void> {
    let successCount = 0;
    let errorCount = 0;
    
    for (const [index, msg] of messages.entries()) {
        try {
            await msg.delete();
            successCount++;
            
            // Only add delay if not the last message
            if (delay > 0 && index < messages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
        } catch (error) {
            errorCount++;
            
            // Only log non-trivial errors
            if (error && typeof error === 'object' && 'code' in error) {
                const errorCode = (error as any).code;
                if (errorCode !== 10008 && errorCode !== 50013) { // Unknown Message or Missing Permissions
                    console.error(`Error deleting message ${msg.id}:`, error);
                }
            }
            
            // Continue with other deletions even if one fails
        }
    }
    
    if (errorCount > 0) {
        console.log(`Individual deletion batch completed: ${successCount} successful, ${errorCount} errors`);
    }
}

/**
 * Utility function to chunk arrays
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}
