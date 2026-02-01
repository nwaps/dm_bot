// utils/discord.ts
import config from '../../../config';

const token = config.DISCORD_TOKEN
const headers = {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json'
};

const base_endpoint = `https://discord.com/api/v9/`

export async function getRoleWithDetails(guild_id: string, role_id: string) {
    const endpoint = `${base_endpoint}/guilds/${guild_id}/roles/${role_id}`;
    const { data } = await axios.get(endpoint, { headers })

    if (!data) return null
    return data
}

export async function getMemberWithClan(guild_id: string, user_id: string) {
    const endpoint = `${base_endpoint}/guilds/${guild_id}/members/${user_id}`;
    const { data } = await axios.get(endpoint, { headers })

    if (!data) return null
    return data
}

export async function getAllMembersWithClan(guild_id: string) {
    let allMembers: any[] = [];
    let after = null;
    const limit = 1000;

    do {
        let membersEndpoint = `${base_endpoint}/guilds/${guild_id}/members?limit=${limit}`;
        if (after) {
            membersEndpoint += `&after=${after}`;
        }

        const { data: members } = await axios.get(membersEndpoint, { headers });

        if (!members || members.length === 0) {
            break;
        }

        allMembers = allMembers.concat(members);

        // Set 'after' to the ID of the last member for next page
        if (members.length === limit) {
            after = members[members.length - 1].user.id;
        } else {
            // If we got fewer than the limit, we've reached the end
            after = null;
        }

        // console.log(`Fetched ${members.length} members (total: ${allMembers.length}) for guild ${guild_id}`);

    } while (after !== null);

    // console.log(`Total members fetched: ${allMembers.length} for guild ${guild_id}`);
    return allMembers;
}

