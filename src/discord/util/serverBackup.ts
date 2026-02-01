// src/discord/util/serverBackup.ts

import {
    Guild,
    ChannelType
} from 'discord.js';
import {
    ServerBackup,
    ServerInfo,
    RoleBackup,
    ChannelBackup,
    EmojiBackup,
    StickerBackup,
    SoundboardSoundBackup,
    PermissionOverwriteBackup
} from '../models/serverBackup';
import { memberBulkFetch } from './member-fetch-wrapper';

export interface BackupOptions {
    includeRoles: boolean;
    includeChannels: boolean;
    includeEmojis: boolean;
    includeStickers: boolean;
    includeSoundboards: boolean;
}

/**
 * Create a complete backup of a Discord server
 */
export async function createServerBackup(
    guild: Guild,
    options: BackupOptions = {
        includeRoles: true,
        includeChannels: true,
        includeEmojis: true,
        includeStickers: true,
        includeSoundboards: true
    },
    updateProgress?: (step: string, current: number, total: number) => Promise<void>
): Promise<ServerBackup> {
    console.log('[BACKUP_UTIL] Starting createServerBackup function');
    console.log(`[BACKUP_UTIL] Guild: ${guild.name} (${guild.id})`);
    console.log(`[BACKUP_UTIL] Options:`, options);

    try {
        console.log('[BACKUP_UTIL] Generating backup ID...');
        const backupId = generateBackupId();
        console.log(`[BACKUP_UTIL] Generated backup ID: ${backupId}`);

        const backup: ServerBackup = {
            id: backupId,
            name: '',
            guildId: guild.id,
            guildName: guild.name,
            createdAt: new Date(),
            createdBy: '',
            server: await backupServerInfo(guild),
            roles: [],
            channels: [],
            emojis: [],
            stickers: [],
            soundboardSounds: []
        };

        console.log('[BACKUP_UTIL] Initial backup object created');
        console.log(`[BACKUP_UTIL] Server info backed up: ${backup.server.name}`);

        let currentStep = 0;
        const totalSteps = [
            options.includeRoles,
            options.includeChannels,
            options.includeEmojis,
            options.includeStickers,
            options.includeSoundboards
        ].filter(Boolean).length;

        // Backup roles
        if (options.includeRoles) {
            console.log('[BACKUP_UTIL] Starting role backup...');
            if (updateProgress) await updateProgress('Backing up roles...', ++currentStep, totalSteps);
            backup.roles = await backupRoles(guild);
            console.log(`[BACKUP_UTIL] Roles backed up: ${backup.roles.length} roles`);
        }

        // Backup channels
        if (options.includeChannels) {
            console.log('[BACKUP_UTIL] Starting channel backup...');
            if (updateProgress) await updateProgress('Backing up channels...', ++currentStep, totalSteps);
            backup.channels = await backupChannels(guild);
            console.log(`[BACKUP_UTIL] Channels backed up: ${backup.channels.length} channels`);
        }

        // Backup emojis
        if (options.includeEmojis) {
            console.log('[BACKUP_UTIL] Starting emoji backup...');
            if (updateProgress) await updateProgress('Backing up emojis...', ++currentStep, totalSteps);
            backup.emojis = await backupEmojis(guild);
            console.log(`[BACKUP_UTIL] Emojis backed up: ${backup.emojis.length} emojis`);
        }

        // Backup stickers
        if (options.includeStickers) {
            console.log('[BACKUP_UTIL] Starting sticker backup...');
            if (updateProgress) await updateProgress('Backing up stickers...', ++currentStep, totalSteps);
            backup.stickers = await backupStickers(guild);
            console.log(`[BACKUP_UTIL] Stickers backed up: ${backup.stickers.length} stickers`);
        }

        // Backup soundboard sounds
        if (options.includeSoundboards) {
            console.log('[BACKUP_UTIL] Starting soundboard backup...');
            if (updateProgress) await updateProgress('Backing up soundboard sounds...', ++currentStep, totalSteps);
            backup.soundboardSounds = await backupSoundboardSounds(guild);
            console.log(`[BACKUP_UTIL] Soundboard sounds backed up: ${backup.soundboardSounds.length} sounds`);
        }

        if (updateProgress) await updateProgress('Finalizing backup...', totalSteps, totalSteps);

        console.log('[BACKUP_UTIL] Backup creation completed successfully');
        console.log(`[BACKUP_UTIL] Final backup size: ${JSON.stringify(backup).length} bytes`);

        return backup;

    } catch (error: any) {
        console.error('[BACKUP_UTIL] Error in createServerBackup:');
        console.error('[BACKUP_UTIL] Error name:', error.name);
        console.error('[BACKUP_UTIL] Error message:', error.message);
        console.error('[BACKUP_UTIL] Error stack:', error.stack);
        throw error;
    }
}

