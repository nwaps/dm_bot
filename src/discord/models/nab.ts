// src/discord/models/userNumbering.ts

export interface RestoreResult {
    success: number;
    skipped: number;
    errors: number;
    conflicts: number;
    details: Array<{
        username: string;
        number: number;
        status: 'success' | 'skipped' | 'error' | 'conflict';
        reason: string;
    }>;
}

export interface SnapshotEntry {
    userId: string;
    username: string;
    discriminator: string;
    number: number;
    nickname: string;
    isPinned: boolean;
    isBoosting: boolean;
    roles: string[];
    joinedAt: string;
    reason: string; // Why this user was included in snapshot
}

export interface NumberSnapshot {
    guildId: string;
    guildName: string;
    createdAt: string;
    createdBy: string;
    config: {
        prefix: string;
        botSuffix: string;
        startPosition: number;
        mode: string;
        fillStrategy: string;
    };
    filters: {
        roles: string[];
        pinnedOnly: boolean;
        boostersOnly: boolean;
        includeAll: boolean;
    };
    entries: SnapshotEntry[];
    metadata: {
        totalMembers: number;
        membersWithNumbers: number;
        snapshotSize: number;
        highestNumber: number;
        lowestNumber: number;
    };
}

import mongoose, { Schema, Document } from 'mongoose';

// Assignment mode enum
export enum AssignmentMode {
    ASCENDING = 'ascending',
    FILL = 'fill'
}

// Fill mode strategy enum
export enum FillStrategy {
    SEQUENTIAL = 'sequential',  // Fill gaps sequentially from lowest
    RANDOM = 'random',         // Fill gaps randomly
    POSITION = 'position'      // Fill gaps starting from a specific position
}

// Interface for User Number configuration
export interface UserNumberConfig {
    guildId: string;
    mode: AssignmentMode;
    prefix: string;
    startPosition: number;
    nextNumber: number;
    fillStrategy: FillStrategy;
    fillStartPosition?: number;
    enabled: boolean;
    botSuffix: string;
    compactImmuneRoles?: string[]; // Added for compact command
}

// Interface for User Number assignment (kept for historical tracking only)
export interface UserNumberAssignment {
    guildId: string;
    userId: string;
    number: number;
    assignedAt: Date;
    isBot: boolean;
    displayName?: string;
    isPinned?: boolean; // Added for pinned numbers
}

export interface PinnedNumber {
    guildId: string;
    userId: string;
    number: number;
    pinnedAt: Date;
    pinnedBy: string; // User ID who pinned this number
    reason?: string;
}

// Interfaces for Mongoose documents
export interface UserNumberConfigDocument extends Document, UserNumberConfig { }
export interface UserNumberAssignmentDocument extends Document, UserNumberAssignment { }
export interface PinnedNumberDocument extends Document, PinnedNumber { }

// Create the Mongoose schemas
const UserNumberConfigSchema = new Schema<UserNumberConfigDocument>({
    guildId: { type: String, required: true, unique: true },
    mode: {
        type: String,
        required: true,
        enum: Object.values(AssignmentMode),
        default: AssignmentMode.ASCENDING
    },
    prefix: { type: String, required: true, default: 'No.' },
    startPosition: { type: Number, required: true, default: 1 },
    nextNumber: { type: Number, required: true, default: 1 },
    fillStrategy: {
        type: String,
        required: true,
        enum: Object.values(FillStrategy),
        default: FillStrategy.SEQUENTIAL
    },
    fillStartPosition: { type: Number },
    enabled: { type: Boolean, required: true, default: false },
    botSuffix: { type: String, required: true, default: 'X' },
    compactImmuneRoles: [{ type: String }] // Added for compact command
}, {
    timestamps: true
});

const UserNumberAssignmentSchema = new Schema<UserNumberAssignmentDocument>({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    number: { type: Number, required: true, index: true },
    assignedAt: { type: Date, required: true, default: Date.now },
    isBot: { type: Boolean, required: true, default: false },
    displayName: { type: String },
    isPinned: { type: Boolean, default: false }
}, {
    timestamps: true
});

