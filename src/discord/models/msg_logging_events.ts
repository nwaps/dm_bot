// src/discord/models/msg_logging_events.ts
import { Schema, model } from "mongoose";

export type MsgEventType = 'success' | 'spam_blocked' | 'automod_blocked' | 'timeout_blocked' | 'ban_blocked' | 'moderation' | 'side_chat';

export interface MsgLoggingEvent {
    guild_id: string;
    event_type: MsgEventType;
    user_id: string;
    username: string;
    avatar_url: string;
    message_content?: string;
    message_attachment?: string;
    channel_id?: string;
    channel_name?: string;
    reason?: string;
    duration?: string;
    infractions?: number;
    moderator?: string;
    timestamp: Date;
}

const msgLoggingEventSchema = new Schema<MsgLoggingEvent>({
    guild_id: { type: String, required: true, index: true },
    event_type: {
        type: String,
        required: true,
        enum: ['success', 'spam_blocked', 'automod_blocked', 'timeout_blocked', 'ban_blocked', 'moderation', 'side_chat'],
        index: true
    },
    user_id: { type: String, required: true, index: true },
    username: { type: String, required: true },
    avatar_url: { type: String, required: true },
    message_content: { type: String, default: null },
    message_attachment: { type: String, default: null },
    channel_id: { type: String, default: null },
    channel_name: { type: String, default: null },
    reason: { type: String, default: null },
    duration: { type: String, default: null },
    infractions: { type: Number, default: null },
    moderator: { type: String, default: null },
    timestamp: { type: Date, required: true, default: Date.now }
}, {
    timestamps: false // We're using our own timestamp field
});

// Compound indexes for efficient queries
msgLoggingEventSchema.index({ guild_id: 1, timestamp: -1 }); // Latest events for a guild
msgLoggingEventSchema.index({ guild_id: 1, user_id: 1, timestamp: -1 }); // User's event history
msgLoggingEventSchema.index({ guild_id: 1, event_type: 1, timestamp: -1 }); // Events by type
msgLoggingEventSchema.index({ timestamp: 1 }); // For cleanup of old logs

export const msg_logging_event_model = model<MsgLoggingEvent>('MsgLoggingEvent', msgLoggingEventSchema);
