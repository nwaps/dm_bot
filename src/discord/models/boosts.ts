// models/boosts.ts
import { Schema, model } from "mongoose";

export interface BoostEvent {
    guild_id: string;
    user_id: string;
    boost_start: Date;
    boost_end: Date | null; // null if currently boosting
    nickname_before_boost: string | null;
    nickname_during_boost: string | null;
    is_active: boolean;
}

const boostEventSchema = new Schema<BoostEvent>({
    guild_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    boost_start: { type: Date, required: true },
    boost_end: { type: Date, default: null },
    nickname_before_boost: { type: String, default: null },
    nickname_during_boost: { type: String, default: null },
    is_active: { type: Boolean, default: true, index: true }
});

// Compound index for efficient queries
boostEventSchema.index({ guild_id: 1, user_id: 1, is_active: 1 });
boostEventSchema.index({ guild_id: 1, is_active: 1 });
boostEventSchema.index({ is_active: 1, boost_end: 1 });

export const boost_model = model<BoostEvent>('BoostEvents', boostEventSchema);