const PinnedNumberSchema = new Schema<PinnedNumberDocument>({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    number: { type: Number, required: true, index: true },
    pinnedAt: { type: Date, required: true, default: Date.now },
    pinnedBy: { type: String, required: true },
    reason: { type: String }
}, {
    timestamps: true
});


// Create compound indexes for better query performance
UserNumberAssignmentSchema.index({ guildId: 1, userId: 1 }, { unique: true });
UserNumberAssignmentSchema.index({ guildId: 1, number: 1 });
UserNumberAssignmentSchema.index({ guildId: 1, assignedAt: 1 });

PinnedNumberSchema.index({ guildId: 1, userId: 1 }, { unique: true });
PinnedNumberSchema.index({ guildId: 1, number: 1 }, { unique: true });
PinnedNumberSchema.index({ guildId: 1, pinnedAt: 1 });

// Create and export the models
export const UserNumberConfigModel = mongoose.model<UserNumberConfigDocument>('userNumberConfig', UserNumberConfigSchema);
export const UserNumberAssignmentModel = mongoose.model<UserNumberAssignmentDocument>('userNumberAssignment', UserNumberAssignmentSchema);
export const PinnedNumberModel = mongoose.model<PinnedNumberDocument>('pinnedNumber', PinnedNumberSchema);

// In-memory cache for configurations
export const userNumberConfigs = new Map<string, UserNumberConfig>();

// Database repository singleton
let repository: UserNumberRepository | null = null;

// Database repository for User Number system
export class UserNumberRepository {
    // Save configuration
    async saveConfig(config: UserNumberConfig): Promise<void> {
        try {
            await UserNumberConfigModel.updateOne(
                { guildId: config.guildId },
                config,
                { upsert: true }
            );

            // Update cache
            userNumberConfigs.set(config.guildId, config);
        } catch (error) {
            console.error(`Error saving user number config for guild ${config.guildId}:`, error);
            throw error;
        }
    }

    // Get configuration by guild ID
    async getConfig(guildId: string): Promise<UserNumberConfig | null> {
        // Try cache first
        if (userNumberConfigs.has(guildId)) {
            return userNumberConfigs.get(guildId) || null;
        }

        try {
            const doc = await UserNumberConfigModel.findOne({ guildId });

            if (!doc) {
                return null;
            }

            const config: UserNumberConfig = {
                guildId: doc.guildId,
                mode: doc.mode as AssignmentMode,
                prefix: doc.prefix,
                startPosition: doc.startPosition,
                nextNumber: doc.nextNumber,
                fillStrategy: doc.fillStrategy as FillStrategy,
                fillStartPosition: doc.fillStartPosition,
                enabled: doc.enabled,
                botSuffix: doc.botSuffix,
                compactImmuneRoles: doc.compactImmuneRoles || []
            };

            userNumberConfigs.set(guildId, config);
            return config;
        } catch (error) {
            console.error(`Error getting user number config for guild ${guildId}:`, error);
            throw error;
        }
    }

    // Save user assignment (for historical tracking)
    async saveAssignment(assignment: UserNumberAssignment): Promise<void> {
        try {
            await UserNumberAssignmentModel.updateOne(
                { guildId: assignment.guildId, userId: assignment.userId },
                assignment,
                { upsert: true }
            );
        } catch (error) {
            console.error(`Error saving user number assignment for ${assignment.userId} in guild ${assignment.guildId}:`, error);
            throw error;
        }
    }

    // Delete assignment (for historical tracking)
    async deleteAssignment(guildId: string, userId: string): Promise<void> {
        try {
            await UserNumberAssignmentModel.deleteOne({ guildId, userId });
        } catch (error) {
            console.error(`Error deleting assignment for ${userId} in guild ${guildId}:`, error);
            throw error;
        }
    }

