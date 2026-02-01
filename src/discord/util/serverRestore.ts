// src/discord/util/serverRestore.ts - MODIFIED VERSION

import {
    Guild,
    ChannelType,
    ButtonInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ComponentType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';
import { ServerBackup } from '../models/serverBackup';

export interface RestoreOptions {
    clearExisting: boolean;
    skipServerInfo: boolean;
    skipRoles: boolean;
    skipChannels: boolean;
    skipEmojis: boolean;
    skipStickers: boolean;
    skipSoundboards: boolean;
    smartRestore: boolean; // Skip items that already exist
}

export interface RestoreResult {
    server: boolean;
    roles: number;
    channels: number;
    emojis: number;
    stickers: number;
    soundboardSounds: number;
    skipped: {
        server: boolean;
        roles: number;
        channels: number;
        emojis: number;
        stickers: number;
    };
    limitReached: {
        emojis: boolean;
        stickers: boolean;
        roles: boolean;
    };
    conflicts: {
        roles: string[];
        channels: string[];
    };
    errors: string[];
}

export interface RoleMapping {
    backupId: string;
    backupName: string;
    newId?: string;
    newName?: string;
    action: 'create' | 'map' | 'skip';
}

export interface ChannelMapping {
    backupId: string;
    backupName: string;
    backupParentId?: string | null;
    newId?: string;
    newName?: string;
    newParentId?: string | null;
    action: 'create' | 'map' | 'skip';
}

/**
 * Perform a complete server restore from backup with smart capabilities
 */
export async function performRestore(
    guild: Guild,
    backup: ServerBackup,
    options: RestoreOptions,
    interaction: ButtonInteraction
): Promise<void> {
    try {
        let restored: RestoreResult = {
            server: false,
            roles: 0,
            channels: 0,
            emojis: 0,
            stickers: 0,
            soundboardSounds: 0,
            skipped: {
                server: false,
                roles: 0,
                channels: 0,
                emojis: 0,
                stickers: 0
            },
            limitReached: {
                emojis: false,
                stickers: false,
                roles: false
            },
            conflicts: {
                roles: [],
                channels: []
            },
            errors: []
        };

        // Check limits before starting
        const limitCheck = checkDiscordLimits(guild, backup);
        console.log('[RESTORE] Discord limits check:', limitCheck);

        // Update progress function with robust error handling
        let progressMessageValid = true;
        const updateProgress = async (step: string) => {
            // Skip updates if we know the message is invalid
            if (!progressMessageValid) {
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🔄 Restoring Server')
                .setDescription(step)
                .setColor('#FFA500')
                .addFields(
                    { name: 'Server Info', value: options.skipServerInfo ? '⏭️ Skipped' : (restored.server ? '✅' : '⏳'), inline: true },
                    { name: 'Roles', value: options.skipRoles ? '⏭️ Skipped' : `${restored.roles}/${backup.roles.length} (${restored.skipped.roles} skipped)`, inline: true },
                    { name: 'Channels', value: options.skipChannels ? '⏭️ Skipped' : `${restored.channels}/${backup.channels.length} (${restored.skipped.channels} skipped)`, inline: true },
                    { name: 'Emojis', value: options.skipEmojis ? '⏭️ Skipped' : `${restored.emojis}/${backup.emojis.length} (${restored.skipped.emojis} skipped)`, inline: true },
                    { name: 'Stickers', value: options.skipStickers ? '⏭️ Skipped' : `${restored.stickers}/${backup.stickers.length} (${restored.skipped.stickers} skipped)`, inline: true },
                    { name: 'Sounds', value: options.skipSoundboards ? '⏭️ Skipped' : `${restored.soundboardSounds}/${backup.soundboardSounds.length}`, inline: true }
                );

            try {
                await interaction.editReply({ embeds: [embed] });
            } catch (error: any) {
                // Mark message as invalid to stop further update attempts
                progressMessageValid = false;
                
                // Only log specific errors, ignore unknown message errors
                if (error.code !== 10008) { // 10008 = Unknown Message
                    console.warn('[RESTORE] Failed to update progress message:', error.message);
                } else {
                    console.log('[RESTORE] Progress message no longer exists, continuing restore silently...');
                }
            }
        };

        // Clear existing content if requested
        if (options.clearExisting) {
            await updateProgress('Clearing existing server content...');
            await clearExistingContent(guild, options);
        }

        // Restore server info
        if (!options.skipServerInfo) {
            await updateProgress('Restoring server information...');
            restored.server = await restoreServerInfo(guild, backup, restored.errors);
        } else {
            restored.skipped.server = true;
            console.log('[RESTORE] Skipping server information restore');
        }

        // Create role mappings with conflict resolution
        const roleMap = new Map<string, string>();
        if (!options.skipRoles) {
            await updateProgress('Analyzing role conflicts...');
            const roleMappings = await createRoleMappings(guild, backup, options.smartRestore);
            
            if (roleMappings.some(m => m.action === 'map' && !m.newId)) {
                // Handle role conflicts
                const resolvedMappings = await handleRoleConflicts(interaction, roleMappings);
                restored.roles = await restoreRoles(guild, backup, roleMap, restored, resolvedMappings, updateProgress, limitCheck.limits.roles);
            } else {
                restored.roles = await restoreRoles(guild, backup, roleMap, restored, roleMappings, updateProgress, limitCheck.limits.roles);
            }
        }

        // Create channel mappings with conflict resolution
        if (!options.skipChannels) {
            await updateProgress('Analyzing channel conflicts...');
            const channelMappings = await createChannelMappings(guild, backup, options.smartRestore);
            
            if (channelMappings.some(m => m.action === 'map' && !m.newId)) {
                // Handle channel conflicts
                const resolvedMappings = await handleChannelConflicts(interaction, channelMappings);
                restored.channels = await restoreChannels(guild, backup, roleMap, restored, resolvedMappings, updateProgress, options.skipRoles);
            } else {
                restored.channels = await restoreChannels(guild, backup, roleMap, restored, channelMappings, updateProgress, options.skipRoles);
            }
        }

        // Restore emojis with limit awareness
        if (!options.skipEmojis) {
            await updateProgress('Restoring emojis...');
            restored.emojis = await restoreEmojisWithLimits(guild, backup, restored, updateProgress, options.smartRestore, limitCheck.limits.emojis);
        }

        // Restore stickers with limit awareness
        if (!options.skipStickers) {
            await updateProgress('Restoring stickers...');
            restored.stickers = await restoreStickersWithLimits(guild, backup, restored, updateProgress, options.smartRestore, limitCheck.limits.stickers);
        }

        // Note: Soundboard sounds cannot be restored via bot API
        restored.soundboardSounds = 0;

        // Create final success embed and send with error handling
        try {
            await showRestoreResults(interaction, backup, restored, options);
        } catch (finalError: any) {
            console.warn('[RESTORE] Failed to send final restore results, but restore completed');
            
            // Try to send a basic success message as fallback
            try {
                const basicEmbed = new EmbedBuilder()
                    .setTitle('✅ Server Restore Complete')
                    .setDescription(`Restore completed! Check console for detailed results.`)
                    .setColor('#00FF00');
                    
                await interaction.editReply({ embeds: [basicEmbed] });
            } catch (fallbackError) {
                console.error('[RESTORE] Could not send any final message, but restore was successful');
            }
        }

    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Restore Failed')
            .setDescription(`An error occurred during restore: ${error}`)
            .setColor('#FF0000');

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Create role mappings for smart restore
 */
async function createRoleMappings(guild: Guild, backup: ServerBackup, smartRestore: boolean): Promise<RoleMapping[]> {
    const mappings: RoleMapping[] = [];
    const existingRoles = guild.roles.cache;

    for (const roleData of backup.roles) {
        // Skip @everyone role
        if (roleData.name === '@everyone') continue;

        const mapping: RoleMapping = {
            backupId: roleData.id,
            backupName: roleData.name,
            action: 'create'
        };

        if (smartRestore) {
            // Try to find existing role by name
            const existingRole = existingRoles.find(r => r.name === roleData.name);
            if (existingRole) {
                mapping.newId = existingRole.id;
                mapping.newName = existingRole.name;
                mapping.action = 'map';
            }
        }

        mappings.push(mapping);
    }

    return mappings;
}

/**
 * Create channel mappings for smart restore
 */
async function createChannelMappings(guild: Guild, backup: ServerBackup, smartRestore: boolean): Promise<ChannelMapping[]> {
    const mappings: ChannelMapping[] = [];
    const existingChannels = guild.channels.cache;

    for (const channelData of backup.channels) {
        const mapping: ChannelMapping = {
            backupId: channelData.id,
            backupName: channelData.name,
            backupParentId: channelData.parentId || null,
            action: 'create'
        };

        if (smartRestore) {
            // Try to find existing channel by name and type
            const existingChannel = existingChannels.find(c => 
                c.name === channelData.name && c.type === channelData.type
            );
            if (existingChannel) {
                mapping.newId = existingChannel.id;
                mapping.newName = existingChannel.name;
                mapping.newParentId = existingChannel.parentId || null;
                mapping.action = 'map';
            }
        }

        mappings.push(mapping);
    }

    return mappings;
}

/**
 * Handle role conflicts with user intervention
 */
async function handleRoleConflicts(interaction: ButtonInteraction, mappings: RoleMapping[]): Promise<RoleMapping[]> {
    const conflicts = mappings.filter(m => m.action === 'map' && !m.newId);
    
    if (conflicts.length === 0) return mappings;

    // Create conflict resolution interface
    const embed = new EmbedBuilder()
        .setTitle('🔧 Role Conflicts Detected')
        .setDescription('Some roles from the backup cannot be automatically mapped. Please choose how to handle each conflict:')
        .setColor('#FFA500');

    const options = [
        new StringSelectMenuOptionBuilder()
            .setLabel('Create New Roles')
            .setDescription('Create new roles for all conflicts')
            .setValue('create_all'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Skip Conflicted Roles')
            .setDescription('Skip roles that cannot be mapped')
            .setValue('skip_all'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Manual Review')
            .setDescription('Review each conflict individually')
            .setValue('manual')
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('role_conflict_resolution')
        .setPlaceholder('Choose conflict resolution strategy')
        .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.editReply({ embeds: [embed], components: [row] });

    const response = await interaction.followUp({ 
        content: 'Please select how to handle role conflicts above.',
        ephemeral: true 
    });

    try {
        const selection = await response.awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 60000
        });

        const choice = selection.values[0];
        
        switch (choice) {
            case 'create_all':
                conflicts.forEach(conflict => conflict.action = 'create');
                break;
            case 'skip_all':
                conflicts.forEach(conflict => conflict.action = 'skip');
                break;
            case 'manual':
                // For now, default to create - could implement detailed manual resolution
                conflicts.forEach(conflict => conflict.action = 'create');
                break;
        }

        await selection.update({
            content: `Conflict resolution applied: ${choice}`,
            components: []
        });

    } catch (error) {
        // Timeout - default to create
        conflicts.forEach(conflict => conflict.action = 'create');
    }

    return mappings;
}

/**
 * Handle channel conflicts with user intervention
 */
async function handleChannelConflicts(interaction: ButtonInteraction, mappings: ChannelMapping[]): Promise<ChannelMapping[]> {
    const conflicts = mappings.filter(m => m.action === 'map' && !m.newId);
    
    if (conflicts.length === 0) return mappings;

    // Similar to role conflicts - simplified for brevity
    conflicts.forEach(conflict => conflict.action = 'create');
    return mappings;
}

/**
 * Restore roles with smart mapping and limit awareness
 */
async function restoreRoles(
    guild: Guild, 
    backup: ServerBackup, 
    roleMap: Map<string, string>, 
    restored: RestoreResult,
    mappings: RoleMapping[],
    updateProgress: (step: string) => Promise<void>,
    limits: { current: number; backup: number; limit: number; available: number }
): Promise<number> {
    let restoredCount = 0;
    let rolesToCreate = mappings.filter(m => m.action === 'create').length;
    
    console.log(`[RESTORE] Role limits - Available: ${limits.available}, To Create: ${rolesToCreate}`);
    
    // Sort roles by position to restore in correct order
    const sortedMappings = mappings.sort((a, b) => {
        const roleA = backup.roles.find(r => r.id === a.backupId)!;
        const roleB = backup.roles.find(r => r.id === b.backupId)!;
        return roleA.position - roleB.position;
    });
    
    let rolesCreated = 0;
    
    for (const mapping of sortedMappings) {
        const roleData = backup.roles.find(r => r.id === mapping.backupId)!;
        
        try {
            if (mapping.action === 'skip') {
                restored.skipped.roles++;
                continue;
            }
            
            if (mapping.action === 'map' && mapping.newId) {
                // Use existing role
                roleMap.set(mapping.backupId, mapping.newId);
                restored.skipped.roles++;
                console.log(`[RESTORE] Mapped role ${roleData.name} to existing role`);
                continue;
            }
            
            // Check if we've hit the role limit
            if (rolesCreated >= limits.available) {
                console.log(`[RESTORE] Role limit reached. Skipping remaining roles starting with: ${roleData.name}`);
                restored.limitReached.roles = true;
                restored.errors.push(`Role ${roleData.name}: Server role limit reached (${limits.current + rolesCreated}/${limits.limit})`);
                continue;
            }
            
            // Create new role
            const newRole = await guild.roles.create({
                name: roleData.name,
                color: roleData.color,
                hoist: roleData.hoist,
                permissions: BigInt(roleData.permissions),
                mentionable: roleData.mentionable,
                reason: 'Server backup restore'
            });
            
            roleMap.set(mapping.backupId, newRole.id);
            restoredCount++;
            rolesCreated++;
            await updateProgress(`Restoring roles... (${restoredCount}/${Math.min(rolesToCreate, limits.available)} possible)`);
            
        } catch (error) {
            restored.errors.push(`Role ${roleData.name}: ${error}`);
        }
    }

    console.log(`[RESTORE] Roles completed: ${restoredCount} created, ${restored.skipped.roles} mapped/skipped`);
    return restoredCount;
}

/**
 * Restore channels with smart mapping and proper hierarchy
 */
async function restoreChannels(
    guild: Guild, 
    backup: ServerBackup, 
    roleMap: Map<string, string>, 
    restored: RestoreResult,
    mappings: ChannelMapping[],
    updateProgress: (step: string) => Promise<void>,
    skipRoles: boolean
): Promise<number> {
    let restoredCount = 0;
    const channelMap = new Map<string, string>();
    
    // First pass: Create/map categories
    const categoryMappings = mappings.filter(m => {
        const channelData = backup.channels.find(c => c.id === m.backupId)!;
        return channelData.type === ChannelType.GuildCategory;
    });
    
    for (const mapping of categoryMappings) {
        const channelData = backup.channels.find(c => c.id === mapping.backupId)!;
        
        try {
            if (mapping.action === 'skip') {
                restored.skipped.channels++;
                continue;
            }
            
            if (mapping.action === 'map' && mapping.newId) {
                channelMap.set(mapping.backupId, mapping.newId);
                restored.skipped.channels++;
                continue;
            }
            
            const newCategory = await guild.channels.create({
                name: channelData.name,
                type: ChannelType.GuildCategory,
                position: channelData.position,
                reason: 'Server backup restore'
            });
            
            channelMap.set(mapping.backupId, newCategory.id);
            restoredCount++;
            
        } catch (error: any) {
            restored.errors.push(`Category ${channelData.name}: ${error.message}`);
        }
    }

    // Second pass: Create/map other channels
    const otherMappings = mappings.filter(m => {
        const channelData = backup.channels.find(c => c.id === m.backupId)!;
        return channelData.type !== ChannelType.GuildCategory;
    });
    
    for (const mapping of otherMappings) {
        const channelData = backup.channels.find(c => c.id === mapping.backupId)!;
        
        try {
            if (mapping.action === 'skip') {
                restored.skipped.channels++;
                continue;
            }
            
            if (mapping.action === 'map' && mapping.newId) {
                channelMap.set(mapping.backupId, mapping.newId);
                restored.skipped.channels++;
                continue;
            }
            
            const createData: any = {
                name: channelData.name,
                type: channelData.type,
                position: channelData.position,
                parent: channelData.parentId ? channelMap.get(channelData.parentId) : undefined,
                reason: 'Server backup restore'
            };

            // Add channel-specific properties
            if (channelData.topic) createData.topic = channelData.topic;
            if (channelData.nsfw !== undefined) createData.nsfw = channelData.nsfw;
            if (channelData.rateLimitPerUser) createData.rateLimitPerUser = channelData.rateLimitPerUser;
            if (channelData.bitrate) createData.bitrate = channelData.bitrate;
            if (channelData.userLimit) createData.userLimit = channelData.userLimit;
            if (channelData.rtcRegion) createData.rtcRegion = channelData.rtcRegion;

            const newChannel = await guild.channels.create(createData);
            
            // Restore permission overwrites
            if (channelData.permissionOverwrites.length > 0 && !skipRoles) {
                await restoreChannelPermissions(newChannel, channelData.permissionOverwrites, roleMap);
            }
            
            channelMap.set(mapping.backupId, newChannel.id);
            restoredCount++;
            await updateProgress(`Restoring channels... (${restoredCount}/${mappings.length})`);
            
        } catch (error: any) {
            restored.errors.push(`Channel ${channelData.name}: ${error.message}`);
        }
    }

    return restoredCount;
}

/**
 * Restore emojis with limit awareness - ENHANCED VERSION WITH LIMITS
 */
async function restoreEmojisWithLimits(
    guild: Guild, 
    backup: ServerBackup, 
    restored: RestoreResult,
    updateProgress: (step: string) => Promise<void>,
    smartRestore: boolean,
    limits: { current: number; backup: number; limit: number; available: number }
): Promise<number> {
    let restoredCount = 0;
    let apiCallsCount = 0;
    const existingEmojis = guild.emojis.cache;
    
    console.log(`[RESTORE] Starting emoji restoration with limits: ${limits.available} slots available`);
    console.log(`[RESTORE] ${backup.emojis.length} emojis to process`);
    console.log(`[RESTORE] Smart restore enabled: ${smartRestore}`);
    
    // Calculate how many we can actually create
    let emojisToCreateCount = 0;
    const emojisToProcess = [];
    
    for (const emojiData of backup.emojis) {
        let willCreate = true;
        
        if (smartRestore) {
            const existingEmoji = existingEmojis.find(e => e.name === emojiData.name);
            if (existingEmoji) {
                willCreate = false;
            }
        }
        
        emojisToProcess.push({
            emojiData,
            willCreate,
            canCreate: willCreate && emojisToCreateCount < limits.available
        });
        
        if (willCreate) {
            emojisToCreateCount++;
        }
    }
    
    const maxPossibleCreations = Math.min(emojisToCreateCount, limits.available);
    console.log(`[RESTORE] Emojis analysis - Total: ${backup.emojis.length}, Will create: ${emojisToCreateCount}, Can create: ${maxPossibleCreations}`);
    
    let emojisCreated = 0;
    
    for (let i = 0; i < emojisToProcess.length; i++) {
        const { emojiData, willCreate, canCreate } = emojisToProcess[i];
        
        try {
            console.log(`[RESTORE] Processing emoji ${i + 1}/${backup.emojis.length}: ${emojiData.name}`);
            
            // Check if emoji already exists (smart restore)
            if (smartRestore && !willCreate) {
                restored.skipped.emojis++;
                console.log(`[RESTORE] Skipping existing emoji: ${emojiData.name} (${restored.skipped.emojis} skipped so far)`);
                
                // Update progress for skipped emojis too
                if ((i + 1) % 10 === 0 || i === backup.emojis.length - 1) {
                    await updateProgress(`Restoring emojis... (${restoredCount + restored.skipped.emojis}/${backup.emojis.length} processed, ${restoredCount}/${maxPossibleCreations} restored, ${restored.skipped.emojis} skipped)`);
                }
                continue;
            }
            
            // Check if we've hit the creation limit
            if (!canCreate) {
                console.log(`[RESTORE] Emoji limit reached. Skipping: ${emojiData.name} (${emojisCreated}/${limits.available} slots used)`);
                restored.limitReached.emojis = true;
                restored.errors.push(`Emoji ${emojiData.name}: Server emoji limit reached (${limits.current + emojisCreated}/${limits.limit})`);
                
                // Update progress to show limit reached
                if ((i + 1) % 10 === 0 || i === backup.emojis.length - 1) {
                    await updateProgress(`Emoji limit reached. (${restoredCount + restored.skipped.emojis}/${backup.emojis.length} processed, ${restoredCount}/${maxPossibleCreations} restored, ${restored.skipped.emojis} skipped)`);
                }
                continue;
            }
            
            console.log(`[RESTORE] Creating emoji ${emojiData.name} (${emojisCreated + 1}/${maxPossibleCreations} of available slots)`);
            
            // Rate limiting: Add delay between emoji CREATIONS
            if (apiCallsCount > 0 && apiCallsCount % 5 === 0) {
                console.log(`[RESTORE] Rate limiting: waiting 2 seconds after ${apiCallsCount} emoji creation attempts...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log(`[RESTORE] Rate limiting wait complete, continuing...`);
            }
            
            // Increment API calls counter since we're about to make an API call
            apiCallsCount++;
            
            console.log(`[RESTORE] Attempting to create emoji: ${emojiData.name} (API call #${apiCallsCount})`);
            
            // Retry logic for emoji creation
            let attempts = 0;
            const maxAttempts = 3;
            let success = false;
            
            while (attempts < maxAttempts && !success) {
                attempts++;
                console.log(`[RESTORE] Emoji creation attempt ${attempts}/${maxAttempts} for: ${emojiData.name}`);
                
                try {
                    const startTime = Date.now();
                    console.log(`[RESTORE] Making Discord API call to create emoji...`);
                    
                    // First, validate the URL is accessible
                    console.log(`[RESTORE] Testing emoji URL accessibility...`);
                    try {
                        const response = await fetch(emojiData.url, { 
                            method: 'HEAD',
                            signal: AbortSignal.timeout(10000) // 10 second timeout for URL check
                        });
                        console.log(`[RESTORE] URL test response: ${response.status} ${response.statusText}`);
                        
                        if (!response.ok) {
                            throw new Error(`URL returned ${response.status}: ${response.statusText}`);
                        }
                    } catch (urlError: any) {
                        console.error(`[RESTORE] URL test failed for ${emojiData.name}: ${urlError.message}`);
                        restored.errors.push(`Emoji ${emojiData.name}: URL inaccessible - ${urlError.message}`);
                        break; // Don't retry if URL is bad
                    }
                    
                    console.log(`[RESTORE] URL is accessible, proceeding with emoji creation...`);
                    
                    // Create emoji with timeout
                    const emojiCreationPromise = guild.emojis.create({
                        attachment: emojiData.url,
                        name: emojiData.name,
                        reason: 'Server backup restore'
                    });
                    
                    // Add a timeout to the emoji creation
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Emoji creation timed out after 30 seconds'));
                        }, 30000); // 30 second timeout
                    });
                    
                    const newEmoji = await Promise.race([emojiCreationPromise, timeoutPromise]);
                    
                    const duration = Date.now() - startTime;
                    success = true;
                    restoredCount++;
                    emojisCreated++;
                    console.log(`[RESTORE] ✅ Successfully restored emoji: ${emojiData.name} in ${duration}ms (${restoredCount}/${maxPossibleCreations} restored)`);
                    console.log(`[RESTORE] New emoji ID: ${newEmoji.id}`);
                    
                } catch (createError: any) {
                    console.error(`[RESTORE] ❌ Error on attempt ${attempts} for emoji ${emojiData.name}:`);
                    console.error(`[RESTORE] Error details:`, {
                        code: createError.code,
                        message: createError.message,
                        status: createError.status,
                        method: createError.method,
                        url: createError.url,
                        retry_after: createError.retry_after
                    });
                    
                    if (createError.code === 50013) { // Missing Permissions
                        console.error(`[RESTORE] Missing permissions to create emoji: ${emojiData.name}`);
                        restored.errors.push(`Emoji ${emojiData.name}: Missing permissions`);
                        break; // Don't retry permission errors
                    } else if (createError.code === 30008) { // Maximum number of emojis reached
                        console.error(`[RESTORE] Maximum emoji limit reached at emoji: ${emojiData.name}`);
                        restored.limitReached.emojis = true;
                        restored.errors.push(`Emoji ${emojiData.name}: Server emoji limit reached`);
                        
                        // Mark all remaining emojis as limit-reached
                        for (let j = i; j < backup.emojis.length; j++) {
                            if (emojisToProcess[j].willCreate && emojisToProcess[j].canCreate) {
                                restored.errors.push(`Emoji ${backup.emojis[j].name}: Server emoji limit reached`);
                            }
                        }
                        
                        await updateProgress(`Emoji limit reached. ${restoredCount + restored.skipped.emojis}/${backup.emojis.length} processed, ${restoredCount} restored, ${restored.skipped.emojis} skipped`);
                        return restoredCount;
                        
                    } else if (createError.code === 50035) { // Invalid form body
                        console.error(`[RESTORE] Invalid emoji data for: ${emojiData.name} - ${createError.message}`);
                        restored.errors.push(`Emoji ${emojiData.name}: Invalid emoji data - ${createError.message}`);
                        break; // Don't retry invalid data
                    } else if (createError.code === 50001) { // Missing Access
                        console.error(`[RESTORE] Missing access to create emoji: ${emojiData.name}`);
                        restored.errors.push(`Emoji ${emojiData.name}: Missing access`);
                        break; // Don't retry access errors
                    } else if (createError.code === 50138) { // Invalid image
                        console.error(`[RESTORE] Invalid image for emoji: ${emojiData.name}`);
                        restored.errors.push(`Emoji ${emojiData.name}: Invalid image`);
                        break; // Don't retry invalid images
                    } else if (createError.code === 429) { // Rate Limited
                        const retryAfter = createError.retry_after || 5;
                        console.warn(`[RESTORE] Rate limited, waiting ${retryAfter} seconds before retry ${attempts}/${maxAttempts} for emoji: ${emojiData.name}`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                        console.log(`[RESTORE] Rate limit wait complete, retrying...`);
                    } else if (createError.code === 10008) { // Unknown Message/Guild
                        console.error(`[RESTORE] Guild no longer exists or bot was removed: ${emojiData.name}`);
                        restored.errors.push(`Emoji ${emojiData.name}: Guild no longer accessible`);
                        return restoredCount; // Exit completely
                    } else if (createError.message && createError.message.includes('Emoji creation timed out')) {
                        console.error(`[RESTORE] Emoji creation timed out for: ${emojiData.name}`);
                        if (attempts < maxAttempts) {
                            console.log(`[RESTORE] Timeout, waiting 5 seconds before retry...`);
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        } else {
                            restored.errors.push(`Emoji ${emojiData.name}: Creation timed out`);
                        }
                    } else if (createError.message && createError.message.includes('URL inaccessible')) {
                        console.error(`[RESTORE] URL inaccessible for emoji: ${emojiData.name}`);
                        restored.errors.push(`Emoji ${emojiData.name}: URL no longer accessible`);
                        break; // Don't retry if URL is permanently inaccessible
                    } else if (createError.message && (createError.message.includes('ENOTFOUND') || createError.message.includes('ECONNRESET'))) {
                        console.error(`[RESTORE] Network error for emoji ${emojiData.name}: ${createError.message}`);
                        if (attempts < maxAttempts) {
                            console.log(`[RESTORE] Network error, waiting 5 seconds before retry...`);
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        } else {
                            restored.errors.push(`Emoji ${emojiData.name}: Network error`);
                        }
                    } else if (createError.code === 'ECONNRESET' || createError.code === 'ETIMEDOUT') {
                        console.warn(`[RESTORE] Connection error (${createError.code}) for emoji ${emojiData.name}`);
                        if (attempts < maxAttempts) {
                            console.log(`[RESTORE] Connection error, waiting 5 seconds before retry...`);
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        } else {
                            restored.errors.push(`Emoji ${emojiData.name}: Connection error`);
                        }
                    } else {
                        console.warn(`[RESTORE] Attempt ${attempts}/${maxAttempts} failed for emoji ${emojiData.name}: ${createError.message}`);
                        if (attempts < maxAttempts) {
                            console.log(`[RESTORE] Waiting 2 seconds before retry...`);
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
                        }
                    }
                }
            }
            
            if (!success) {
                restored.errors.push(`Emoji ${emojiData.name}: Failed after ${maxAttempts} attempts`);
                console.error(`[RESTORE] ❌ Failed to restore emoji after ${maxAttempts} attempts: ${emojiData.name}`);
            }
            
            // Update progress every 10 emojis or on last emoji
            if ((i + 1) % 10 === 0 || i === backup.emojis.length - 1) {
                console.log(`[RESTORE] Progress update: ${restoredCount + restored.skipped.emojis}/${backup.emojis.length} processed`);
                await updateProgress(`Restoring emojis... (${restoredCount + restored.skipped.emojis}/${backup.emojis.length} processed, ${restoredCount}/${maxPossibleCreations} restored, ${restored.skipped.emojis} skipped)`);
            }
            
        } catch (error: any) {
            console.error(`[RESTORE] Unexpected error processing emoji ${emojiData.name}:`, error);
            console.error(`[RESTORE] Error stack:`, error.stack);
            restored.errors.push(`Emoji ${emojiData.name}: ${error.message}`);
        }
    }
    
    console.log(`[RESTORE] Emoji restoration completed: ${restoredCount} restored, ${restored.skipped.emojis} skipped, ${restored.errors.length} errors`);
    return restoredCount;
}

/**
 * Restore stickers with limit awareness - ENHANCED VERSION WITH LIMITS
 */
async function restoreStickersWithLimits(
    guild: Guild, 
    backup: ServerBackup, 
    restored: RestoreResult,
    updateProgress: (step: string) => Promise<void>,
    smartRestore: boolean,
    limits: { current: number; backup: number; limit: number; available: number }
): Promise<number> {
    let restoredCount = 0;
    let apiCallsCount = 0;
    const existingStickers = guild.stickers.cache;
    
    console.log(`[RESTORE] Starting sticker restoration with limits: ${limits.available} slots available`);
    console.log(`[RESTORE] ${backup.stickers.length} stickers to process`);
    
    // Calculate how many we can actually create
    let stickersToCreateCount = 0;
    const stickersToProcess = [];
    
    for (const stickerData of backup.stickers) {
        let willCreate = true;
        
        if (smartRestore) {
            const existingSticker = existingStickers.find(s => s.name === stickerData.name);
            if (existingSticker) {
                willCreate = false;
            }
        }
        
        stickersToProcess.push({
            stickerData,
            willCreate,
            canCreate: willCreate && stickersToCreateCount < limits.available
        });
        
        if (willCreate) {
            stickersToCreateCount++;
        }
    }
    
    const maxPossibleCreations = Math.min(stickersToCreateCount, limits.available);
    console.log(`[RESTORE] Stickers analysis - Total: ${backup.stickers.length}, Will create: ${stickersToCreateCount}, Can create: ${maxPossibleCreations}`);
    
    let stickersCreated = 0;

    for (let i = 0; i < stickersToProcess.length; i++) {
        const { stickerData, willCreate, canCreate } = stickersToProcess[i];
        
        try {
            // Check if sticker already exists (smart restore)
            if (smartRestore && !willCreate) {
                restored.skipped.stickers++;
                console.log(`[RESTORE] Skipping existing sticker: ${stickerData.name}`);
                
                // Update progress for skipped stickers too
                if ((i + 1) % 5 === 0 || i === backup.stickers.length - 1) {
                    await updateProgress(`Restoring stickers... (${restoredCount + restored.skipped.stickers}/${backup.stickers.length} processed, ${restoredCount}/${maxPossibleCreations} restored, ${restored.skipped.stickers} skipped)`);
                }
                continue;
            }
            
            // Check if we've hit the creation limit
            if (!canCreate) {
                console.log(`[RESTORE] Sticker limit reached. Skipping: ${stickerData.name} (${stickersCreated}/${limits.available} slots used)`);
                restored.limitReached.stickers = true;
                restored.errors.push(`Sticker ${stickerData.name}: Server sticker limit reached (${limits.current + stickersCreated}/${limits.limit})`);
                
                // Update progress to show limit reached
                if ((i + 1) % 5 === 0 || i === backup.stickers.length - 1) {
                    await updateProgress(`Sticker limit reached. (${restoredCount + restored.skipped.stickers}/${backup.stickers.length} processed, ${restoredCount}/${maxPossibleCreations} restored, ${restored.skipped.stickers} skipped)`);
                }
                continue;
            }
            
            console.log(`[RESTORE] Creating sticker ${stickerData.name} (${stickersCreated + 1}/${maxPossibleCreations} of available slots)`);

            // Rate limiting: Add delay between sticker CREATIONS
            if (apiCallsCount > 0 && apiCallsCount % 3 === 0) {
                console.log(`[RESTORE] Rate limiting: waiting 2 seconds after ${apiCallsCount} sticker creation attempts...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Increment API calls counter since we're about to make an API call
            apiCallsCount++;
            
            // Retry logic for sticker creation
            let attempts = 0;
            const maxAttempts = 3;
            let success = false;
            
            while (attempts < maxAttempts && !success) {
                attempts++;
                
                try {
                    await guild.stickers.create({
                        file: stickerData.url,
                        name: stickerData.name,
                        description: stickerData.description || '',
                        tags: stickerData.tags || stickerData.name,
                        reason: 'Server backup restore'
                    });
                    
                    success = true;
                    restoredCount++;
                    stickersCreated++;
                    console.log(`[RESTORE] Successfully restored sticker: ${stickerData.name} (${restoredCount}/${maxPossibleCreations} restored)`);
                    
                } catch (createError: any) {
                    
                    if (createError.code === 50013) { // Missing Permissions
                        console.error(`[RESTORE] Missing permissions to create sticker: ${stickerData.name}`);
                        restored.errors.push(`Sticker ${stickerData.name}: Missing permissions`);
                        break;
                    } else if (createError.code === 30039) { // Maximum number of stickers reached
                        console.error(`[RESTORE] Maximum sticker limit reached at sticker: ${stickerData.name}`);
                        restored.limitReached.stickers = true;
                        restored.errors.push(`Sticker ${stickerData.name}: Server sticker limit reached`);
                        
                        // Mark all remaining stickers as limit-reached
                        for (let j = i; j < backup.stickers.length; j++) {
                            if (stickersToProcess[j].willCreate && stickersToProcess[j].canCreate) {
                                restored.errors.push(`Sticker ${backup.stickers[j].name}: Server sticker limit reached`);
                            }
                        }
                        
                        await updateProgress(`Sticker limit reached. ${restoredCount + restored.skipped.stickers}/${backup.stickers.length} processed, ${restoredCount} restored, ${restored.skipped.stickers} skipped`);
                        return restoredCount;
                        
                    } else if (createError.code === 429) { // Rate Limited
                        const retryAfter = createError.retry_after || 5;
                        console.warn(`[RESTORE] Rate limited, waiting ${retryAfter} seconds before retry ${attempts}/${maxAttempts} for sticker: ${stickerData.name}`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    } else {
                        console.warn(`[RESTORE] Attempt ${attempts}/${maxAttempts} failed for sticker ${stickerData.name}:`, createError.message);
                        if (attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
            }
            
            if (!success) {
                restored.errors.push(`Sticker ${stickerData.name}: Failed after ${maxAttempts} attempts`);
                console.error(`[RESTORE] Failed to restore sticker after ${maxAttempts} attempts: ${stickerData.name}`);
            }
            
            // Update progress every 5 stickers or on last sticker
            if ((i + 1) % 5 === 0 || i === backup.stickers.length - 1) {
                await updateProgress(`Restoring stickers... (${restoredCount + restored.skipped.stickers}/${backup.stickers.length} processed, ${restoredCount}/${maxPossibleCreations} restored, ${restored.skipped.stickers} skipped)`);
            }
            
        } catch (error: any) {
            console.error(`[RESTORE] Unexpected error restoring sticker ${stickerData.name}:`, error);
            restored.errors.push(`Sticker ${stickerData.name}: ${error.message}`);
        }
    }
    
    console.log(`[RESTORE] Sticker restoration completed: ${restoredCount} restored, ${restored.skipped.stickers} skipped, ${restored.errors.length} errors`);
    return restoredCount;
}

/**
 * Restore channel permissions with role mapping
 */
async function restoreChannelPermissions(
    channel: any, 
    permissionOverwrites: any[], 
    roleMap: Map<string, string>
): Promise<void> {
    for (const overwrite of permissionOverwrites) {
        try {
            let targetId = overwrite.id;
            let targetExists = false;
            
            if (overwrite.type === 0) { // Role overwrite
                const newRoleId = roleMap.get(overwrite.id);
                if (newRoleId) {
                    targetId = newRoleId;
                    targetExists = true;
                } else {
                    console.log(`[RESTORE] Skipping role overwrite - role ${overwrite.id} not found in mapping`);
                    continue;
                }
            } else if (overwrite.type === 1) { // User overwrite
                try {
                    const member = await channel.guild.members.fetch(overwrite.id);
                    if (member) {
                        targetExists = true;
                    }
                } catch (error) {
                    console.log(`[RESTORE] Skipping user overwrite - user ${overwrite.id} not in guild`);
                    continue;
                }
            }
            
            if (!targetExists) continue;
            
            await channel.permissionOverwrites.create(targetId, {
                allow: BigInt(overwrite.allow),
                deny: BigInt(overwrite.deny)
            });
            
        } catch (error: any) {
            console.warn(`[RESTORE] Failed to restore permission overwrite:`, error.message);
        }
    }
}

/**
 * Clear existing server content
 */
async function clearExistingContent(guild: Guild, options: RestoreOptions): Promise<void> {
    // Delete channels
    if (!options.skipChannels) {
        for (const [, channel] of guild.channels.cache) {
            if (channel.type !== ChannelType.GuildCategory && 'delete' in channel) {
                try {
                    await (channel as any).delete();
                } catch (error) {
                    console.log(`Could not delete channel ${channel.name}: ${error}`);
                }
            }
        }
    }

    // Delete roles
    if (!options.skipRoles) {
        for (const [, role] of guild.roles.cache) {
            if (role.id !== guild.id && !role.managed) {
                try {
                    await role.delete();
                } catch (error) {
                    console.log(`Could not delete role ${role.name}: ${error}`);
                }
            }
        }
    }

    // Delete emojis
    if (!options.skipEmojis) {
        for (const [, emoji] of guild.emojis.cache) {
            if (!emoji.managed) {
                try {
                    await emoji.delete();
                } catch (error) {
                    console.log(`Could not delete emoji ${emoji.name}: ${error}`);
                }
            }
        }
    }

    // Delete stickers
    if (!options.skipStickers) {
        for (const [, sticker] of guild.stickers.cache) {
            try {
                await sticker.delete();
            } catch (error) {
                console.log(`Could not delete sticker ${sticker.name}: ${error}`);
            }
        }
    }
}

/**
 * Restore server information
 */
async function restoreServerInfo(guild: Guild, backup: ServerBackup, errors: string[]): Promise<boolean> {
    try {
        const editData: any = {
            name: backup.server.name,
            verificationLevel: backup.server.verificationLevel,
            defaultMessageNotifications: backup.server.defaultMessageNotifications,
            explicitContentFilter: backup.server.explicitContentFilter,
            afkTimeout: backup.server.afkTimeout,
            systemChannelFlags: backup.server.systemChannelFlags,
            preferredLocale: backup.server.preferredLocale
        };

        if (backup.server.description) {
            editData.description = backup.server.description;
        }

        await guild.edit(editData);
        return true;
    } catch (error) {
        errors.push(`Server info: ${error}`);
        return false;
    }
}

/**
 * Show final restore results - ENHANCED VERSION WITH LIMIT INFO
 */
async function showRestoreResults(
    interaction: ButtonInteraction,
    backup: ServerBackup,
    restored: RestoreResult,
    options: RestoreOptions
): Promise<void> {
    const successEmbed = new EmbedBuilder()
        .setTitle('✅ Server Restore Complete')
        .setDescription(`Successfully restored backup **${backup.name}**`)
        .setColor('#00FF00')
        .addFields(
            { name: 'Server Info', value: options.skipServerInfo ? '⏭️ Skipped' : (restored.server ? '✅ Restored' : '❌ Failed'), inline: true },
            { name: 'Roles', value: options.skipRoles ? '⏭️ Skipped' : `✅ ${restored.roles}/${backup.roles.length} (${restored.skipped.roles} existing)`, inline: true },
            { name: 'Channels', value: options.skipChannels ? '⏭️ Skipped' : `✅ ${restored.channels}/${backup.channels.length} (${restored.skipped.channels} existing)`, inline: true },
            { name: 'Emojis', value: options.skipEmojis ? '⏭️ Skipped' : `✅ ${restored.emojis}/${backup.emojis.length} (${restored.skipped.emojis} existing)`, inline: true },
            { name: 'Stickers', value: options.skipStickers ? '⏭️ Skipped' : `✅ ${restored.stickers}/${backup.stickers.length} (${restored.skipped.stickers} existing)`, inline: true },
            { name: 'Soundboard Sounds', value: `⚠️ Manual restore required`, inline: true }
        );

    // Add limit reached information
    const limitInfo = [];
    if (restored.limitReached.roles) limitInfo.push('🔴 Role limit reached');
    if (restored.limitReached.emojis) limitInfo.push('🔴 Emoji limit reached'); 
    if (restored.limitReached.stickers) limitInfo.push('🔴 Sticker limit reached');
    
    if (limitInfo.length > 0) {
        successEmbed.addFields({
            name: '⚠️ Discord Limits Reached',
            value: limitInfo.join('\n') + '\n\n*Some items were skipped due to Discord server limits. Consider server boost for higher limits.*',
            inline: false
        });
    }

    if (restored.errors.length > 0) {
        const errorList = restored.errors.slice(0, 10).join('\n');
        successEmbed.addFields({
            name: `⚠️ Errors (${restored.errors.length})`,
            value: errorList + (restored.errors.length > 10 ? '\n...' : ''),
            inline: false
        });
    }

    if (backup.soundboardSounds.length > 0) {
        successEmbed.addFields({
            name: '🔊 Soundboard Sounds',
            value: `${backup.soundboardSounds.length} soundboard sounds were found in the backup but cannot be restored automatically. These need to be manually re-uploaded.`,
            inline: false
        });
    }

    // Add performance statistics
    const totalItems = backup.roles.length + backup.channels.length + backup.emojis.length + backup.stickers.length;
    const restoredItems = restored.roles + restored.channels + restored.emojis + restored.stickers;
    const skippedItems = restored.skipped.roles + restored.skipped.channels + restored.skipped.emojis + restored.skipped.stickers;
    const successRate = totalItems > 0 ? Math.round((restoredItems / totalItems) * 100) : 100;

    successEmbed.addFields({
        name: '📊 Restore Statistics',
        value: `**Success Rate:** ${successRate}%\n**Total Items:** ${totalItems}\n**Newly Restored:** ${restoredItems}\n**Skipped (Existing):** ${skippedItems}\n**Errors:** ${restored.errors.length}`,
        inline: false
    });

    await interaction.editReply({ embeds: [successEmbed] });
}

/**
 * Check Discord limits and provide warnings before restoration - MODIFIED TO ALLOW PARTIAL RESTORE
 */
function checkDiscordLimits(guild: Guild, backup: ServerBackup): {
    canProceed: boolean;
    warnings: string[];
    limits: {
        emojis: { current: number; backup: number; limit: number; available: number };
        stickers: { current: number; backup: number; limit: number; available: number };
        roles: { current: number; backup: number; limit: number; available: number };
    };
} {
    const warnings: string[] = [];
    let canProceed = true; // Always allow proceeding now

    // Get current counts
    const currentEmojis = guild.emojis.cache.size;
    const currentStickers = guild.stickers.cache.size;
    const currentRoles = guild.roles.cache.size;

    // Get backup counts
    const backupEmojis = backup.emojis.length;
    const backupStickers = backup.stickers.length;
    const backupRoles = backup.roles.length;

    // Discord limits (these can vary based on boost level)
    const emojiLimit = guild.premiumTier >= 3 ? 250 : (guild.premiumTier >= 2 ? 150 : (guild.premiumTier >= 1 ? 100 : 50));
    const stickerLimit = guild.premiumTier >= 3 ? 60 : (guild.premiumTier >= 2 ? 30 : (guild.premiumTier >= 1 ? 15 : 5));
    const roleLimit = 250;

    // Calculate available slots
    const availableEmojis = Math.max(0, emojiLimit - currentEmojis);
    const availableStickers = Math.max(0, stickerLimit - currentStickers);
    const availableRoles = Math.max(0, roleLimit - currentRoles);

    const limits = {
        emojis: { current: currentEmojis, backup: backupEmojis, limit: emojiLimit, available: availableEmojis },
        stickers: { current: currentStickers, backup: backupStickers, limit: stickerLimit, available: availableStickers },
        roles: { current: currentRoles, backup: backupRoles, limit: roleLimit, available: availableRoles }
    };

    // Check emoji limits - now just warns, doesn't block
    if (backupEmojis > availableEmojis) {
        if (availableEmojis === 0) {
            warnings.push(`⚠️ Emoji Limit: No emoji slots available (${currentEmojis}/${emojiLimit}). All ${backupEmojis} emojis will be skipped.`);
        } else {
            warnings.push(`⚠️ Emoji Limit: Only ${availableEmojis} of ${backupEmojis} emojis can be restored (${currentEmojis}/${emojiLimit} current).`);
        }
    }

    // Check sticker limits - now just warns, doesn't block
    if (backupStickers > availableStickers) {
        if (availableStickers === 0) {
            warnings.push(`⚠️ Sticker Limit: No sticker slots available (${currentStickers}/${stickerLimit}). All ${backupStickers} stickers will be skipped.`);
        } else {
            warnings.push(`⚠️ Sticker Limit: Only ${availableStickers} of ${backupStickers} stickers can be restored (${currentStickers}/${stickerLimit} current).`);
        }
    }

    // Check role limits - now just warns, doesn't block
    if (backupRoles > availableRoles) {
        if (availableRoles === 0) {
            warnings.push(`⚠️ Role Limit: No role slots available (${currentRoles}/${roleLimit}). All ${backupRoles} roles will be skipped.`);
        } else {
            warnings.push(`⚠️ Role Limit: Only ${availableRoles} of ${backupRoles} roles can be restored (${currentRoles}/${roleLimit} current).`);
        }
    }

    return { canProceed, warnings, limits };
}

/**
 * Validate restore compatibility - MODIFIED TO ALWAYS ALLOW PROCEEDING
 */
export function validateRestoreCompatibility(guild: Guild, backup: ServerBackup): {
    compatible: boolean;
    warnings: string[];
    requirements: string[];
} {
    const warnings: string[] = [];
    const requirements: string[] = [];

    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember) {
        requirements.push('Bot must be in the server');
        return { compatible: false, warnings, requirements };
    }

    if (!botMember.permissions.has('Administrator')) {
        if (!botMember.permissions.has('ManageRoles')) {
            requirements.push('Manage Roles permission required to restore roles');
        }
        if (!botMember.permissions.has('ManageChannels')) {
            requirements.push('Manage Channels permission required to restore channels');
        }
        if (!botMember.permissions.has('ManageEmojisAndStickers')) {
            requirements.push('Manage Emojis and Stickers permission required to restore emojis/stickers');
        }
        if (!botMember.permissions.has('ManageGuild')) {
            requirements.push('Manage Server permission required to restore server info');
        }
    }

    // Check Discord limits but don't block
    const limitCheck = checkDiscordLimits(guild, backup);
    warnings.push(...limitCheck.warnings);

    // Add partial restore information to warnings
    if (limitCheck.warnings.length > 0) {
        warnings.push('');
        warnings.push('🔄 **Partial Restore Mode**: The restore will proceed and create as many items as possible within Discord limits.');
        warnings.push('💡 **Tip**: Consider boosting the server for higher limits or use smart_restore to skip existing items.');
    }

    // Check for potential conflicts
    if (guild.channels.cache.size > 0) {
        warnings.push('Server has existing channels. Consider using smart_restore or clear_existing option.');
    }

    if (guild.roles.cache.size > 1) { // More than @everyone
        warnings.push('Server has existing roles. Consider using smart_restore or clear_existing option.');
    }

    // Only block for critical permission issues, not limits
    const hasRequiredPermissions = requirements.length === 0;

    return {
        compatible: hasRequiredPermissions, // Always compatible if permissions are OK
        warnings,
        requirements
    };
}