/**
 * Create selective backup of specific components
 */
export async function createSelectiveBackup(
    guild: Guild,
    components: ('roles' | 'channels' | 'emojis' | 'stickers' | 'soundboards')[],
    updateProgress?: (step: string, current: number, total: number) => Promise<void>
): Promise<ServerBackup> {
    const options: BackupOptions = {
        includeRoles: components.includes('roles'),
        includeChannels: components.includes('channels'),
        includeEmojis: components.includes('emojis'),
        includeStickers: components.includes('stickers'),
        includeSoundboards: components.includes('soundboards')
    };

    return createServerBackup(guild, options, updateProgress);
}

/**
 * Backup server information
 */
async function backupServerInfo(guild: Guild): Promise<ServerInfo> {
    console.log('[BACKUP_UTIL] Starting server info backup...');
    try {
        const serverInfo: ServerInfo = {
            name: guild.name,
            description: guild.description || undefined,
            icon: guild.iconURL({ size: 1024 }) || undefined,
            banner: guild.bannerURL({ size: 1024 }) || undefined,
            splash: guild.splashURL({ size: 1024 }) || undefined,
            discoverySplash: guild.discoverySplashURL({ size: 1024 }) || undefined,
            verificationLevel: guild.verificationLevel,
            defaultMessageNotifications: guild.defaultMessageNotifications,
            explicitContentFilter: guild.explicitContentFilter,
            afkChannelId: guild.afkChannelId,
            afkTimeout: guild.afkTimeout,
            systemChannelId: guild.systemChannelId,
            systemChannelFlags: guild.systemChannelFlags.bitfield,
            rulesChannelId: guild.rulesChannelId,
            publicUpdatesChannelId: guild.publicUpdatesChannelId,
            preferredLocale: guild.preferredLocale,
            features: guild.features
        };
        console.log('[BACKUP_UTIL] Server info backup completed');
        return serverInfo;
    } catch (error) {
        console.error('[BACKUP_UTIL] Error backing up server info:', error);
        throw error;
    }
}

/**
 * Backup all roles with proper hierarchy preservation
 */
async function backupRoles(guild: Guild): Promise<RoleBackup[]> {
    console.log('[BACKUP_UTIL] Starting role backup...');
    try {
        await guild.roles.fetch();
        console.log(`[BACKUP_UTIL] Fetched ${guild.roles.cache.size} roles from cache`);

        const roles: RoleBackup[] = [];

        // Sort roles by position to preserve hierarchy
        const sortedRoles = Array.from(guild.roles.cache.values())
            .filter(role => role.id !== guild.id) // Skip @everyone role
            .sort((a, b) => a.position - b.position);

        for (const role of sortedRoles) {
            try {
                roles.push({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    icon: role.iconURL() || undefined,
                    unicodeEmoji: role.unicodeEmoji,
                    position: role.position,
                    permissions: role.permissions.bitfield.toString(),
                    managed: role.managed,
                    mentionable: role.mentionable
                });
            } catch (roleError) {
                console.warn(`[BACKUP_UTIL] Failed to backup role ${role.name}:`, roleError);
            }
        }

        console.log(`[BACKUP_UTIL] Role backup completed: ${roles.length} roles processed`);
        return roles;
    } catch (error) {
        console.error('[BACKUP_UTIL] Error backing up roles:', error);
        throw error;
    }
}

