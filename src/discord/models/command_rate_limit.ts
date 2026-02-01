import { Schema, model, Document } from "mongoose";

export interface CommandRateLimitRecord extends Document {
    user_id: string;
    guild_id: string;
    command_timestamps: Date[];
    infractions: number;
    current_timeout_until?: Date;
    is_permanently_banned: boolean;
    ban_reason?: string;
    last_infraction_date?: Date;
    total_commands_used: number;
    first_infraction_date?: Date;
}

const commandRateLimitSchema = new Schema<CommandRateLimitRecord>({
    user_id: { type: String, required: true, index: true },
    guild_id: { type: String, required: true, index: true },
    command_timestamps: { type: [Date], default: [] },
    infractions: { type: Number, default: 0 },
    current_timeout_until: { type: Date, default: null },
    is_permanently_banned: { type: Boolean, default: false },
    ban_reason: { type: String, default: null },
    last_infraction_date: { type: Date, default: null },
    total_commands_used: { type: Number, default: 0 },
    first_infraction_date: { type: Date, default: null }
}, {
    timestamps: true
});

commandRateLimitSchema.index({ user_id: 1, guild_id: 1 }, { unique: true });

export const command_rate_limit_model = model<CommandRateLimitRecord>('CommandRateLimit', commandRateLimitSchema);