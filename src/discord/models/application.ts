// src/discord/models/application.ts
import { Schema, model } from "mongoose";

export interface Question {
    question: string;
    answer: string;
    type: 'yes_no' | 'short_answer';
    required: boolean;
}

export interface db_application {
    _id: any;
    userId: string;
    username: string;
    nickname?: string;
    avatarUrl?: string;
    status: 'approved' | 'denied' | 'pending';
    activityCount: number;
    templateName: string; // New field to identify which application template was used
    questions?: Question[];
    endorsements: {
        userId: string;
        timestamp: Date;
    }[];
    activity_pending: boolean;
    cycleId: string; // Identifies which application cycle this belongs to
    guildId: string; // New field to identify which guild this application belongs to
    appointed: boolean; // Whether the user has been appointed
    appointedAt?: Date; // When the user was appointed
    archivedAt?: Date; // When the application was archived
    createdAt: Date;
}

const questionSchema = new Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    type: { type: String, required: true, enum: ['yes_no', 'short_answer'] },
    required: { type: Boolean, required: true }
});

const endorsementSchema = new Schema({
    userId: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now }
});

const applicationSchema = new Schema<db_application>({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    nickname: { type: String, required: false },
    avatarUrl: { type: String, required: false },
    status: {
        type: String,
        required: true,
        enum: ['approved', 'denied', 'pending'],
        default: 'pending'
    },
    activityCount: { type: Number, required: true, default: 0 },
    templateName: { type: String, required: true, default: 'janny' }, // New field with default
    questions: { type: [questionSchema], required: true, default: [] },
    endorsements: { type: [endorsementSchema], required: true, default: [] },
    activity_pending: { type: Boolean, required: true, default: false },
    cycleId: { type: String, required: true },
    guildId: { type: String, required: true }, // New field
    appointed: { type: Boolean, required: true, default: false },
    appointedAt: { type: Date, required: false },
    archivedAt: { type: Date, required: false },
    createdAt: { type: Date, required: true, default: Date.now }
});

// Update unique index to include guildId
applicationSchema.index({ userId: 1, cycleId: 1, guildId: 1 }, { unique: true }); // One application per user per cycle per guild
applicationSchema.index({ cycleId: 1, guildId: 1 });
applicationSchema.index({ guildId: 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ createdAt: -1 });

export const Application = model<db_application>('Applications', applicationSchema);