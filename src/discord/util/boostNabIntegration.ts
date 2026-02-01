// util/boostNabIntegration.ts
import { boost_model } from '../models/boosts';
import { PinnedNumberModel, UserNumberAssignmentModel } from '../models/nab';
import { Guild } from 'discord.js';

/**
 * Get users who stopped boosting and might need nickname reverts
 * This is for notification purposes only - admins decide whether to revert
 */
export async function getUsersNeedingNicknameReview(guildId: string, guild: Guild): Promise<Array<{
    userId: string;
    currentNickname: string | null;
    nicknameBeforeBoost: string | null;
    nicknameDuringBoost: string | null;
    boostEndDate: Date | null;
    hasChanged: boolean;
}>> {
    try {
        const results: Array<{
            userId: string;
            currentNickname: string | null;
            nicknameBeforeBoost: string | null;
            nicknameDuringBoost: string | null;
            boostEndDate: Date | null;
            hasChanged: boolean;
        }> = [];

        // Get all inactive boosts for this guild
        const inactiveBoosts = await boost_model.find({
            guild_id: guildId,
            is_active: false
        }).sort({ boost_end: -1 });

        // Group by user and get most recent
        const userBoostMap = new Map<string, typeof inactiveBoosts[0]>();
        for (const boost of inactiveBoosts) {
            if (!userBoostMap.has(boost.user_id)) {
                userBoostMap.set(boost.user_id, boost);
            }
        }

        for (const [userId, boost] of userBoostMap) {
            // Check if user is currently boosting
            let member;
            try {
                member = await guild.members.fetch(userId);
            } catch (error) {
                // User left server
                continue;
            }

            // Skip if currently boosting
            if (member.premiumSince !== null) {
                continue;
            }

            const currentNickname = member.nickname;
            const hasChanged = currentNickname !== boost.nickname_during_boost;

            results.push({
                userId,
                currentNickname,
                nicknameBeforeBoost: boost.nickname_before_boost,
                nicknameDuringBoost: boost.nickname_during_boost,
                boostEndDate: boost.boost_end,
                hasChanged
            });
        }

        return results;
    } catch (error) {
        console.error('[BoostNickname] Error getting users needing review:', error);
        return [];
    }
}

/**
 * Get boost and nickname information for a user
 */
export async function getUserBoostNicknameInfo(userId: string, guildId: string): Promise<{
    isBoosting: boolean;
    currentNumber: number | null;
    isPinned: boolean;
    activeBoostCount: number;
    totalBoostCount: number;
    mostRecentBoost: {
        isActive: boolean;
        nicknameBeforeBoost: string | null;
        nicknameDuringBoost: string | null;
        boostStart: Date;
        boostEnd: Date | null;
    } | null;
}> {
    try {
        // Check NAB number
        const pinnedNumber = await PinnedNumberModel.findOne({ guildId, userId });
        const assignment = await UserNumberAssignmentModel.findOne({ guildId, userId });
        const currentNumber = pinnedNumber?.number || assignment?.number || null;
        const isPinned = pinnedNumber !== null;

        // Check boost status
        const activeBoosts = await boost_model.countDocuments({
            guild_id: guildId,
            user_id: userId,
            is_active: true
        });

        const totalBoosts = await boost_model.countDocuments({
            guild_id: guildId,
            user_id: userId
        });

        // Get most recent boost
        const recentBoost = await boost_model.findOne({
            guild_id: guildId,
            user_id: userId
        }).sort({ boost_start: -1 });

        return {
            isBoosting: activeBoosts > 0,
            currentNumber,
            isPinned,
            activeBoostCount: activeBoosts,
            totalBoostCount: totalBoosts,
            mostRecentBoost: recentBoost ? {
                isActive: recentBoost.is_active,
                nicknameBeforeBoost: recentBoost.nickname_before_boost,
                nicknameDuringBoost: recentBoost.nickname_during_boost,
                boostStart: recentBoost.boost_start,
                boostEnd: recentBoost.boost_end
            } : null
        };
    } catch (error) {
        console.error('[BoostNickname] Error getting user boost info:', error);
        return {
            isBoosting: false,
            currentNumber: null,
            isPinned: false,
            activeBoostCount: 0,
            totalBoostCount: 0,
            mostRecentBoost: null
        };
    }
}
