// src/discord/events/GuildMemberUpdate_pooledBoost.ts

import { Client, Events, GuildMember } from 'discord.js';
import { boost_model } from '../models/boosts';
import { pooled_boost_model, pool_model } from '../models/pools';
import { PoolManager } from '../util/pool';
import { getBoostLogger } from '../util/boostLogger';

export default {
    name: Events.GuildMemberUpdate,
    async execute(client: Client, oldMember: GuildMember, newMember: GuildMember) {
        const wasBooster = oldMember.premiumSince !== null;
        const isBooster = newMember.premiumSince !== null;

        if (wasBooster === isBooster) return;

        try {
            const poolManager = new PoolManager(client);
            const boostLogger = getBoostLogger(client);

            if (!wasBooster && isBooster) {
                console.log(`${newMember.user.tag} started boosting ${newMember.guild.name}`);

                // Handle legacy boost tracking (keep existing functionality)
                const currentNickname = newMember.nickname || newMember.user.username;
                await boost_model.create({
                    guild_id: newMember.guild.id,
                    user_id: newMember.id,
                    boost_start: new Date(),
                    boost_end: null,
                    nickname_before_boost: currentNickname,
                    nickname_during_boost: null,
                    is_active: true
                });

                // Handle pooled boost tracking
                await poolManager.handleBoostStart(newMember.id, newMember.guild.id);

                // Log the boost start event
                const pool = await pool_model.findOne({
                    'servers.guild_id': newMember.guild.id,
                    is_active: true
                });

                await boostLogger.logBoostEvent({
                    userId: newMember.id,
                    guildId: newMember.guild.id,
                    type: 'boost_start',
                    timestamp: new Date(),
                    nickname: currentNickname,
                    poolInfo: pool ? {
                        poolId: pool.pool_id,
                        poolName: pool.pool_name,
                        isAuxiliary: false
                    } : undefined
                });

            } else if (wasBooster && !isBooster) {
                console.log(`${newMember.user.tag} stopped boosting ${newMember.guild.name}`);

                // Handle legacy boost tracking
                const activeBoost = await boost_model.findOne({
                    guild_id: newMember.guild.id,
                    user_id: newMember.id,
                    is_active: true
                });

                const currentNickname = newMember.nickname || newMember.user.username;

                if (activeBoost) {
                    activeBoost.nickname_during_boost = currentNickname;
                    activeBoost.boost_end = new Date();
                    activeBoost.is_active = false;
                    await activeBoost.save();
                }

                // Handle pooled boost tracking
                await poolManager.handleBoostEnd(newMember.id, newMember.guild.id);

                // Log the boost end event
                const pool = await pool_model.findOne({
                    'servers.guild_id': newMember.guild.id,
                    is_active: true
                });

                await boostLogger.logBoostEvent({
                    userId: newMember.id,
                    guildId: newMember.guild.id,
                    type: 'boost_end',
                    timestamp: new Date(),
                    nickname: currentNickname,
                    poolInfo: pool ? {
                        poolId: pool.pool_id,
                        poolName: pool.pool_name,
                        isAuxiliary: false
                    } : undefined
                });
            }
        } catch (error) {
            console.error('Error tracking boost status:', error);
        }
    },
};