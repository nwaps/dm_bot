// src/discord/models/serverBackup.ts

import mongoose, { Schema, Document } from 'mongoose';

// Server backup interface (removed messages)
export interface ServerBackup {
    id: string;
    name: string;
    guildId: string;
    guildName: string;
    createdAt: Date;
    createdBy: string;
    server: ServerInfo;
    roles: RoleBackup[];
    channels: ChannelBackup[];
    emojis: EmojiBackup[];
    stickers: StickerBackup[];
    soundboardSounds: SoundboardSoundBackup[];
}

// Server information interface
export interface ServerInfo {
    name: string;
    description?: string;
    icon?: string;
    banner?: string;
    splash?: string;
    discoverySplash?: string;
    verificationLevel: number;
    defaultMessageNotifications: number;
    explicitContentFilter: number;
    afkChannelId: string | null;
    afkTimeout: number;
    systemChannelId: string | null;
    systemChannelFlags: number;
    rulesChannelId: string | null;
    publicUpdatesChannelId: string | null;
    preferredLocale: string;
    features: string[];
}

// Role backup interface
export interface RoleBackup {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    icon?: string;
    unicodeEmoji: string | null;
    position: number;
    permissions: string;
    managed: boolean;
    mentionable: boolean;
}

// Channel backup interface
export interface ChannelBackup {
    id: string;
    name: string;
    type: number;
    position: number;
    parentId: string | null;
    permissionOverwrites: PermissionOverwriteBackup[];
    topic?: string;
    nsfw?: boolean;
    rateLimitPerUser?: number;
    defaultAutoArchiveDuration?: number;
    bitrate?: number;
    userLimit?: number;
    rtcRegion?: string;
    availableTags?: any[];
    defaultReactionEmoji?: any;
    defaultSortOrder?: number;
    defaultForumLayout?: number;
}

// Permission overwrite backup interface
export interface PermissionOverwriteBackup {
    id: string;
    type: number;
    allow: string;
    deny: string;
}

// Emoji backup interface
export interface EmojiBackup {
    id: string;
    name: string;
    animated: boolean;
    url: string;
    roles: string[];
    managed: boolean;
    available: boolean;
    requireColons: boolean;
}

// Sticker backup interface
export interface StickerBackup {
    id: string;
    name: string;
    description?: string;
    tags?: string;
    type: number;
    format: number;
    url: string;
    available: boolean;
}

// Soundboard sound backup interface
export interface SoundboardSoundBackup {
    soundId: string;
    name: string;
    volume: number;
    emojiId: string | null;
    emojiName: string | null;
    user?: {
        id: string;
        username: string;
    };
}

// Mongoose document interface (removed messages)
export interface ServerBackupDocument extends Document {
    id: string;
    name: string;
    guildId: string;
    guildName: string;
    createdAt: Date;
    createdBy: string;
    server: any;
    roles: any[];
    channels: any[];
    emojis: any[];
    stickers: any[];
    soundboardSounds: any[];
}

// Create the Mongoose schema (removed messages field)
const ServerBackupSchema = new Schema<ServerBackupDocument>({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    guildId: { type: String, required: true, index: true },
    guildName: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    createdBy: { type: String, required: true },
    server: { type: Schema.Types.Mixed, required: true },
    roles: [{ type: Schema.Types.Mixed }],
    channels: [{ type: Schema.Types.Mixed }],
    emojis: [{ type: Schema.Types.Mixed }],
    stickers: [{ type: Schema.Types.Mixed }],
    soundboardSounds: [{ type: Schema.Types.Mixed }]
}, { 
    timestamps: true 
});

// Create indexes for better query performance
ServerBackupSchema.index({ guildId: 1, createdAt: -1 });
ServerBackupSchema.index({ createdBy: 1, createdAt: -1 });
ServerBackupSchema.index({ createdAt: -1 });
ServerBackupSchema.index({ name: 'text', guildName: 'text' }); // Text search index

// Create and export the model
export const ServerBackupModel = mongoose.model<ServerBackupDocument>('serverBackup', ServerBackupSchema);

// Database repository singleton
let repository: ServerBackupRepository | null = null;

