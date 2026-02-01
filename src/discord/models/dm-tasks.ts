// models/dm-tasks.ts
import { Schema, model } from "mongoose";

export interface DmTask {
    guild_id: string;
    message: string; // Stores the JSON string of embed data
    delay: number;
    total_members: number;
    sent_count: number;
    failed_count: number;
    current_index: number;
    member_ids: string[];
    is_active: boolean;
    started_by: string;
    started_at: Date;
    last_processed_at: Date;
    completed_at: Date | null;
}

const dmTaskSchema = new Schema<DmTask>({
    guild_id: { type: String, required: true, index: true },
    message: { type: String, required: true }, // Store embed JSON as string
    delay: { type: Number, required: true },
    total_members: { type: Number, required: true },
    sent_count: { type: Number, default: 0 },
    failed_count: { type: Number, default: 0 },
    current_index: { type: Number, default: 0 },
    member_ids: [{ type: String }],
    is_active: { type: Boolean, default: true, index: true },
    started_by: { type: String, required: true },
    started_at: { type: Date, required: true },
    last_processed_at: { type: Date, required: true },
    completed_at: { type: Date, default: null }
});

// Compound index for efficient queries
dmTaskSchema.index({ guild_id: 1, is_active: 1 });

export const dm_task_model = model<DmTask>('DmTasks', dmTaskSchema);