    // Get highest assigned number from database (for next number calculation)
    async getHighestNumber(guildId: string): Promise<number> {
        try {
            const result = await UserNumberAssignmentModel.findOne({ guildId })
                .sort({ number: -1 })
                .select('number');

            return result ? result.number : 0;
        } catch (error) {
            console.error(`Error getting highest number for guild ${guildId}:`, error);
            throw error;
        }
    }

    // Pin a number to a user
    async pinNumber(pinnedNumber: PinnedNumber): Promise<void> {
        try {
            await PinnedNumberModel.updateOne(
                { guildId: pinnedNumber.guildId, userId: pinnedNumber.userId },
                pinnedNumber,
                { upsert: true }
            );
        } catch (error) {
            console.error(`Error pinning number for ${pinnedNumber.userId} in guild ${pinnedNumber.guildId}:`, error);
            throw error;
        }
    }

    // Unpin a number from a user
    async unpinNumber(guildId: string, userId: string): Promise<void> {
        try {
            await PinnedNumberModel.deleteOne({ guildId, userId });
        } catch (error) {
            console.error(`Error unpinning number for ${userId} in guild ${guildId}:`, error);
            throw error;
        }
    }

    // Get pinned number for a user
    async getPinnedNumber(guildId: string, userId: string): Promise<PinnedNumber | null> {
        try {
            const pinnedDoc = await PinnedNumberModel.findOne({ guildId, userId });
            if (!pinnedDoc) return null;

            return {
                guildId: pinnedDoc.guildId,
                userId: pinnedDoc.userId,
                number: pinnedDoc.number,
                pinnedAt: pinnedDoc.pinnedAt,
                pinnedBy: pinnedDoc.pinnedBy,
                reason: pinnedDoc.reason
            };
        } catch (error) {
            console.error(`Error getting pinned number for ${userId} in guild ${guildId}:`, error);
            throw error;
        }
    }

    // Get all pinned numbers for a guild
    async getAllPinnedNumbers(guildId: string): Promise<PinnedNumber[]> {
        try {
            const pinnedDocs = await PinnedNumberModel.find({ guildId }).sort({ number: 1 });
            return pinnedDocs.map(doc => ({
                guildId: doc.guildId,
                userId: doc.userId,
                number: doc.number,
                pinnedAt: doc.pinnedAt,
                pinnedBy: doc.pinnedBy,
                reason: doc.reason
            }));
        } catch (error) {
            console.error(`Error getting pinned numbers for guild ${guildId}:`, error);
            throw error;
        }
    }

    // Check if a number is pinned to someone other than the excluded user
    async isPinnedToOther(guildId: string, number: number, excludeUserId?: string): Promise<PinnedNumber | null> {
        try {
            const query: any = { guildId, number };
            if (excludeUserId) {
                query.userId = { $ne: excludeUserId };
            }

            const pinnedDoc = await PinnedNumberModel.findOne(query);
            if (!pinnedDoc) return null;

            return {
                guildId: pinnedDoc.guildId,
                userId: pinnedDoc.userId,
                number: pinnedDoc.number,
                pinnedAt: pinnedDoc.pinnedAt,
                pinnedBy: pinnedDoc.pinnedBy,
                reason: pinnedDoc.reason
            };
        } catch (error) {
            console.error(`Error checking if number ${number} is pinned in guild ${guildId}:`, error);
            throw error;
        }
    }

    // Update the number on an existing pin record
    async updatePinNumber(guildId: string, userId: string, newNumber: number): Promise<void> {
        try {
            await PinnedNumberModel.updateOne(
                { guildId, userId },
                { $set: { number: newNumber } }
            );
        } catch (error) {
            console.error(`Error updating pin number for ${userId} in guild ${guildId}:`, error);
            throw error;
        }
    }

