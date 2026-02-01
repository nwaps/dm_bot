// src/discord/models/msg_logging_config.ts
import { Schema, model } from "mongoose";

export interface MsgLoggingConfig {
    guild_id: string;
    enabled: boolean;
    channel_id: string;
    thread_id?: string;
    thread_name?: string;
    created_at: Date;
    updated_at: Date;
}

const msgLoggingConfigSchema = new Schema<MsgLoggingConfig>({
    guild_id: { type: String, required: true, unique: true },
    enabled: { type: Boolean, required: true, default: true },
    channel_id: { type: String, required: true },
    thread_id: { type: String, default: null },
    thread_name: { type: String, default: null }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Index for efficient queries
msgLoggingConfigSchema.index({ enabled: 1 });

export const msg_logging_config_model = model<MsgLoggingConfig>('MsgLoggingConfig', msgLoggingConfigSchema);
