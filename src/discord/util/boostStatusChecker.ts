// util/boostStatusChecker.ts
import { Client } from 'discord.js';
import { boost_model } from '../models/boosts';
import { pooled_boost_model, pool_model } from '../models/pools';
import { getBoostLogger } from './boostLogger';
import { memberBulkFetch } from './member-fetch-wrapper';

/**
 * Scheduled task to check boost status and catch any missed events
 * This runs periodically to ensure the database stays in sync with Discord
 */
export class BoostStatusChecker {
    private client: Client;
    private checkInterval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Start the scheduled checker
     * @param intervalMinutes How often to run the check (default: 30 minutes)
     */
    start(intervalMinutes: number = 1440): void {
        if (this.checkInterval) {
            console.log('Boost status checker is already running');
            return;
        }

        const intervalMs = intervalMinutes * 60 * 1000;

        // Run immediately on start (silently)
        this.runCheck(true);

        // Then schedule regular checks
        this.checkInterval = setInterval(() => {
            this.runCheck();
        }, intervalMs);

        console.log(`Boost status checker started (every ${intervalMinutes} minutes)`);
    }

    /**
     * Stop the scheduled checker
     */
    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('Boost status checker stopped');
        }
    }

    /**
     * Run a single check cycle
     */
    private async runCheck(silent: boolean = false): Promise<void> {
        if (this.isRunning) {
            console.log('Boost check already in progress, skipping this cycle');
            return;
        }

        this.isRunning = true;
    }

    /**
     * Check boost status for a specific guild
     */
    private async checkGuildBoosts(guildId: string): Promise<void> {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return;

        // Fetch all members to ensure we have latest data
        await memberBulkFetch(guild);

        const logger = getBoostLogger(this.client);
        const summary = {
            fixedBoosts: 0,
            fixedUnboosts: 0,
            errors: 0,
            timestamp: new Date()
        };

        // Get actual boosters from Discord
        const actualBoosters = guild.members.cache.filter(member => member.premiumSince !== null);
        const actualBoosterIds = new Set(actualBoosters.map(m => m.id));

        // Get active boosts from database for this guild
        const dbActiveBoosts = await boost_model.find({
            guild_id: guildId,
            is_active: true
        });
        const dbBoosterIds = new Set(dbActiveBoosts.map(b => b.user_id));

        // Check for users boosting but not in database
        for (const [userId, member] of actualBoosters) {
            if (!dbBoosterIds.has(userId)) {
                try {
                    console.log(`[BoostChecker] ${member.user.tag} is boosting but not tracked - adding`);

                    const currentNickname = member.nickname || member.user.username;

                    // Create boost record
                    await boost_model.create({
                        guild_id: guildId,
                        user_id: userId,
                        boost_start: member.premiumSince || new Date(),
                        boost_end: null,
                        nickname_before_boost: currentNickname,
                        nickname_during_boost: null,
                        is_active: true
                    });

                    // Log the discrepancy
                    await logger.logDiscrepancy(
                        guildId,
                        userId,
                        'User is boosting but not tracked in database',
                        'Created boost record'
                    );

                    summary.fixedBoosts++;
                } catch (error) {
                    console.error(`[BoostChecker] Failed to add boost for ${userId}:`, error);
                    summary.errors++;
                }
            }
        }

        // Check for users in database but not actually boosting
        for (const boost of dbActiveBoosts) {
            if (!actualBoosterIds.has(boost.user_id)) {
                try {
                    const member = await guild.members.fetch(boost.user_id).catch(() => null);
                    const userTag = member?.user.tag || boost.user_id;

                    console.log(`[BoostChecker] ${userTag} tracked as boosting but is not - ending boost`);

                    // End the boost
                    boost.boost_end = new Date();
                    boost.is_active = false;
                    if (member) {
                        boost.nickname_during_boost = member.nickname || member.user.username;
                    }
                    await boost.save();

                    // Log the discrepancy
                    await logger.logDiscrepancy(
                        guildId,
                        boost.user_id,
                        'User tracked as boosting but is not',
                        'Ended boost record'
                    );

                    summary.fixedUnboosts++;
                } catch (error) {
                    console.error(`[BoostChecker] Failed to end boost for ${boost.user_id}:`, error);
                    summary.errors++;
                }
            }
        }

        // Check pooled boosts if this guild is in a pool
        await this.checkPooledBoosts(guildId, actualBoosterIds, logger, summary);

        // Log summary if anything was fixed
        if (summary.fixedBoosts > 0 || summary.fixedUnboosts > 0 || summary.errors > 0) {
            await logger.logCheckerSummary(guildId, summary);
        }
    }

    /**
     * Check pooled boost status for a guild
     */
    private async checkPooledBoosts(
        guildId: string,
        actualBoosterIds: Set<string>,
        logger: any,
        summary: any
    ): Promise<void> {
        const pool = await pool_model.findOne({
            'servers.guild_id': guildId,
            is_active: true
        });

        if (!pool) return; // Guild not in a pool

        // Get active pooled boosts for this guild (non-auxiliary)
        const dbPooledBoosts = await pooled_boost_model.find({
            guild_id: guildId,
            is_active: true,
            is_auxiliary_boost: false
        });

        const dbPooledBoosterIds = new Set(dbPooledBoosts.map(b => b.user_id));

        // Check for users boosting but not in pooled database
        for (const userId of actualBoosterIds) {
            if (!dbPooledBoosterIds.has(userId)) {
                try {
                    console.log(`[BoostChecker] User ${userId} boosting ${guildId} but not in pool tracking - adding`);

                    await pooled_boost_model.create({
                        user_id: userId,
                        guild_id: guildId,
                        pool_id: pool.pool_id,
                        boost_start: new Date(),
                        boost_end: null,
                        is_active: true,
                        is_auxiliary_boost: false
                    });

                    await logger.logDiscrepancy(
                        guildId,
                        userId,
                        'User boosting in pool but not tracked',
                        'Created pooled boost record'
                    );

                    summary.fixedBoosts++;
                } catch (error) {
                    console.error(`[BoostChecker] Failed to add pooled boost for ${userId}:`, error);
                    summary.errors++;
                }
            }
        }

        // Check for users in pooled database but not actually boosting
        for (const boost of dbPooledBoosts) {
            if (!actualBoosterIds.has(boost.user_id)) {
                try {
                    console.log(`[BoostChecker] User ${boost.user_id} in pool tracking but not boosting - ending`);

                    await pooled_boost_model.updateMany(
                        {
                            user_id: boost.user_id,
                            guild_id: guildId,
                            is_active: true,
                            is_auxiliary_boost: false
                        },
                        {
                            boost_end: new Date(),
                            is_active: false
                        }
                    );

                    await logger.logDiscrepancy(
                        guildId,
                        boost.user_id,
                        'User in pool tracking but not boosting',
                        'Ended pooled boost record'
                    );

                    summary.fixedUnboosts++;
                } catch (error) {
                    console.error(`[BoostChecker] Failed to end pooled boost for ${boost.user_id}:`, error);
                    summary.errors++;
                }
            }
        }
    }

    /**
     * Manually trigger a check (useful for testing or on-demand validation)
     */
    async triggerCheck(): Promise<void> {
        console.log('[BoostChecker] Manual check triggered');
        await this.runCheck();
    }
}

// Global instance
let checkerInstance: BoostStatusChecker | null = null;

/**
 * Initialize the boost status checker
 */
export function initBoostStatusChecker(client: Client, intervalMinutes: number = 30): BoostStatusChecker {
    if (checkerInstance) {
        console.log('Boost status checker already initialized');
        return checkerInstance;
    }

    checkerInstance = new BoostStatusChecker(client);
    checkerInstance.start(intervalMinutes);
    return checkerInstance;
}

/**
 * Get the boost status checker instance
 */
export function getBoostStatusChecker(): BoostStatusChecker | null {
    return checkerInstance;
}

/**
 * Stop the boost status checker
 */
export function stopBoostStatusChecker(): void {
    if (checkerInstance) {
        checkerInstance.stop();
        checkerInstance = null;
    }
}
