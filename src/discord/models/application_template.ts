// src/discord/models/application_template.ts
import { Schema, model } from "mongoose";

export interface TemplateQuestion {
    id: string;
    question: string;
    type: 'yes_no' | 'short_answer';
    required: boolean;
    placeholder?: string;
}

export interface db_application_template {
    name: string; // Template identifier (slug-like)
    displayName: string; // User-friendly name
    description: string;
    questions: TemplateQuestion[];
    guildId?: string; // If null/undefined, it's a global template
    createdBy: string; // User ID who created the template
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const templateQuestionSchema = new Schema({
    id: { type: String, required: true },
    question: { type: String, required: true },
    type: { type: String, required: true, enum: ['yes_no', 'short_answer'] },
    required: { type: Boolean, required: true, default: true },
    placeholder: { type: String, required: false }
});

const applicationTemplateSchema = new Schema<db_application_template>({
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, required: true },
    questions: { type: [templateQuestionSchema], required: true, default: [] },
    guildId: { type: String, required: false }, // Null for global templates
    createdBy: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
});

// Create a compound index for name and guildId to ensure uniqueness
applicationTemplateSchema.index({ name: 1, guildId: 1 }, { unique: true });

// Index for faster queries
applicationTemplateSchema.index({ guildId: 1 });
applicationTemplateSchema.index({ isActive: 1 });
applicationTemplateSchema.index({ createdBy: 1 });

export const ApplicationTemplate = model<db_application_template>('ApplicationTemplates', applicationTemplateSchema);