/**
 * Backup all channels with full hierarchy and permissions
 */
async function backupChannels(guild: Guild): Promise<ChannelBackup[]> {
    console.log('[BACKUP_UTIL] Starting channel backup...');
    try {
        await guild.channels.fetch();
        const channels: ChannelBackup[] = [];

        // Sort channels by type and position to preserve hierarchy
        const sortedChannels = Array.from(guild.channels.cache.values())
            .filter(channel => 'position' in channel)
            .sort((a, b) => {
                // Categories first, then by position
                if (a.type === ChannelType.GuildCategory && b.type !== ChannelType.GuildCategory) return -1;
                if (b.type === ChannelType.GuildCategory && a.type !== ChannelType.GuildCategory) return 1;
                return ((a as any).position || 0) - ((b as any).position || 0);
            });

        for (const channel of sortedChannels) {
            try {
                const channelBackup: ChannelBackup = {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    position: ('position' in channel ? (channel as any).position : 0) || 0,
                    parentId: channel.parentId,
                    permissionOverwrites: await backupChannelPermissions(channel)
                };

                // Add channel-specific properties based on type
                if (channel.isTextBased() && 'guild' in channel) {
                    const textChannel = channel as any;
                    channelBackup.topic = textChannel.topic || undefined;
                    channelBackup.nsfw = textChannel.nsfw || false;
                    channelBackup.rateLimitPerUser = textChannel.rateLimitPerUser || 0;
                    channelBackup.defaultAutoArchiveDuration = textChannel.defaultAutoArchiveDuration || undefined;
                }

                if (channel.type === ChannelType.GuildVoice) {
                    const voiceChannel = channel as any;
                    channelBackup.bitrate = voiceChannel.bitrate;
                    channelBackup.userLimit = voiceChannel.userLimit;
                    channelBackup.rtcRegion = voiceChannel.rtcRegion || undefined;
                }

                if (channel.type === ChannelType.GuildForum) {
                    const forumChannel = channel as any;
                    channelBackup.topic = forumChannel.topic || undefined;
                    channelBackup.nsfw = forumChannel.nsfw || false;
                    channelBackup.rateLimitPerUser = forumChannel.rateLimitPerUser || 0;
                    channelBackup.defaultAutoArchiveDuration = forumChannel.defaultAutoArchiveDuration || undefined;
                    channelBackup.availableTags = forumChannel.availableTags || [];
                    channelBackup.defaultReactionEmoji = forumChannel.defaultReactionEmoji || undefined;
                    channelBackup.defaultSortOrder = forumChannel.defaultSortOrder || undefined;
                    channelBackup.defaultForumLayout = forumChannel.defaultForumLayout || undefined;
                }

                channels.push(channelBackup);
            } catch (channelError) {
                console.warn(`[BACKUP_UTIL] Failed to backup channel ${channel.name}:`, channelError);
            }
        }

        console.log(`[BACKUP_UTIL] Channel backup completed: ${channels.length} channels processed`);
        return channels;
    } catch (error) {
        console.error('[BACKUP_UTIL] Error backing up channels:', error);
        throw error;
    }
}

/**
 * Backup channel permissions
 */
async function backupChannelPermissions(channel: any): Promise<PermissionOverwriteBackup[]> {
    const overwrites: PermissionOverwriteBackup[] = [];

    if (!('permissionOverwrites' in channel)) {
        return overwrites;
    }

    try {
        for (const [, overwrite] of channel.permissionOverwrites.cache) {
            overwrites.push({
                id: overwrite.id,
                type: overwrite.type,
                allow: overwrite.allow.bitfield.toString(),
                deny: overwrite.deny.bitfield.toString()
            });
        }
    } catch (error) {
        console.warn(`[BACKUP_UTIL] Failed to backup permissions for channel ${channel.name}:`, error);
    }

    return overwrites;
}

