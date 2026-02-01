// src/discord/models/activity.ts

import { Schema, model } from "mongoose";

export interface MessageActivity {
    user_id: string;
    guild_id: string;
    channel_id: string;
    timestamp: Date;
    message_count: number; // For batching multiple messages in same time period
}

export interface VoiceActivity {
    user_id: string;
    guild_id: string;
    channel_id: string;
    join_time: Date;
    leave_time?: Date;
    duration_minutes: number;
    is_active: boolean; // For tracking ongoing sessions
}

export interface MemberJoinLeave {
    user_id: string;
    guild_id: string;
    timestamp: Date;
    action: 'join' | 'leave';
}

export interface UserActivityStats {
    user_id: string;
    guild_id: string;
    last_updated: Date;
    message_stats: {
        total_messages: number;
        channels: Map<string, number>; // channel_id -> message count
        daily_activity: Map<string, number>; // date string -> message count
    };
    voice_stats: {
        total_minutes: number;
        channels: Map<string, number>; // channel_id -> minutes
        daily_activity: Map<string, number>; // date string -> minutes
    };
}

const memberJoinLeaveSchema = new Schema<MemberJoinLeave>({
    user_id: { type: String, required: true },
    guild_id: { type: String, required: true },
    timestamp: { type: Date, required: true },
    action: { type: String, enum: ['join', 'leave'], required: true }
});

const messageActivitySchema = new Schema<MessageActivity>({
    user_id: { type: String, required: true },
    guild_id: { type: String, required: true },
    channel_id: { type: String, required: true },
    timestamp: { type: Date, required: true },
    message_count: { type: Number, default: 1 }
});

const voiceActivitySchema = new Schema<VoiceActivity>({
    user_id: { type: String, required: true },
    guild_id: { type: String, required: true },
    channel_id: { type: String, required: true },
    join_time: { type: Date, required: true },
    leave_time: { type: Date, default: null },
    duration_minutes: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
});

const userActivityStatsSchema = new Schema<UserActivityStats>({
    user_id: { type: String, required: true },
    guild_id: { type: String, required: true },
    last_updated: { type: Date, default: Date.now },
    message_stats: {
        total_messages: { type: Number, default: 0 },
        channels: { type: Map, of: Number, default: new Map() },
        daily_activity: { type: Map, of: Number, default: new Map() }
    },
    voice_stats: {
        total_minutes: { type: Number, default: 0 },
        channels: { type: Map, of: Number, default: new Map() },
        daily_activity: { type: Map, of: Number, default: new Map() }
    }
});

// Compound indexes for efficient queries
memberJoinLeaveSchema.index({ guild_id: 1, timestamp: -1 });
memberJoinLeaveSchema.index({ user_id: 1, guild_id: 1 });
messageActivitySchema.index({ user_id: 1, guild_id: 1, timestamp: -1 });
messageActivitySchema.index({ user_id: 1 });
messageActivitySchema.index({ guild_id: 1 });
messageActivitySchema.index({ channel_id: 1 });

voiceActivitySchema.index({ user_id: 1, guild_id: 1, is_active: 1 });
voiceActivitySchema.index({ user_id: 1 });
voiceActivitySchema.index({ guild_id: 1 });
voiceActivitySchema.index({ channel_id: 1 });
voiceActivitySchema.index({ is_active: 1 });
voiceActivitySchema.index({ join_time: 1 });

userActivityStatsSchema.index({ user_id: 1, guild_id: 1 }, { unique: true });

// TTL index to automatically remove old data (180 days)
memberJoinLeaveSchema.index({ timestamp: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
messageActivitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const member_join_leave_model = model<MemberJoinLeave>('MemberJoinLeave', memberJoinLeaveSchema);
export const message_activity_model = model<MessageActivity>('MessageActivity', messageActivitySchema);
export const voice_activity_model = model<VoiceActivity>('VoiceActivity', voiceActivitySchema);
export const user_activity_stats_model = model<UserActivityStats>('UserActivityStats', userActivityStatsSchema);