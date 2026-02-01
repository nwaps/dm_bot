import { Guild, Collection, GuildMember } from 'discord.js';
import { MemberCacheManager } from './member-cache-manager';

const cacheManager = MemberCacheManager.getInstance();

export interface BulkFetchOptions {
    force?: boolean;
    required?: boolean; // Must fetch all members (for NAB operations)
}

const FETCH_TIMEOUT_DEFAULT = 60000; // 60 seconds
const FETCH_TIMEOUT_LARGE_GUILD = 180000; // 3 minutes for guilds > 5000 members
const LARGE_GUILD_THRESHOLD = 5000;
const MAX_WAIT_FOR_FETCH = 180000; // Max 3 minutes to wait for in-progress fetch

/**
 * Helper function to wait for an in-progress fetch to complete
 */
async function waitForFetchCompletion(guildId: string, maxWaitMs: number): Promise<boolean> {
    const startTime = Date.now();
    while (cacheManager.isFetchInProgress(guildId)) {
        if (Date.now() - startTime > maxWaitMs) {
            return false; // Timeout
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
    }
    return true; // Completed
}

/**
 * Wrapper for guild.members.fetch() that implements TTL-based caching
 * to prevent excessive API calls and Discord rate limiting.
 *
 * @param guild The Discord guild to fetch members from
 * @param options Optional configuration
 *   - force: Ignore TTL and force fetch
 *   - required: Must fetch all members (for NAB operations). Throws error on timeout.
 * @returns Collection of guild members
 */
export async function memberBulkFetch(
    guild: Guild,
    options: BulkFetchOptions = {}
): Promise<Collection<string, GuildMember>> {
    const guildId = guild.id;
    const isRequired = options.required || false;

    try {
        // Check if we should fetch based on TTL
        const shouldFetch = options.force || cacheManager.shouldBulkFetch(guildId);

        if (!shouldFetch) {
            // Cache is still valid, return cached collection
            cacheManager.recordCacheHit(guildId);
            return guild.members.cache;
        }

        // Check rate limiting
        const canFetch = cacheManager.canFetch(guildId);
        if (!canFetch.allowed) {
            console.warn(`[Member Cache] Rate limit block for guild ${guildId}: ${canFetch.reason}`);

            // If required, wait for in-progress fetch to complete
            if (isRequired && cacheManager.isFetchInProgress(guildId)) {
                console.log(`[Member Cache] Required fetch waiting for in-progress fetch to complete...`);
                const completed = await waitForFetchCompletion(guildId, MAX_WAIT_FOR_FETCH);
                if (completed) {
                    console.log(`[Member Cache] In-progress fetch completed, returning cache`);
                    return guild.members.cache;
                } else {
                    console.warn(`[Member Cache] Wait timeout for guild ${guildId}`);
                }
            }

            // For best-effort or if wait failed, return cached collection
            return guild.members.cache;
        }

        // Perform bulk fetch
        cacheManager.recordCacheMiss(guildId);
        cacheManager.markBulkFetchStart(guildId);

        // Determine timeout based on guild size
        const cachedSize = guild.members.cache.size;
        const isLargeGuild = cachedSize > LARGE_GUILD_THRESHOLD;
        const timeout = isLargeGuild ? FETCH_TIMEOUT_LARGE_GUILD : FETCH_TIMEOUT_DEFAULT;

        let members: Collection<string, GuildMember>;

        try {
            const startTime = Date.now();
            members = await guild.members.fetch({ time: timeout });
            const fetchDuration = Date.now() - startTime;

            cacheManager.recordBulkFetch(guildId, members.size);
            console.log(`[Member Cache] Fetched ${members.size} members for guild ${guildId} in ${(fetchDuration / 1000).toFixed(1)}s (required: ${isRequired})`);
            return members;
        } catch (fetchError: any) {
            // Always clear the in-progress flag
            cacheManager.clearFetchInProgress(guildId);

            if (fetchError.code === 'GuildMembersTimeout') {
                console.warn(`[Member Cache] Timeout fetching members for guild ${guildId} (${timeout}ms)`);

                if (isRequired) {
                    // For required fetches (NAB operations), throw a helpful error
                    throw new Error(`Unable to fetch all guild members - the guild is too large and the request timed out after ${timeout / 1000} seconds. Please try again in a few minutes when Discord's servers are less busy.`);
                } else {
                    // For best-effort fetches, return partial cache
                    console.log(`[Member Cache] Timeout - using partial cache for guild ${guildId} (${guild.members.cache.size} members)`);
                    return guild.members.cache;
                }
            }

            // Other errors - rethrow
            throw fetchError;
        }

    } catch (error: any) {
        // Ensure in-progress flag is always cleared
        cacheManager.clearFetchInProgress(guildId);

        console.error(`[Member Cache] Error fetching members for guild ${guildId}:`, error);

        // If it's our helpful error message, rethrow it
        if (error.message && error.message.includes('Unable to fetch all guild members')) {
            throw error;
        }

        // For other errors, return cache if available
        if (guild.members.cache.size > 0) {
            console.warn(`[Member Cache] Returning cached members due to error`);
            return guild.members.cache;
        }

        // Last resort: rethrow
        throw error;
    }
}

/**
 * Wrapper for individual member fetch (Phase 2 - not yet implemented)
 * Placeholder for future implementation.
 */
export async function memberFetch(
    guild: Guild,
    userId: string
): Promise<GuildMember | null> {
    // Phase 2: Will implement individual member caching
    // For now, use Discord.js built-in cache check pattern
    try {
        return guild.members.cache.get(userId) ?? await guild.members.fetch(userId);
    } catch (error) {
        return null;
    }
}
