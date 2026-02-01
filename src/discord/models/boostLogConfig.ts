// models/boostLogConfig.ts
import { Schema, model } from "mongoose";

export interface BoostLogConfig {
    guild_id: string;
    log_channel_id: string;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
}

const boostLogConfigSchema = new Schema<BoostLogConfig>({
    guild_id: { type: String, required: true, unique: true },
    log_channel_id: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Update the updated_at field on save
boostLogConfigSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

export const boost_log_config_model = model<BoostLogConfig>('BoostLogConfig', boostLogConfigSchema);
