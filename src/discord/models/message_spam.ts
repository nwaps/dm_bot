// src/discord/models/message_spam.ts
import { Schema, model } from "mongoose";

export interface MessageSpamRecord {
    user_id: string;
    guild_id: string;
    recent_messages: string[]; // Store recent message hashes (max 5)
    message_timestamps: Date[]; // Corresponding timestamps
    infractions: number;
    current_timeout_until?: Date;
    is_permanently_banned: boolean;
    ban_reason?: string; // Reason for permanent ban
    last_infraction_date?: Date;
    total_messages_sent: number;
    first_infraction_date?: Date;
}

const messageSpamSchema = new Schema<MessageSpamRecord>({
    user_id: { type: String, required: true, index: true },
    guild_id: { type: String, required: true, index: true },
    recent_messages: { type: [String], default: [], maxlength: 5 },
    message_timestamps: { type: [Date], default: [], maxlength: 5 },
    infractions: { type: Number, default: 0 },
    current_timeout_until: { type: Date, default: null },
    is_permanently_banned: { type: Boolean, default: false },
    ban_reason: { type: String, default: null },
    last_infraction_date: { type: Date, default: null },
    total_messages_sent: { type: Number, default: 0 },
    first_infraction_date: { type: Date, default: null }
}, {
    timestamps: true
});

// Compound index for efficient queries
messageSpamSchema.index({ user_id: 1, guild_id: 1 }, { unique: true });

export const message_spam_model = model<MessageSpamRecord>('MessageSpam', messageSpamSchema);