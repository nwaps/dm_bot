// util/boostDashboardBuilder.ts
import { Client, Guild, EmbedBuilder } from 'discord.js';
import { boost_model } from '../models/boosts';
import { pool_model, pooled_boost_model } from '../models/pools';
import { getUsersNeedingNicknameReview } from './boostNabIntegration';
import { memberBulkFetch } from './member-fetch-wrapper';

export interface DashboardData {
    activeBoosters: Array<{
        userId: string;
        username: string;
        nickname: string;
        boostStart: Date;
        nabNumber: number | null;
        poolName: string | null;
        isAuxiliary: boolean;
    }>;
    needsNicknameReview: Array<{
        userId: string;
        username: string;
        currentNickname: string;
        nicknameBeforeBoost: string;
        nicknameDuringBoost: string;
        boostEndDate: Date | null;
        hasChanged: boolean;
    }>;
    stats: {
        totalBoosters: number;
        directBoosters: number;
        auxiliaryBoosters: number;
        boostersWithNab: number;
        needsReview: number;
        isInPool: boolean;
        poolName: string | null;
    };
}

export class BoostDashboardBuilder {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Build comprehensive dashboard data for a guild
     */
    async buildDashboardData(guild: Guild): Promise<DashboardData> {
        const data: DashboardData = {
            activeBoosters: [],
            needsNicknameReview: [],
            stats: {
                totalBoosters: 0,
                directBoosters: 0,
                auxiliaryBoosters: 0,
                boostersWithNab: 0,
                needsReview: 0,
                isInPool: false,
                poolName: null
            }
        };

        // Check if guild is in a pool
        const pool = await pool_model.findOne({
            'servers.guild_id': guild.id,
            is_active: true
        });

        if (pool) {
            data.stats.isInPool = true;
            data.stats.poolName = pool.pool_name;
        }

        // Get all active boosters
        await memberBulkFetch(guild);
        const actualBoosters = guild.members.cache.filter(member => member.premiumSince !== null);

        // Get pooled boost info if in a pool
        let pooledBoosts: any[] = [];
        if (pool) {
            pooledBoosts = await pooled_boost_model.find({
                guild_id: guild.id,
                is_active: true
            });
        }

        // Batch fetch all NAB assignments for the guild
        const { UserNumberAssignmentModel, PinnedNumberModel } = await import('../models/nab');
        const allAssignments = await UserNumberAssignmentModel.find({ guildId: guild.id });
        const allPinnedNumbers = await PinnedNumberModel.find({ guildId: guild.id });

        const assignmentMap = new Map(allAssignments.map(a => [a.userId, a]));
        const pinnedMap = new Map(allPinnedNumbers.map(p => [p.userId, p]));

        // Process active boosters
        for (const [userId, member] of actualBoosters) {
            const pooledBoost = pooledBoosts.find(b => b.user_id === userId);
            const isAuxiliary = pooledBoost?.is_auxiliary_boost || false;

            // Check NAB info from cached data
            const assignment = assignmentMap.get(userId);
            const pinnedNumber = pinnedMap.get(userId);
            const nabNumber = pinnedNumber?.number || assignment?.number || null;

            data.activeBoosters.push({
                userId,
                username: member.user.tag,
                nickname: member.nickname || member.user.username,
                boostStart: member.premiumSince || new Date(),
                nabNumber,
                poolName: pool?.pool_name || null,
                isAuxiliary
            });

            if (nabNumber) {
                data.stats.boostersWithNab++;
            }

            if (isAuxiliary) {
                data.stats.auxiliaryBoosters++;
            } else {
                data.stats.directBoosters++;
            }
        }

        data.stats.totalBoosters = data.activeBoosters.length;

        // Get users who stopped boosting and might need nickname review
        const nicknameReviews = await getUsersNeedingNicknameReview(guild.id, guild);

        for (const review of nicknameReviews) {
            try {
                const member = await guild.members.fetch(review.userId);
                data.needsNicknameReview.push({
                    userId: review.userId,
                    username: member.user.tag,
                    currentNickname: review.currentNickname || member.user.username,
                    nicknameBeforeBoost: review.nicknameBeforeBoost || member.user.username,
                    nicknameDuringBoost: review.nicknameDuringBoost || member.user.username,
                    boostEndDate: review.boostEndDate,
                    hasChanged: review.hasChanged
                });
            } catch (error) {
                // User left server
                continue;
            }
        }

        data.stats.needsReview = data.needsNicknameReview.length;

        return data;
    }

