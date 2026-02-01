// src/discord/models/pools.ts

import { Schema, model, Document } from "mongoose";

export interface PoolServer {
    guild_id: string;
    guild_name: string;
    invite_code?: string; // Permanent invite for users to join
    auxiliary_boost_role_id?: string; // Role given to pooled boosters
    target_boost_count: number; // Goal number of boosts (17 or 20)
    current_boost_count: number; // Current actual boosts in this server
    auxiliary_boost_count: number; // Current auxiliary boosts from pool
    is_lead_server: boolean;
    joined_at: Date;
}

export interface BoostPool {
    pool_id: string; // Unique identifier for the pool
    pool_name: string;
    lead_server_id: string; // The server that created the pool
    created_by: string; // User ID who created the pool
    created_at: Date;
    servers: PoolServer[];
    is_active: boolean;
}

const poolServerSchema = new Schema<PoolServer>({
    guild_id: { type: String, required: true },
    guild_name: { type: String, required: true },
    invite_code: { type: String, default: null },
    auxiliary_boost_role_id: { type: String, default: null },
    target_boost_count: { type: Number, default: 17 },
    current_boost_count: { type: Number, default: 0 },
    auxiliary_boost_count: { type: Number, default: 0 },
    is_lead_server: { type: Boolean, default: false },
    joined_at: { type: Date, default: Date.now }
});

const boostPoolSchema = new Schema<BoostPool>({
    pool_id: { type: String, required: true, unique: true },
    pool_name: { type: String, required: true },
    lead_server_id: { type: String, required: true, index: true },
    created_by: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    servers: [poolServerSchema],
    is_active: { type: Boolean, default: true }
});

// Indexes for efficient queries (pool_id already has unique index)
boostPoolSchema.index({ 'servers.guild_id': 1 });

export const pool_model = model<BoostPool>('BoostPools', boostPoolSchema);

// Type for document with save method
export type BoostPoolDocument = BoostPool & Document;

// Extended boost event to track pool information
export interface PooledBoostEvent {
    user_id: string;
    guild_id: string; // Which server they boosted
    pool_id?: string; // Which pool this boost is part of
    boost_start: Date;
    boost_end: Date | null;
    nickname_before_boost: string | null;
    nickname_during_boost: string | null;
    is_active: boolean;
    is_auxiliary_boost: boolean; // True if this is from pool, not direct boost
    original_boost_guild_id?: string; // If auxiliary, which server was actually boosted
}

const pooledBoostEventSchema = new Schema<PooledBoostEvent>({
    user_id: { type: String, required: true, index: true },
    guild_id: { type: String, required: true, index: true },
    pool_id: { type: String, default: null, index: true },
    boost_start: { type: Date, required: true },
    boost_end: { type: Date, default: null },
    nickname_before_boost: { type: String, default: null },
    nickname_during_boost: { type: String, default: null },
    is_active: { type: Boolean, default: true, index: true },
    is_auxiliary_boost: { type: Boolean, default: false },
    original_boost_guild_id: { type: String, default: null }
});

// Compound indexes
pooledBoostEventSchema.index({ user_id: 1, guild_id: 1, is_active: 1 });
pooledBoostEventSchema.index({ pool_id: 1, is_active: 1 });
pooledBoostEventSchema.index({ guild_id: 1, is_active: 1 });

export const pooled_boost_model = model<PooledBoostEvent>('PooledBoostEvents', pooledBoostEventSchema);