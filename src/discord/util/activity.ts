// src/discord/util/activity.ts

import { VoiceState } from 'discord.js';
import {
    message_activity_model,
    voice_activity_model,
    user_activity_stats_model,
    MessageActivity,
    VoiceActivity
} from '../models/activity';

// Message activity tracking with batching
const messageBatch = new Map<string, { count: number, lastUpdate: number }>();
const BATCH_INTERVAL = 60000; // 1 minute batching

export async function trackMessageActivity(userId: string, guildId: string, channelId: string): Promise<void> {
    const batchKey = `${userId}-${guildId}-${channelId}`;
    const now = Date.now();
    
    // Get or create batch entry
    const batch = messageBatch.get(batchKey) || { count: 0, lastUpdate: now };
    batch.count++;
    
    // If batch is old enough, flush it
    if (now - batch.lastUpdate >= BATCH_INTERVAL) {
        await flushMessageBatch(userId, guildId, channelId, batch.count);
        messageBatch.delete(batchKey);
    } else {
        batch.lastUpdate = now;
        messageBatch.set(batchKey, batch);
    }
}

async function flushMessageBatch(userId: string, guildId: string, channelId: string, count: number): Promise<void> {
    const activity: MessageActivity = {
        user_id: userId,
        guild_id: guildId,
        channel_id: channelId,
        timestamp: new Date(),
        message_count: count
    };
    
    await message_activity_model.create(activity);
    await updateUserStats(userId, guildId, 'message', channelId, count);
}

export async function trackVoiceActivity(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const userId = newState.member?.id;
    const guildId = newState.guild.id;
    
    if (!userId) return;
    
    // User left a voice channel
    if (oldState.channel && !newState.channel) {
        await handleVoiceLeave(userId, guildId, oldState.channel.id);
    }
    // User joined a voice channel
    else if (!oldState.channel && newState.channel) {
        await handleVoiceJoin(userId, guildId, newState.channel.id);
    }
    // User moved between channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        await handleVoiceLeave(userId, guildId, oldState.channel.id);
        await handleVoiceJoin(userId, guildId, newState.channel.id);
    }
}

async function handleVoiceJoin(userId: string, guildId: string, channelId: string): Promise<void> {
    const activity: VoiceActivity = {
        user_id: userId,
        guild_id: guildId,
        channel_id: channelId,
        join_time: new Date(),
        duration_minutes: 0,
        is_active: true
    };
    
    await voice_activity_model.create(activity);
}

async function handleVoiceLeave(userId: string, guildId: string, channelId: string): Promise<void> {
    const activeSession = await voice_activity_model.findOne({
        user_id: userId,
        guild_id: guildId,
        channel_id: channelId,
        is_active: true
    }).sort({ join_time: -1 });
    
    if (activeSession) {
        const leaveTime = new Date();
        const durationMs = leaveTime.getTime() - activeSession.join_time.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        
        activeSession.leave_time = leaveTime;
        activeSession.duration_minutes = durationMinutes;
        activeSession.is_active = false;
        
        await activeSession.save();
        await updateUserStats(userId, guildId, 'voice', channelId, durationMinutes);
    }
}

async function updateUserStats(
    userId: string, 
    guildId: string, 
    type: 'message' | 'voice', 
    channelId: string, 
    amount: number
): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const update: any = {
        last_updated: new Date()
    };
    
    if (type === 'message') {
        update['$inc'] = { 'message_stats.total_messages': amount };
        update['$inc'][`message_stats.channels.${channelId}`] = amount;
        update['$inc'][`message_stats.daily_activity.${today}`] = amount;
    } else {
        update['$inc'] = { 'voice_stats.total_minutes': amount };
        update['$inc'][`voice_stats.channels.${channelId}`] = amount;
        update['$inc'][`voice_stats.daily_activity.${today}`] = amount;
    }
    
    await user_activity_stats_model.findOneAndUpdate(
        { user_id: userId, guild_id: guildId },
        update,
        { upsert: true, new: true }
    );
}

// Cleanup functions
export async function cleanupStaleVoiceSessions(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const staleSessions = await voice_activity_model.find({
        is_active: true,
        join_time: { $lt: staleThreshold }
    });
    
    for (const session of staleSessions) {
        const durationMs = staleThreshold.getTime() - session.join_time.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        
        session.leave_time = staleThreshold;
        session.duration_minutes = durationMinutes;
        session.is_active = false;
        
        await session.save();
        await updateUserStats(session.user_id, session.guild_id, 'voice', session.channel_id, durationMinutes);
    }
    
    console.log(`Cleaned up ${staleSessions.length} stale voice sessions`);
}

// Flush remaining message batches
export async function flushAllMessageBatches(): Promise<void> {
    for (const [batchKey, batch] of messageBatch.entries()) {
        const [userId, guildId, channelId] = batchKey.split('-');
        await flushMessageBatch(userId, guildId, channelId, batch.count);
    }
    messageBatch.clear();
}