    /**
     * Build embeds from dashboard data
     */
    buildDashboardEmbeds(data: DashboardData): EmbedBuilder[] {
        const embeds: EmbedBuilder[] = [];

        // Main stats embed
        const statsEmbed = new EmbedBuilder()
            .setTitle('Boost Dashboard')
            .setColor(data.stats.needsReview > 0 ? 0xFFFF00 : 0x00FF00)
            .setTimestamp();

        const statsFields: string[] = [
            `**Total Boosters:** ${data.stats.totalBoosters}`,
            `**Direct Boosts:** ${data.stats.directBoosters}`,
        ];

        if (data.stats.isInPool) {
            statsFields.push(`**Auxiliary Boosts:** ${data.stats.auxiliaryBoosters}`);
            statsFields.push(`**Pool:** ${data.stats.poolName}`);
        }

        statsFields.push(`**With NAB Numbers:** ${data.stats.boostersWithNab}`);
        statsFields.push('');

        if (data.stats.needsReview > 0) {
            statsFields.push('**⚠️ Nickname Review:**');
            statsFields.push(`${data.stats.needsReview} users stopped boosting`);
        } else {
            statsFields.push('✅ No users needing review');
        }

        statsEmbed.setDescription(statsFields.join('\n'));

        embeds.push(statsEmbed);

        // Active boosters embed (if any)
        if (data.activeBoosters.length > 0) {
            const boostersEmbed = new EmbedBuilder()
                .setTitle(`Active Boosters (${data.activeBoosters.length})`)
                .setColor(0x00FF00)
                .setTimestamp();

            const boosterLines: string[] = [];

            // Show up to 15 boosters
            const displayBoosters = data.activeBoosters.slice(0, 15);

            for (const booster of displayBoosters) {
                const nabStatus = booster.nabNumber ? ` [#${booster.nabNumber}]` : '';
                const typeStatus = booster.isAuxiliary ? ' (auxiliary)' : '';
                const timestamp = Math.floor(booster.boostStart.getTime() / 1000);

                boosterLines.push(`<@${booster.userId}>${nabStatus}${typeStatus} - <t:${timestamp}:R>`);
            }

            if (data.activeBoosters.length > 15) {
                boosterLines.push(`\n... and ${data.activeBoosters.length - 15} more`);
            }

            boostersEmbed.setDescription(boosterLines.join('\n'));
            embeds.push(boostersEmbed);
        }

        // Users needing nickname review
        if (data.needsNicknameReview.length > 0) {
            const reviewEmbed = new EmbedBuilder()
                .setTitle(`⚠️ Nickname Review Needed (${data.needsNicknameReview.length})`)
                .setColor(0xFF9900)
                .setTimestamp();

            const reviewLines: string[] = [];

            // Show up to 10
            const displayReviews = data.needsNicknameReview.slice(0, 10);

            for (const user of displayReviews) {
                const timestamp = user.boostEndDate
                    ? `stopped <t:${Math.floor(user.boostEndDate.getTime() / 1000)}:R>`
                    : 'stopped recently';

                const nickInfo = user.hasChanged
                    ? `\`${user.nicknameDuringBoost}\` → \`${user.currentNickname}\``
                    : `\`${user.nicknameDuringBoost}\` (unchanged)`;

                reviewLines.push(`<@${user.userId}> - ${nickInfo} - ${timestamp}`);
                if (user.nicknameBeforeBoost && user.nicknameBeforeBoost !== user.nicknameDuringBoost) {
                    reviewLines.push(`  ↳ Original: \`${user.nicknameBeforeBoost}\``);
                }
            }

            if (data.needsNicknameReview.length > 10) {
                reviewLines.push(`\n... and ${data.needsNicknameReview.length - 10} more`);
            }

            reviewLines.push('');
            reviewLines.push('Manually review and revert nicknames as needed');

            reviewEmbed.setDescription(reviewLines.join('\n'));
            embeds.push(reviewEmbed);
        }

        return embeds;
    }

    /**
     * Build complete dashboard (data + embeds)
     */
    async buildCompleteDashboard(guild: Guild): Promise<{
        data: DashboardData;
        embeds: EmbedBuilder[];
    }> {
        const data = await this.buildDashboardData(guild);
        const embeds = this.buildDashboardEmbeds(data);

        return { data, embeds };
    }
}

/**
 * Helper function to get a dashboard builder instance
 */
export function getBoostDashboardBuilder(client: Client): BoostDashboardBuilder {
    return new BoostDashboardBuilder(client);
}
