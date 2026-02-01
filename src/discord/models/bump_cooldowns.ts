// src/discord/models/bump_cooldowns.ts

import { Schema, model, Document } from 'mongoose';

// Interface for the bump cooldown document
export interface IBumpCooldown extends Document {
    channelId: string;
    guildId: string;
    lastBumpTimestamp: Date;
    createdAt: Date;
    updatedAt: Date;
}

// Define the schema for bump cooldowns
const bumpCooldownSchema = new Schema({
    channelId: {
        type: String,
        required: true,
        index: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    lastBumpTimestamp: {
        type: Date,
        required: true,
        default: Date.now
    }
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt
});

// Create compound index for efficient queries
bumpCooldownSchema.index({ channelId: 1, guildId: 1 }, { unique: true });

// TTL index to automatically clean up old records after 30 days
bumpCooldownSchema.index({ lastBumpTimestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Create the model
const BumpCooldown = model<IBumpCooldown>('BumpCooldown', bumpCooldownSchema);

export default BumpCooldown;