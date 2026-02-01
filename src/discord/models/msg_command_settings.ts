// src/discord/models/msg_command_settings.ts
import { Schema, model } from "mongoose";

export interface MsgCommandSettings {
    guild_id: string;
    command_enabled: boolean;
    created_at: Date;
    updated_at: Date;
}

const msgCommandSettingsSchema = new Schema<MsgCommandSettings>({
    guild_id: { type: String, required: true, unique: true },
    command_enabled: { type: Boolean, required: true, default: true }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export const msg_command_settings_model = model<MsgCommandSettings>('MsgCommandSettings', msgCommandSettingsSchema);