/**
 * Backup all emojis
 */
async function backupEmojis(guild: Guild): Promise<EmojiBackup[]> {
    console.log('[BACKUP_UTIL] Starting emoji backup...');
    try {
        await guild.emojis.fetch();
        const emojis: EmojiBackup[] = [];

        for (const [, emoji] of guild.emojis.cache) {
            try {
                emojis.push({
                    id: emoji.id,
                    name: emoji.name || 'unknown',
                    animated: emoji.animated || false,
                    url: emoji.url,
                    roles: emoji.roles.cache.map(role => role.id),
                    managed: emoji.managed || false,
                    available: emoji.available || false,
                    requireColons: emoji.requiresColons || false
                });
            } catch (emojiError) {
                console.warn(`[BACKUP_UTIL] Failed to backup emoji ${emoji.name}:`, emojiError);
            }
        }

        console.log(`[BACKUP_UTIL] Emoji backup completed: ${emojis.length} emojis processed`);
        return emojis;
    } catch (error) {
        console.error('[BACKUP_UTIL] Error backing up emojis:', error);
        throw error;
    }
}

/**
 * Backup all stickers
 */
async function backupStickers(guild: Guild): Promise<StickerBackup[]> {
    console.log('[BACKUP_UTIL] Starting sticker backup...');
    try {
        await guild.stickers.fetch();
        const stickers: StickerBackup[] = [];

        for (const [, sticker] of guild.stickers.cache) {
            try {
                stickers.push({
                    id: sticker.id,
                    name: sticker.name,
                    description: sticker.description || undefined,
                    tags: sticker.tags || undefined,
                    type: sticker.type || 0,
                    format: sticker.format,
                    url: sticker.url,
                    available: sticker.available || false
                });
            } catch (stickerError) {
                console.warn(`[BACKUP_UTIL] Failed to backup sticker ${sticker.name}:`, stickerError);
            }
        }

        console.log(`[BACKUP_UTIL] Sticker backup completed: ${stickers.length} stickers processed`);
        return stickers;
    } catch (error) {
        console.error('[BACKUP_UTIL] Error backing up stickers:', error);
        throw error;
    }
}

/**
 * Backup soundboard sounds
 */
async function backupSoundboardSounds(guild: Guild): Promise<SoundboardSoundBackup[]> {
    console.log('[BACKUP_UTIL] Starting soundboard backup...');
    const sounds: SoundboardSoundBackup[] = [];

    try {
        await memberBulkFetch(guild);
        const soundboardSounds = await guild.soundboardSounds.fetch();

        for (const [, sound] of soundboardSounds) {
            try {
                sounds.push({
                    soundId: sound.soundId,
                    name: sound.name,
                    volume: sound.volume,
                    emojiId: sound.emoji?.id || null,
                    emojiName: sound.emoji?.name || null,
                    user: sound.user ? {
                        id: sound.user.id,
                        username: sound.user.username
                    } : undefined
                });
            } catch (soundError) {
                console.warn(`[BACKUP_UTIL] Failed to backup sound ${sound.name}:`, soundError);
            }
        }

        console.log(`[BACKUP_UTIL] Soundboard backup completed: ${sounds.length} sounds processed`);
    } catch (error) {
        console.log('[BACKUP_UTIL] Could not fetch soundboard sounds (may not be available):', error);
    }

    return sounds;
}

/**
 * Generate a unique backup ID
 */
export function generateBackupId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Validate backup data integrity
 */