export async function validateMembersWithRewards(guild_id: string) {
    const guildSettings = global.SETTINGS[guild_id];

    if (!guildSettings || !guildSettings.roles) {
        console.log(`No settings found for guild ${guild_id}`);
        return [];
    }

    const reward_roles = guildSettings.roles.clan_rewards;

    // Ensure reward_roles is an array of strings
    if (!reward_roles || !Array.isArray(reward_roles) || reward_roles.length === 0) {
        console.log(`No reward roles configured for guild ${guild_id}`);
        return [];
    }

    // Type guard to ensure we have a string array
    const rewardRoleIds = reward_roles.filter((role): role is string => typeof role === 'string');

    if (rewardRoleIds.length === 0) {
        console.log(`No valid reward role IDs found for guild ${guild_id}`);
        return [];
    }

    try {
        // Get all guild members
        const allMembers = await getAllMembersWithClan(guild_id);

        if (allMembers.length === 0) {
            console.log(`No members found for guild ${guild_id}`);
            return [];
        }

        // Filter members who have any of the reward roles
        const membersWithRewardRoles = allMembers.filter(member =>
            member.roles && Array.isArray(member.roles) &&
            member.roles.some((roleId: string) => rewardRoleIds.includes(roleId))
        );

        console.log(`Found ${membersWithRewardRoles.length} members with reward roles in guild ${guild_id}`);

        const validationResults = [];

        // Check each member's clan tag
        for (const member of membersWithRewardRoles) {
            try {
                // Get detailed member info with clan data
                const memberWithClan = await getMemberWithClan(guild_id, member.user.id);

                if (!memberWithClan) {
                    validationResults.push({
                        userId: member.user.id,
                        username: member.user.username,
                        status: 'error',
                        message: 'Could not fetch member clan data',
                        clanTag: null,
                        rewardRoles: Array.isArray(member.roles)
                            ? member.roles.filter((roleId: string) => rewardRoleIds.includes(roleId))
                            : []
                    });
                    continue;
                }

                const clanTag = memberWithClan.user?.clan?.tag || memberWithClan.user?.primary_guild?.tag;

                validationResults.push({
                    userId: member.user.id,
                    username: member.user.username,
                    status: 'success',
                    message: clanTag ? 'Member has clan tag' : 'Member has no clan tag',
                    clanTag: clanTag || null,
                    clanData: memberWithClan.user?.clan || memberWithClan.user?.primary_guild || null,
                    rewardRoles: Array.isArray(member.roles)
                        ? member.roles.filter((roleId: string) => rewardRoleIds.includes(roleId))
                        : []
                });

            } catch (error) {
                console.error(`Error validating member ${member.user.id}:`, error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                validationResults.push({
                    userId: member.user.id,
                    username: member.user.username,
                    status: 'error',
                    message: errorMessage,
                    clanTag: null,
                    rewardRoles: Array.isArray(member.roles)
                        ? member.roles.filter((roleId: string) => rewardRoleIds.includes(roleId))
                        : []
                });
            }
        }

        return validationResults;

    } catch (error) {
        // await set_settings(guild_id, { roles: { clan_rewards: null } })
        console.error(`Error in validateMembersWithRewards for guild ${guild_id}: removing clan rewards as like left guild`);
        throw error;
    }
}

// Store interval ID for cleanup if needed
let validationIntervalId: NodeJS.Timeout | null = null;

function getGuildsWithRewardRoles(): string[] {
    const eligibleGuilds: string[] = [];

    // Iterate through all guild settings
    for (const [guildId, settings] of Object.entries(global.SETTINGS)) {
        if (settings &&
            settings.roles &&
            settings.roles.clan_rewards &&
            Array.isArray(settings.roles.clan_rewards) &&
            settings.roles.clan_rewards.length > 0) {
            eligibleGuilds.push(guildId);
        }
    }

    return eligibleGuilds;
}

async function runValidationForAllGuilds(silent: boolean = false): Promise<void> {
    const eligibleGuilds = getGuildsWithRewardRoles();

    if (eligibleGuilds.length === 0) {
        if (!silent) {
            console.log('No guilds found with clan reward roles configured');
        }
        return;
    }

    if (!silent) {
        console.log(`Starting validation cycle for ${eligibleGuilds.length} guilds`);
    }

    let totalSuccess = 0;
    let totalErrors = 0;
    let totalWithoutClan = 0;
    let totalRolesRemoved = 0;

    for (const guildId of eligibleGuilds) {
        try {
            const results = await validateMembersWithRewards(guildId);

            // Track aggregate stats
            const errorCount = results.filter(r => r.status === 'error').length;
            const successCount = results.filter(r => r.status === 'success').length;
            const membersWithoutClan = results.filter(r => r.status === 'success' && !r.clanTag).length;

            totalSuccess += successCount;
            totalErrors += errorCount;
            totalWithoutClan += membersWithoutClan;

            const validServers = config.TAG_SERVERS
            const needsRemoved = results.filter(r => r.status === 'success' && !validServers.includes(r.clanData?.identity_guild_id))

            for (const invalid of needsRemoved) {
                for (const role of invalid.rewardRoles) {
                    try {

                        const endpoint = `${base_endpoint}guilds/${guildId}/members/${invalid.userId}/roles/${role}`;
                        const resp = await axios.delete(endpoint, { headers })
                        if (resp.status !== 204) console.error(`Couldn't remove ${invalid.userId}'s role ${role} in ${guildId}`)
                        else totalRolesRemoved++;
                    }
                    catch (error) {
                        console.error(error)
                        console.error(`Couldn't delete role from user ${invalid.userId} axios error`)
                    }
                }
            }

        } catch (error) {
            console.error(error)
            // await set_settings(guildId, { roles: { clan_rewards: null } })
            console.error(`Failed to validate guild ${guildId}: removing rewards`);
        }

        // Small delay between guilds to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Validation cycle complete: ${eligibleGuilds.length} guilds processed, ${totalSuccess} validated, ${totalErrors} errors, ${totalWithoutClan} without clans, ${totalRolesRemoved} roles removed`);
}

export function startMemberValidationScheduler(): void {
    if (validationIntervalId) {
        console.log('Member validation scheduler is already running');
        return;
    }

}

export function stopMemberValidationScheduler(): void {
    if (validationIntervalId) {
        clearInterval(validationIntervalId);
        validationIntervalId = null;
        console.log('Member validation scheduler stopped');
    } else {
        console.log('Member validation scheduler is not running');
    }
}

export function getValidationSchedulerStatus(): { isRunning: boolean; nextRunIn?: number } {
    return {
        isRunning: validationIntervalId !== null,
    };
}

export async function triggerManualValidation(): Promise<void> {
    console.log('Manual validation triggered');
    await runValidationForAllGuilds();
}


import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import { set_settings } from './settings';
import { Guild, GuildMember } from 'discord.js';
import { client } from '../bot';

const execAsync = promisify(exec);

interface RolePreviewOptions {
    roleId: string;
    roleColors: string[];
    colorType: string,
    username: string;
    roleIcon?: string | null; // Icon hash from role.icon
    unicodeEmoji?: string | null; // Unicode emoji from role.unicode_emoji
    avatarUrl?: string; // Added optional avatar URL
}

interface EmojiInfo {
    isCustom: boolean;
    path?: string;
    unicode?: string;
}

// New interface for the return value
interface RolePreviewResult {
    roleId: string;
    path: string;
}

export async function generateDiscordRolePreview(options: RolePreviewOptions): Promise<RolePreviewResult> {
    const { roleId, roleColors, colorType, username, roleIcon, unicodeEmoji, avatarUrl } = options;

    // Determine which emoji/icon to use (priority: roleIcon > unicodeEmoji)
    let finalEmoji = '';
    if (roleIcon) {
        // Role has a custom icon (hash)
        finalEmoji = `role_icon:${roleIcon}`;
    } else if (unicodeEmoji) {
        // Role has a unicode emoji
        finalEmoji = unicodeEmoji;
    }

    // Create hash for file naming (include avatarUrl and emoji in hash for uniqueness)
    const hashInput = `${finalEmoji}_${colorType}_${roleColors.join('_')}_${username}_${avatarUrl || 'default'}`;
    const hash = crypto.createHash('md5').update(hashInput).digest('hex').substring(0, 8);
    const filename = `${roleId}_${hash}.png`;
    const outputPath = path.join('src', 'discord', 'resources', 'roles', filename);

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Clean up old role files (older than 24 hours)
    await cleanupOldRoleFiles();

    // Check if file already exists
    try {
        await fs.access(outputPath);
        // console.log(`File already exists: ${outputPath}`);
        return { roleId, path: outputPath };
    } catch {
        // File doesn't exist, continue with generation
    }

    // Process emoji/icon
    const emojiInfo = await processRoleEmoji(roleId, finalEmoji, roleIcon);

    // Generate the image
    await generateImage(username, emojiInfo, roleColors, colorType, outputPath, avatarUrl);

    return { roleId, path: outputPath };
}

async function cleanupOldRoleFiles(): Promise<void> {
    try {
        const rolesDir = path.join('src', 'discord', 'resources', 'roles');

        // Ensure directory exists
        await fs.mkdir(rolesDir, { recursive: true });

        const files = await fs.readdir(rolesDir);
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        for (const file of files) {
            const filePath = path.join(rolesDir, file);

            try {
                const stats = await fs.stat(filePath);
                const fileAge = now - stats.mtime.getTime();

                if (fileAge > twentyFourHours) {
                    await fs.unlink(filePath);
                    // console.log(`Removed old role file (${Math.round(fileAge / (60 * 60 * 1000))}h old): ${filePath}`);
                }
            } catch (error) {
                console.warn(`Error checking file ${filePath}:`, error);
            }
        }
    } catch (error) {
        console.warn('Error cleaning up old role files:', error);
    }
}

async function downloadRoleIcon(roleId: string, iconHash: string): Promise<string | null> {
    try {
        // Discord role icon URL format
        const roleIconUrl = `https://cdn.discordapp.com/role-icons/${roleId}/${iconHash}.png`;

        // Create local path for the role icon in roles temp folder
        const iconPath = path.join('src', 'discord', 'resources', 'roles', 'temp', `role_icon_${iconHash}.png`);

        await fs.mkdir(path.dirname(iconPath), { recursive: true });

        // Check if icon already exists
        try {
            await fs.access(iconPath);
            // console.log(`Role icon already cached: ${iconPath}`);
            return iconPath;
        } catch {
            // File doesn't exist, continue with download
        }

        // console.log(`Downloading role icon from Discord: ${roleIconUrl}`);
        const response = await axios.get(roleIconUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Discord Bot)'
            }
        });

        await fs.writeFile(iconPath, response.data);
        // console.log(`Role icon downloaded successfully: ${iconPath}`);
        return iconPath;
    } catch (error) {
        console.warn(`Failed to download role icon:`, error);
        return null;
    }
}