    // Migrate legacy isPinned assignment records to PinnedNumberModel
    async migrateIsPinnedToModel(): Promise<{ migrated: number; skipped: number; conflicts: number }> {
        let migrated = 0, skipped = 0, conflicts = 0;

        const legacyPinned = await UserNumberAssignmentModel.find({ isPinned: true });

        for (const doc of legacyPinned) {
            // Check if already exists in PinnedNumberModel by user
            const existingByUser = await PinnedNumberModel.findOne({
                guildId: doc.guildId, userId: doc.userId
            });
            if (existingByUser) {
                skipped++;
                await UserNumberAssignmentModel.updateOne(
                    { _id: doc._id },
                    { $set: { isPinned: false } }
                );
                continue;
            }

            // Check for number conflict in PinnedNumberModel
            const existingByNumber = await PinnedNumberModel.findOne({
                guildId: doc.guildId, number: doc.number
            });
            if (existingByNumber) {
                conflicts++;
                console.warn(`Pin migration conflict: number ${doc.number} in guild ${doc.guildId} already pinned to ${existingByNumber.userId}, cannot migrate from ${doc.userId}`);
                await UserNumberAssignmentModel.updateOne(
                    { _id: doc._id },
                    { $set: { isPinned: false } }
                );
                continue;
            }

            try {
                await PinnedNumberModel.create({
                    guildId: doc.guildId,
                    userId: doc.userId,
                    number: doc.number,
                    pinnedAt: doc.assignedAt,
                    pinnedBy: 'migration',
                    reason: 'Migrated from legacy isPinned flag'
                });

                await UserNumberAssignmentModel.updateOne(
                    { _id: doc._id },
                    { $set: { isPinned: false } }
                );
                migrated++;
            } catch (error) {
                console.error(`Pin migration error for user ${doc.userId}:`, error);
                conflicts++;
            }
        }

        return { migrated, skipped, conflicts };
    }

}

/**
 * Initialize the repository for the User Number system
 */
export async function initDatabase(): Promise<UserNumberRepository> {
    try {
        // Check if Mongoose is connected
        if (mongoose.connection.readyState !== 1) {
            console.warn('Warning: Mongoose does not appear to be connected. The User Number system may not work properly.');
        }

        // Create repository instance if it doesn't exist
        if (!repository) {
            repository = new UserNumberRepository();
        }

        // Load configurations from database
        await loadConfigs();

        // Migrate legacy isPinned assignment records to PinnedNumberModel
        const migrationResult = await repository.migrateIsPinnedToModel();
        if (migrationResult.migrated > 0 || migrationResult.conflicts > 0) {
            console.log(`Pin migration: ${migrationResult.migrated} migrated, ${migrationResult.skipped} skipped, ${migrationResult.conflicts} conflicts`);
        }

        return repository;
    } catch (error) {
        console.error('Failed to initialize User Number repository:', error);
        throw error;
    }
}

/**
 * Load configurations from the database into memory cache
 */
async function loadConfigs(): Promise<void> {
    if (!repository) {
        throw new Error('Repository not initialized. Call initDatabase first.');
    }

    try {
        // Clear the existing cache
        userNumberConfigs.clear();

        // Load all configs
        const configDocs = await UserNumberConfigModel.find({});
        configDocs.forEach(doc => {
            const config: UserNumberConfig = {
                guildId: doc.guildId,
                mode: doc.mode as AssignmentMode,
                prefix: doc.prefix,
                startPosition: doc.startPosition,
                nextNumber: doc.nextNumber,
                fillStrategy: doc.fillStrategy as FillStrategy,
                fillStartPosition: doc.fillStartPosition,
                enabled: doc.enabled,
                botSuffix: doc.botSuffix
            };
            userNumberConfigs.set(config.guildId, config);
        });

        console.log(`User Number system initialized: ${configDocs.length} guilds configured`);
    } catch (error) {
        console.error('Error loading User Number configurations:', error);
        throw error;
    }
}

/**
 * Get the repository instance
 */
export function getRepository(): UserNumberRepository {
    if (!repository) {
        throw new Error('Repository not initialized. Call initDatabase first.');
    }

    return repository;
}