export function validateBackup(backup: ServerBackup): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!backup.id) errors.push('Missing backup ID');
    if (!backup.name) errors.push('Missing backup name');
    if (!backup.guildId) errors.push('Missing guild ID');
    if (!backup.guildName) errors.push('Missing guild name');
    if (!backup.createdAt) errors.push('Missing creation date');
    if (!backup.createdBy) errors.push('Missing creator ID');
    if (!backup.server) errors.push('Missing server information');

    // Check arrays exist
    if (!Array.isArray(backup.roles)) errors.push('Roles must be an array');
    if (!Array.isArray(backup.channels)) errors.push('Channels must be an array');
    if (!Array.isArray(backup.emojis)) errors.push('Emojis must be an array');
    if (!Array.isArray(backup.stickers)) errors.push('Stickers must be an array');
    if (!Array.isArray(backup.soundboardSounds)) errors.push('Soundboard sounds must be an array');

    // Validate server info
    if (backup.server) {
        if (!backup.server.name) errors.push('Server name is required');
        if (typeof backup.server.verificationLevel !== 'number') errors.push('Invalid verification level');
        if (typeof backup.server.defaultMessageNotifications !== 'number') errors.push('Invalid default message notifications');
        if (typeof backup.server.explicitContentFilter !== 'number') errors.push('Invalid explicit content filter');
    }

    // Validate roles
    backup.roles.forEach((role, index) => {
        if (!role.id) errors.push(`Role ${index}: Missing ID`);
        if (!role.name) errors.push(`Role ${index}: Missing name`);
        if (typeof role.permissions !== 'string') errors.push(`Role ${index}: Invalid permissions format`);
    });

    // Validate channels
    backup.channels.forEach((channel, index) => {
        if (!channel.id) errors.push(`Channel ${index}: Missing ID`);
        if (!channel.name) errors.push(`Channel ${index}: Missing name`);
        if (typeof channel.type !== 'number') errors.push(`Channel ${index}: Invalid type`);
        if (!Array.isArray(channel.permissionOverwrites)) errors.push(`Channel ${index}: Permission overwrites must be an array`);
    });

    // Validate emojis
    backup.emojis.forEach((emoji, index) => {
        if (!emoji.id) errors.push(`Emoji ${index}: Missing ID`);
        if (!emoji.name) errors.push(`Emoji ${index}: Missing name`);
        if (!emoji.url) errors.push(`Emoji ${index}: Missing URL`);
        if (!Array.isArray(emoji.roles)) errors.push(`Emoji ${index}: Roles must be an array`);
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get backup statistics
 */
export function getBackupStatistics(backup: ServerBackup): {
    totalRoles: number;
    totalChannels: number;
    channelBreakdown: { [type: string]: number };
    totalEmojis: number;
    emojiBreakdown: { animated: number; static: number };
    totalStickers: number;
    totalSounds: number;
    sizeKB: number;
    components: string[];
} {
    const stats = {
        totalRoles: backup.roles.length,
        totalChannels: backup.channels.length,
        channelBreakdown: {} as { [type: string]: number },
        totalEmojis: backup.emojis.length,
        emojiBreakdown: { animated: 0, static: 0 },
        totalStickers: backup.stickers.length,
        totalSounds: backup.soundboardSounds.length,
        sizeKB: Math.round(JSON.stringify(backup).length / 1024),
        components: [] as string[]
    };

    // Determine which components are included
    if (backup.roles.length > 0) stats.components.push('Roles');
    if (backup.channels.length > 0) stats.components.push('Channels');
    if (backup.emojis.length > 0) stats.components.push('Emojis');
    if (backup.stickers.length > 0) stats.components.push('Stickers');
    if (backup.soundboardSounds.length > 0) stats.components.push('Soundboards');

    // Calculate channel breakdown
    backup.channels.forEach(channel => {
        const typeName = getChannelTypeName(channel.type);
        stats.channelBreakdown[typeName] = (stats.channelBreakdown[typeName] || 0) + 1;
    });

    // Calculate emoji breakdown
    backup.emojis.forEach(emoji => {
        if (emoji.animated) {
            stats.emojiBreakdown.animated++;
        } else {
            stats.emojiBreakdown.static++;
        }
    });

    return stats;
}

/**
 * Get human-readable channel type name
 */
function getChannelTypeName(type: number): string {
    const typeMap: { [key: number]: string } = {
        0: 'Text',
        1: 'DM',
        2: 'Voice',
        3: 'Group DM',
        4: 'Category',
        5: 'News',
        10: 'News Thread',
        11: 'Public Thread',
        12: 'Private Thread',
        13: 'Stage',
        15: 'Forum',
        16: 'Media'
    };

    return typeMap[type] || `Type ${type}`;
}

/**
 * Compare two backups and return differences
 */
export function compareBackups(backup1: ServerBackup, backup2: ServerBackup): {
    serverChanges: string[];
    roleChanges: string[];
    channelChanges: string[];
    emojiChanges: string[];
    stickerChanges: string[];
    soundboardChanges: string[];
} {
    const changes = {
        serverChanges: [] as string[],
        roleChanges: [] as string[],
        channelChanges: [] as string[],
        emojiChanges: [] as string[],
        stickerChanges: [] as string[],
        soundboardChanges: [] as string[]
    };

    // Compare server info
    if (backup1.server.name !== backup2.server.name) {
        changes.serverChanges.push(`Name: "${backup1.server.name}" → "${backup2.server.name}"`);
    }
    if (backup1.server.description !== backup2.server.description) {
        changes.serverChanges.push(`Description changed`);
    }

    // Compare roles
    const roles1Map = new Map(backup1.roles.map(r => [r.name, r]));
    const roles2Map = new Map(backup2.roles.map(r => [r.name, r]));

    for (const [name, role] of roles2Map) {
        if (!roles1Map.has(name)) {
            changes.roleChanges.push(`+ Added role: ${role.name}`);
        }
    }

    for (const [name, role] of roles1Map) {
        if (!roles2Map.has(name)) {
            changes.roleChanges.push(`- Removed role: ${role.name}`);
        }
    }

    // Compare channels
    const channels1Map = new Map(backup1.channels.map(c => [c.name, c]));
    const channels2Map = new Map(backup2.channels.map(c => [c.name, c]));

    for (const [name, channel] of channels2Map) {
        if (!channels1Map.has(name)) {
            changes.channelChanges.push(`+ Added channel: ${channel.name}`);
        }
    }

    for (const [name, channel] of channels1Map) {
        if (!channels2Map.has(name)) {
            changes.channelChanges.push(`- Removed channel: ${channel.name}`);
        }
    }

    // Compare emojis
    const emojis1Map = new Map(backup1.emojis.map(e => [e.name, e]));
    const emojis2Map = new Map(backup2.emojis.map(e => [e.name, e]));

    for (const [name, emoji] of emojis2Map) {
        if (!emojis1Map.has(name)) {
            changes.emojiChanges.push(`+ Added emoji: ${emoji.name}`);
        }
    }

    for (const [name, emoji] of emojis1Map) {
        if (!emojis2Map.has(name)) {
            changes.emojiChanges.push(`- Removed emoji: ${emoji.name}`);
        }
    }

    // Compare stickers
    const stickers1Map = new Map(backup1.stickers.map(s => [s.name, s]));
    const stickers2Map = new Map(backup2.stickers.map(s => [s.name, s]));

    for (const [name, sticker] of stickers2Map) {
        if (!stickers1Map.has(name)) {
            changes.stickerChanges.push(`+ Added sticker: ${sticker.name}`);
        }
    }

    for (const [name, sticker] of stickers1Map) {
        if (!stickers2Map.has(name)) {
            changes.stickerChanges.push(`- Removed sticker: ${sticker.name}`);
        }
    }

    // Compare soundboard sounds
    const sounds1Map = new Map(backup1.soundboardSounds.map(s => [s.name, s]));
    const sounds2Map = new Map(backup2.soundboardSounds.map(s => [s.name, s]));

    for (const [name, sound] of sounds2Map) {
        if (!sounds1Map.has(name)) {
            changes.soundboardChanges.push(`+ Added sound: ${sound.name}`);
        }
    }

    for (const [name, sound] of sounds1Map) {
        if (!sounds2Map.has(name)) {
            changes.soundboardChanges.push(`- Removed sound: ${sound.name}`);
        }
    }

    return changes;
}