// Database repository for Server Backup system
export class ServerBackupRepository {
    // Save backup
    async saveBackup(backup: ServerBackup): Promise<void> {
        try {
            await ServerBackupModel.create(backup);
        } catch (error) {
            console.error(`Error saving backup ${backup.id}:`, error);
            throw error;
        }
    }

    // Get backup by ID
    async getBackup(backupId: string): Promise<ServerBackup | null> {
        try {
            const doc = await ServerBackupModel.findOne({ id: backupId });
            if (!doc) return null;

            return {
                id: doc.id,
                name: doc.name,
                guildId: doc.guildId,
                guildName: doc.guildName,
                createdAt: doc.createdAt,
                createdBy: doc.createdBy,
                server: doc.server,
                roles: doc.roles,
                channels: doc.channels,
                emojis: doc.emojis,
                stickers: doc.stickers,
                soundboardSounds: doc.soundboardSounds
            };
        } catch (error) {
            console.error(`Error getting backup ${backupId}:`, error);
            throw error;
        }
    }

    // Get all backups
    async getAllBackups(): Promise<ServerBackup[]> {
        try {
            const docs = await ServerBackupModel.find({}).sort({ createdAt: -1 });
            return docs.map(doc => ({
                id: doc.id,
                name: doc.name,
                guildId: doc.guildId,
                guildName: doc.guildName,
                createdAt: doc.createdAt,
                createdBy: doc.createdBy,
                server: doc.server,
                roles: doc.roles,
                channels: doc.channels,
                emojis: doc.emojis,
                stickers: doc.stickers,
                soundboardSounds: doc.soundboardSounds
            }));
        } catch (error) {
            console.error('Error getting all backups:', error);
            throw error;
        }
    }

    // Get backups by guild ID
    async getBackupsByGuild(guildId: string): Promise<ServerBackup[]> {
        try {
            const docs = await ServerBackupModel.find({ guildId }).sort({ createdAt: -1 });
            return docs.map(doc => ({
                id: doc.id,
                name: doc.name,
                guildId: doc.guildId,
                guildName: doc.guildName,
                createdAt: doc.createdAt,
                createdBy: doc.createdBy,
                server: doc.server,
                roles: doc.roles,
                channels: doc.channels,
                emojis: doc.emojis,
                stickers: doc.stickers,
                soundboardSounds: doc.soundboardSounds
            }));
        } catch (error) {
            console.error(`Error getting backups for guild ${guildId}:`, error);
            throw error;
        }
    }

    // Get backups by creator
    async getBackupsByCreator(userId: string): Promise<ServerBackup[]> {
        try {
            const docs = await ServerBackupModel.find({ createdBy: userId }).sort({ createdAt: -1 });
            return docs.map(doc => ({
                id: doc.id,
                name: doc.name,
                guildId: doc.guildId,
                guildName: doc.guildName,
                createdAt: doc.createdAt,
                createdBy: doc.createdBy,
                server: doc.server,
                roles: doc.roles,
                channels: doc.channels,
                emojis: doc.emojis,
                stickers: doc.stickers,
                soundboardSounds: doc.soundboardSounds
            }));
        } catch (error) {
            console.error(`Error getting backups for creator ${userId}:`, error);
            throw error;
        }
    }

    // Delete backup
    async deleteBackup(backupId: string): Promise<boolean> {
        try {
            const result = await ServerBackupModel.deleteOne({ id: backupId });
            return result.deletedCount > 0;
        } catch (error) {
            console.error(`Error deleting backup ${backupId}:`, error);
            throw error;
        }
    }

    // Update backup name
    async updateBackupName(backupId: string, newName: string): Promise<boolean> {
        try {
            const result = await ServerBackupModel.updateOne(
                { id: backupId },
                { name: newName }
            );
            return result.modifiedCount > 0;
        } catch (error) {
            console.error(`Error updating backup ${backupId}:`, error);
            throw error;
        }
    }

    // Delete old backups (cleanup utility)
    async deleteOldBackups(olderThanDays: number): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
            
            const result = await ServerBackupModel.deleteMany({
                createdAt: { $lt: cutoffDate }
            });
            