function getUnicodeCodepoints(emoji: string): string[] {
    // Convert emoji to Unicode codepoints
    const codepoints: string[] = [];
    for (const char of emoji) {
        const codepoint = char.codePointAt(0);
        if (codepoint) {
            codepoints.push(codepoint.toString(16).toLowerCase());
        }
    }
    return codepoints;
}

async function downloadTwemojiSvg(emoji: string): Promise<string | null> {
    try {
        const codepoints = getUnicodeCodepoints(emoji);
        if (codepoints.length === 0) {
            return null;
        }

        // Twemoji uses the same format: codepoint1-codepoint2-etc.svg
        // twomoji actually seems to only need the first codepoint
        // const emojiId = codepoints.join('-');
        const emojiId = codepoints[0]
        // console.log(`Processing emoji codepoints: ${emojiId}`);

        // Twemoji CDN endpoint
        const twemojiUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${emojiId}.svg`;

        // Create local path for the emoji in roles temp folder
        const emojiHash = crypto.createHash('md5').update(emojiId).digest('hex').substring(0, 8);
        const emojiPath = path.join('src', 'discord', 'resources', 'roles', 'temp', `twemoji_${emojiHash}.svg`);

        await fs.mkdir(path.dirname(emojiPath), { recursive: true });

        // Check if emoji already exists
        try {
            await fs.access(emojiPath);
            // console.log(`Twemoji already cached: ${emojiPath}`);
            return emojiPath;
        } catch {
            // File doesn't exist, continue with download
        }

        // console.log(`Downloading Twemoji from: ${twemojiUrl}`);
        const response = await axios.get(twemojiUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Discord Bot)'
            }
        })

        await fs.writeFile(emojiPath, response.data);
        // console.log(`Twemoji downloaded successfully: ${emojiPath}`);
        return emojiPath;
    } catch (error) {
        console.warn(`Failed to download Twemoji for emoji "${emoji}":`, error);
        return null;
    }
}

async function processRoleEmoji(roleId: string, emoji: string, roleIcon?: string | null): Promise<EmojiInfo> {
    // Handle role icon (custom icon hash)
    if (roleIcon && emoji.startsWith('role_icon:')) {
        const iconPath = await downloadRoleIcon(roleId, roleIcon);
        if (iconPath) {
            return {
                isCustom: true,
                path: iconPath
            };
        }
        // If role icon download fails, fall through to other options
    }

    // Standard Unicode emoji - download from Twemoji
    if (emoji && !emoji.startsWith('role_icon:')) {
        const twemojiPath = await downloadTwemojiSvg(emoji);

        return {
            isCustom: false,
            path: twemojiPath || undefined,
            unicode: emoji
        };
    }

    // Return empty emoji info if no emoji available
    return {
        isCustom: false,
        unicode: undefined
    };
}

async function downloadAvatar(avatarUrl: string): Promise<string | null> {
    try {
        // Generate a unique filename based on the URL
        const urlHash = crypto.createHash('md5').update(avatarUrl).digest('hex').substring(0, 8);
        const extension = avatarUrl.includes('.gif') ? 'gif' : 'png';
        const avatarPath = path.join('src', 'discord', 'resources', 'roles', 'temp', `avatar_${urlHash}.${extension}`);

        await fs.mkdir(path.dirname(avatarPath), { recursive: true });

        // Check if avatar already exists
        try {
            await fs.access(avatarPath);
            // console.log(`Avatar already cached: ${avatarPath}`);
            return avatarPath;
        } catch {
            // File doesn't exist, continue with download
        }

        // console.log(`Downloading avatar from: ${avatarUrl}`);
        const response = await axios.get(avatarUrl, {
            responseType: 'arraybuffer',
            timeout: 10000, // 10 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Discord Bot)'
            }
        });

        await fs.writeFile(avatarPath, response.data);
        // console.log(`Avatar downloaded successfully: ${avatarPath}`);
        return avatarPath;
    } catch (error) {
        console.warn(`Failed to download avatar from ${avatarUrl}:`, error);
        return null;
    }
}

async function convertSvgToPng(svgPath: string, outputPath: string, size: number = 40): Promise<void> {
    try {
        // Convert SVG to PNG using ImageMagick with better quality settings
        const convertCommand = `convert -background transparent -density 300 -resize ${size}x${size} "${svgPath}" "${outputPath}"`;
        await execAsync(convertCommand);
        // console.log(`Converted SVG to PNG: ${outputPath}`);
    } catch (error) {
        console.warn(`Failed to convert SVG to PNG: ${error}`);
        throw error;
    }
}

async function generateImage(
    username: string,
    emojiInfo: EmojiInfo,
    roleColors: string[],
    colorType: string,
    outputPath: string,
    avatarUrl?: string
): Promise<void> {
    const width = 400;
    const height = 100;
    const avatarSize = 80;
    const padding = 12;

    const tempDir = path.join('src', 'discord', 'resources', 'roles', 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    // Create background
    const backgroundFile = path.join(tempDir, 'background.png');
    const backgroundCommand = `convert -size ${width}x${height} xc:"#36393f" "${backgroundFile}"`;
    await execAsync(backgroundCommand);

    // Create username text with role color
    const usernameColor = getUsernameColor(roleColors, colorType);
    const tempUsernameFile = path.join(tempDir, 'username.png');

    let usernameCommand: string;

    if (colorType === 'gradient' || colorType === 'holographic') {
        // First, create the text to measure its dimensions
        const textMaskCommand = `convert -background transparent -fill white -font Arial-Bold -pointsize 42 label:"${escapeForImageMagick(username)}" "${tempUsernameFile}"`;
        await execAsync(textMaskCommand);

        // Get the dimensions of the text
        const identifyCommand = `identify -format "%w %h" "${tempUsernameFile}"`;
        const { stdout: dimensions } = await execAsync(identifyCommand);
        const [textWidth, textHeight] = dimensions.trim().split(' ').map(Number);

        // Create gradient background that matches the text dimensions exactly
        const gradientColors = getGradientColors(roleColors, colorType);
        const gradientFile = path.join(tempDir, 'gradient.png');

        // Create diagonal gradient using ImageMagick's native diagonal gradient syntax
        // This creates a gradient from top-left to bottom-right covering the exact text dimensions
        const gradientCommand = `convert -size ${textWidth}x${textHeight} -define gradient:direction=northwest-southeast gradient:"${gradientColors[0]}-${gradientColors[1]}" "${gradientFile}"`;
        await execAsync(gradientCommand);

        // Apply gradient to text using the text as a mask
        const applyGradientCommand = `convert "${gradientFile}" "${tempUsernameFile}" -alpha off -compose copy_opacity -composite "${tempUsernameFile}"`;
        await execAsync(applyGradientCommand);
    } else {
        // Solid color text
        usernameCommand = `convert -background transparent -fill "${usernameColor}" -font Arial-Bold -pointsize 42 label:"${escapeForImageMagick(username)}" "${tempUsernameFile}"`;
        await execAsync(usernameCommand);
    }

    // Handle avatar - download if URL provided, otherwise create placeholder
    let avatarFile: string;
    if (avatarUrl) {
        const downloadedAvatar = await downloadAvatar(avatarUrl);
        if (downloadedAvatar) {
            // Process the downloaded avatar to make it circular and resize it
            avatarFile = path.join(tempDir, 'processed_avatar.png');

            // Create a circular mask and apply it to the avatar
            const maskFile = path.join(tempDir, 'avatar_mask.png');
            const createMaskCommand = `convert -size ${avatarSize}x${avatarSize} xc:transparent -fill white -draw "circle ${avatarSize / 2},${avatarSize / 2} ${avatarSize / 2},0" "${maskFile}"`;
            await execAsync(createMaskCommand);

            // Resize and apply circular mask to the downloaded avatar
            const processAvatarCommand = `convert "${downloadedAvatar}" -resize ${avatarSize}x${avatarSize}^ -gravity center -extent ${avatarSize}x${avatarSize} "${maskFile}" -alpha off -compose copy_opacity -composite "${avatarFile}"`;
            await execAsync(processAvatarCommand);
        } else {
            // Fallback to placeholder if download failed
            avatarFile = await createAvatarPlaceholder(avatarSize, tempDir);
        }
    } else {
        // Create placeholder avatar
        avatarFile = await createAvatarPlaceholder(avatarSize, tempDir);
    }

    // Prepare emoji
    let emojiFile = '';
    if (emojiInfo.path) {
        // We have either a role icon or downloaded SVG
        if (emojiInfo.path.endsWith('.svg')) {
            // Convert SVG to PNG with better quality
            emojiFile = path.join(tempDir, 'emoji_converted.png');
            try {
                await convertSvgToPng(emojiInfo.path, emojiFile, 40);
            } catch (error) {
                console.warn('Failed to convert emoji SVG to PNG, skipping emoji');
                emojiFile = '';
            }
        } else {
            // Use the emoji/icon file directly (PNG/GIF)
            // Resize to ensure consistent size
            emojiFile = path.join(tempDir, 'emoji_resized.png');
            const resizeCommand = `convert "${emojiInfo.path}" -resize 40x40 "${emojiFile}"`;
            try {
                await execAsync(resizeCommand);
            } catch (error) {
                console.warn('Failed to resize emoji, using original');
                emojiFile = emojiInfo.path;
            }
        }
    } else {
        console.warn('No emoji/icon file available, skipping in output');
    }

    // Start composing the final image - use explicit canvas sizing
    let currentImage = backgroundFile;

    // Add avatar
    const withAvatarFile = path.join(tempDir, 'with_avatar.png');
    const avatarComposeCommand = `convert "${currentImage}" "${avatarFile}" -geometry +${padding}+${padding} -composite -gravity northwest -extent ${width}x${height} "${withAvatarFile}"`;
    await execAsync(avatarComposeCommand);
    currentImage = withAvatarFile;

    // Add username - better positioning
    const withUsernameFile = path.join(tempDir, 'with_username.png');
    const usernameX = padding + avatarSize + 24;
    const usernameY = padding - 2; // Align closer to top like Discord
    const usernameComposeCommand = `convert "${currentImage}" "${tempUsernameFile}" -geometry +${usernameX}+${usernameY} -composite -gravity northwest -extent ${width}x${height} "${withUsernameFile}"`;
    await execAsync(usernameComposeCommand);
    currentImage = withUsernameFile;

    // Add emoji/icon if available - position it next to the username
    if (emojiFile) {
        // Get username width to position emoji correctly
        const identifyUsernameCommand = `identify -format "%w" "${tempUsernameFile}"`;
        const { stdout: usernameWidth } = await execAsync(identifyUsernameCommand);
        const emojiX = usernameX + parseInt(usernameWidth.trim()) + 8; // Small gap after username
        const emojiY = padding + 2; // Same height as username

        const withEmojiFile = path.join(tempDir, 'with_emoji.png');
        const emojiComposeCommand = `convert "${currentImage}" "${emojiFile}" -geometry +${emojiX}+${emojiY} -composite -gravity northwest -extent ${width}x${height} "${withEmojiFile}"`;
        await execAsync(emojiComposeCommand);
        currentImage = withEmojiFile;
    }

    // Add message text - position below username like Discord
    const messageText = "I am Cirno Freezer";
    const messageX = usernameX;
    const messageY = padding + 45; // Below the username with more space for larger text
    const finalComposeCommand = `convert "${currentImage}" -fill "#dcddde" -font Arial -pointsize 28 -gravity northwest -annotate +${messageX}+${messageY} "${escapeForImageMagick(messageText)}" -extent ${width}x${height} "${outputPath}"`;
    await execAsync(finalComposeCommand);

    // Clean up temporary files
    try {
        const tempFiles = await fs.readdir(tempDir);
        for (const file of tempFiles) {
            if ((file.endsWith('.png') || file.endsWith('.gif') || file.endsWith('.svg')) &&
                !file.startsWith('role_icon_') && !file.startsWith('twemoji_') && !file.startsWith('avatar_')) {
                await fs.unlink(path.join(tempDir, file));
            }
        }
    } catch (error) {
        console.warn('Error cleaning up temp files:', error);
    }

    // console.log(`Generated Discord role preview: ${outputPath}`);
}

async function createAvatarPlaceholder(avatarSize: number, tempDir: string): Promise<string> {
    const avatarFile = path.join(tempDir, 'avatar_placeholder.png');
    const avatarCommand = `convert -size ${avatarSize}x${avatarSize} xc:transparent -fill "#7289da" -draw "circle ${avatarSize / 2},${avatarSize / 2} ${avatarSize / 2},0" "${avatarFile}"`;
    await execAsync(avatarCommand);
    return avatarFile;
}

function escapeForImageMagick(text: string): string {
    // Escape special characters for ImageMagick
    return text.replace(/["\\]/g, '\\$&').replace(/'/g, "\\'");
}

function getUsernameColor(roleColors: string[], colorType: string): string {
    if (colorType === 'solid') {
        return roleColors[0] || '#ffffff';
    }
    // For gradient and holographic, we'll use the first color for fallback
    return roleColors[0] || '#ffffff';
}

function getGradientColors(roleColors: string[], colorType: string): string[] {
    if (colorType === 'holographic') {
        return ['#ffc3a0', '#a9c9ff'];
    }

    if (colorType === 'gradient') {
        return roleColors.length >= 2 ? [roleColors[0], roleColors[1]] : [roleColors[0] || '#ffffff', '#ffffff'];
    }

    return [roleColors[0] || '#ffffff', roleColors[0] || '#ffffff'];
}

// Helper function to create options from Discord role data
export function createRolePreviewOptionsFromDiscordRole(
    roleData: any,
    username: string,
    colorType: string = 'solid',
    avatarUrl?: string
): RolePreviewOptions {
    // Extract colors from role data
    const roleColors: string[] = [];

    if (roleData.colors?.primary_color) {
        roleColors.push(`#${roleData.colors.primary_color.toString(16).padStart(6, '0')}`);
    } else if (roleData.color && roleData.color !== 0) {
        roleColors.push(`#${roleData.color.toString(16).padStart(6, '0')}`);
    }

    if (roleData.colors?.secondary_color) {
        roleColors.push(`#${roleData.colors.secondary_color.toString(16).padStart(6, '0')}`);
    }

    // Default to white if no colors found
    if (roleColors.length === 0) {
        roleColors.push('#ffffff');
    }

    return {
        roleId: roleData.id,
        roleColors,
        colorType,
        username,
        roleIcon: roleData.icon,
        unicodeEmoji: roleData.unicode_emoji,
        avatarUrl
    };
}