            return result.deletedCount || 0;
        } catch (error) {
            console.error(`Error deleting old backups:`, error);
            throw error;
        }
    }

    // Get backup statistics
    async getBackupStats(): Promise<{
        totalBackups: number;
        totalSize: number;
        backupsByGuild: { [guildId: string]: number };
        oldestBackup: Date | null;
        newestBackup: Date | null;
    }> {
        try {
            const docs = await ServerBackupModel.find({});
            
            const stats = {
                totalBackups: docs.length,
                totalSize: 0,
                backupsByGuild: {} as { [guildId: string]: number },
                oldestBackup: null as Date | null,
                newestBackup: null as Date | null
            };

            docs.forEach(doc => {
                // Calculate total size
                stats.totalSize += JSON.stringify(doc.toObject()).length;
                
                // Count by guild
                stats.backupsByGuild[doc.guildId] = (stats.backupsByGuild[doc.guildId] || 0) + 1;
                
                // Track oldest and newest
                if (!stats.oldestBackup || doc.createdAt < stats.oldestBackup) {
                    stats.oldestBackup = doc.createdAt;
                }
                if (!stats.newestBackup || doc.createdAt > stats.newestBackup) {
                    stats.newestBackup = doc.createdAt;
                }
            });

            return stats;
        } catch (error) {
            console.error('Error getting backup statistics:', error);
            throw error;
        }
    }

    // Search backups by component content
    async searchBackups(query: {
        hasRoles?: boolean;
        hasChannels?: boolean;
        hasEmojis?: boolean;
        hasStickers?: boolean;
        hasSoundboards?: boolean;
        nameContains?: string;
        guildName?: string;
        createdBy?: string;
        createdAfter?: Date;
        createdBefore?: Date;
    }): Promise<ServerBackup[]> {
        try {
            const filter: any = {};

            // Text search
            if (query.nameContains) {
                filter.$or = [
                    { name: { $regex: query.nameContains, $options: 'i' } },
                    { guildName: { $regex: query.nameContains, $options: 'i' } }
                ];
            }

            if (query.guildName) {
                filter.guildName = { $regex: query.guildName, $options: 'i' };
            }

            if (query.createdBy) {
                filter.createdBy = query.createdBy;
            }

            // Date range
            if (query.createdAfter || query.createdBefore) {
                filter.createdAt = {};
                if (query.createdAfter) filter.createdAt.$gte = query.createdAfter;
                if (query.createdBefore) filter.createdAt.$lte = query.createdBefore;
            }

            const docs = await ServerBackupModel.find(filter).sort({ createdAt: -1 });
            
            // Filter by component content
            const backups = docs.map(doc => ({
                id: doc.id,
                name: doc.name,
                guildId: doc.guildId,
                guildName: doc.guildName,
                createdAt: doc.createdAt,
                createdBy: doc.createdBy,
                server: doc.server,
                roles: doc.roles,
                channels: doc.channels,
                emojis: doc.emojis,
                stickers: doc.stickers,
                soundboardSounds: doc.soundboardSounds
            })).filter(backup => {
                if (query.hasRoles !== undefined && (backup.roles.length > 0) !== query.hasRoles) return false;
                if (query.hasChannels !== undefined && (backup.channels.length > 0) !== query.hasChannels) return false;
                if (query.hasEmojis !== undefined && (backup.emojis.length > 0) !== query.hasEmojis) return false;
                if (query.hasStickers !== undefined && (backup.stickers.length > 0) !== query.hasStickers) return false;
                if (query.hasSoundboards !== undefined && (backup.soundboardSounds.length > 0) !== query.hasSoundboards) return false;
                return true;
            });

            return backups;
        } catch (error) {
            console.error('Error searching backups:', error);
            throw error;
        }
    }
}

/**
 * Initialize the repository for the Server Backup system
 */
export async function initDatabase(): Promise<ServerBackupRepository> {
    try {
        // Check if Mongoose is connected
        if (mongoose.connection.readyState !== 1) {
            console.warn('Warning: Mongoose does not appear to be connected. The Server Backup system may not work properly.');
        }
        
        // Create repository instance if it doesn't exist
        if (!repository) {
            repository = new ServerBackupRepository();
        }
        
        console.log('Server Backup system initialized with existing database connection');
        
        return repository;
    } catch (error) {
        console.error('Failed to initialize Server Backup repository:', error);
        throw error;
    }
}

/**
 * Get the repository instance
 */
export function getRepository(): ServerBackupRepository {
    if (!repository) {
        throw new Error('Repository not initialized. Call initDatabase first.');
    }
    
    return repository;
}