// src/discord/util/pool.ts

import { Client, Guild, Role, GuildMember } from 'discord.js';
import { pool_model, BoostPool, PoolServer, pooled_boost_model, BoostPoolDocument } from '../models/pools';
import { randomUUID } from 'crypto';
import { getBoostLogger } from './boostLogger';
import { memberBulkFetch } from './member-fetch-wrapper';

export class PoolManager {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Create a new boost pool with the current server as lead
     */
    async createPool(guildId: string, poolName: string, createdBy: string, targetBoostCount: number = 20): Promise<string> {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) throw new Error('Guild not found');

        const poolId = randomUUID();

        const leadServer: PoolServer = {
            guild_id: guildId,
            guild_name: guild.name,
            target_boost_count: targetBoostCount,
            current_boost_count: await this.getCurrentBoostCount(guildId),
            auxiliary_boost_count: 0,
            is_lead_server: true,
            joined_at: new Date()
        };

        const pool: BoostPool = {
            pool_id: poolId,
            pool_name: poolName,
            lead_server_id: guildId,
            created_by: createdBy,
            created_at: new Date(),
            servers: [leadServer],
            is_active: true
        };

        await pool_model.create(pool);
        return poolId;
    }

    /**
     * Add a server to an existing pool
     */
    async addServerToPool(poolId: string, guildId: string, inviteCode?: string): Promise<void> {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) throw new Error('Guild not found');

        const pool = await pool_model.findOne({ pool_id: poolId, is_active: true });
        if (!pool) throw new Error('Pool not found');

        // Check if server is already in pool
        if (pool.servers.some(s => s.guild_id === guildId)) {
            throw new Error('Server is already in this pool');
        }

        const newServer: PoolServer = {
            guild_id: guildId,
            guild_name: guild.name,
            invite_code: inviteCode,
            target_boost_count: 17, // Default for non-lead servers
            current_boost_count: await this.getCurrentBoostCount(guildId),
            auxiliary_boost_count: 0,
            is_lead_server: false,
            joined_at: new Date()
        };

        pool.servers.push(newServer);
        await (pool as BoostPoolDocument).save();

        // Create auxiliary boost roles for existing pooled boosters
        await this.syncAuxiliaryBoosts(poolId);
    }

    /**
     * Remove a server from a pool
     */
    async removeServerFromPool(poolId: string, guildId: string): Promise<void> {
        const pool = await pool_model.findOne({ pool_id: poolId, is_active: true });
        if (!pool) throw new Error('Pool not found');

        if (pool.lead_server_id === guildId) {
            throw new Error('Cannot remove lead server from pool. Transfer leadership first.');
        }

        // Remove auxiliary boost roles before removing from pool
        await this.removeAuxiliaryBoosts(guildId, poolId);

        pool.servers = pool.servers.filter(s => s.guild_id !== guildId);
        await (pool as BoostPoolDocument).save();
    }

    /**
     * Handle when a user starts boosting a server in a pool
     */
    async handleBoostStart(userId: string, guildId: string): Promise<void> {
        const pool = await this.getPoolByGuildId(guildId);
        if (!pool) {
            console.log(`No pool found for guild ${guildId}, skipping pool handling`);
            return; // Server not in a pool
        }

        console.log(`User ${userId} started boosting ${guildId} in pool ${pool.pool_name} (${pool.pool_id})`);

        try {
            // Create boost event for the actual boosted server
            const boostRecord = await pooled_boost_model.create({
                user_id: userId,
                guild_id: guildId,
                pool_id: pool.pool_id,
                boost_start: new Date(),
                boost_end: null,
                is_active: true,
                is_auxiliary_boost: false
            });

            console.log(`✅ Created boost record ${boostRecord._id} for ${userId} in ${guildId}`);

            // Synchronize boost roles across all servers in the pool
            await this.syncUserBoostRoles(userId, pool.pool_id);

            // Update boost counts
            await this.updateBoostCounts(pool.pool_id);
            console.log(`✅ Updated boost counts for pool ${pool.pool_id}`);

        } catch (error) {
            console.error(`❌ Error handling boost start for ${userId} in ${guildId}:`, error);
        }
    }

    /**
     * Handle when a user stops boosting a server in a pool
     */
    async handleBoostEnd(userId: string, guildId: string): Promise<void> {
        const pool = await this.getPoolByGuildId(guildId);
        if (!pool) {
            console.log(`No pool found for guild ${guildId}, skipping pool handling`);
            return;
        }

        console.log(`🔻 User ${userId} stopped boosting ${guildId} in pool ${pool.pool_name} (${pool.pool_id})`);

        try {
            // End the boost event
            const updateResult = await pooled_boost_model.updateMany(
                { user_id: userId, guild_id: guildId, is_active: true, is_auxiliary_boost: false },
                { boost_end: new Date(), is_active: false }
            );

            console.log(`✅ Ended ${updateResult.modifiedCount} boost records for ${userId} in ${guildId}`);

            // Synchronize boost roles across all servers in the pool
            await this.syncUserBoostRoles(userId, pool.pool_id);

            // Update boost counts
            await this.updateBoostCounts(pool.pool_id);
            console.log(`✅ Updated boost counts for pool ${pool.pool_id}`);

        } catch (error) {
            console.error(`❌ Error handling boost end for ${userId} in ${guildId}:`, error);
        }
    }

    /**
     * Check if a user has a booster role in a guild (Discord's native booster role or custom roles)
     */
    private async hasBoosterRole(member: GuildMember): Promise<boolean> {
        // Check if they're actually boosting the server (has premiumSince)
        if (member.premiumSince) {
            console.log(`User ${member.user.tag} is actively boosting ${member.guild.name}`);
            return true;
        }

        // Check for Discord's native booster role
        const boosterRole = member.guild.roles.cache.find(role => role.tags?.premiumSubscriberRole);
        if (boosterRole && member.roles.cache.has(boosterRole.id)) {
            console.log(`User ${member.user.tag} has Discord's native booster role in ${member.guild.name}`);
            return true;
        }

        // Check for common custom booster role names
        const commonBoosterRoleNames = [
            'booster',
            'server booster',
            'nitro booster',
            'boost',
            'boosters',
            'server boost',
            'nitro boost'
        ];

        const hasCustomBoosterRole = member.roles.cache.some(role =>
            commonBoosterRoleNames.some(name =>
                role.name.toLowerCase().includes(name.toLowerCase())
            )
        );

        if (hasCustomBoosterRole) {
            const boosterRoles = member.roles.cache.filter(role =>
                commonBoosterRoleNames.some(name =>
                    role.name.toLowerCase().includes(name.toLowerCase())
                )
            );
            console.log(`User ${member.user.tag} has custom booster role(s) in ${member.guild.name}: ${boosterRoles.map(r => r.name).join(', ')}`);
            return true;
        }

        return false;
    }

    /**
     * Synchronize boost roles for a user across all servers in a pool
     * This ensures users have the correct roles based on where they're actually boosting:
     * - If they're actively boosting a server, they should only have the Discord-managed booster role
     * - If they're not boosting a server, they should have the auxiliary role (if configured and they boost elsewhere)
     * - Users should never have both the real booster role and auxiliary role in the same server
     */
    private async syncUserBoostRoles(userId: string, poolId: string): Promise<void> {
        const pool = await pool_model.findOne({ pool_id: poolId });
        if (!pool) return;

        console.log(`🔄 Syncing boost roles for user ${userId} across pool ${pool.pool_name} (${poolId})`);

        // Get all active boosts for this user in the pool (non-auxiliary)
        const userBoosts = await pooled_boost_model.find({
            user_id: userId,
            pool_id: poolId,
            is_active: true,
            is_auxiliary_boost: false
        });

        const boostedGuildIds = new Set(userBoosts.map(b => b.guild_id));
        console.log(`User is actively boosting ${boostedGuildIds.size} servers: ${Array.from(boostedGuildIds).join(', ')}`);

        // Process each server in the pool
        for (const server of pool.servers) {
            try {
                const guild = this.client.guilds.cache.get(server.guild_id);
                if (!guild) {
                    console.log(`Skipping ${server.guild_name} (${server.guild_id}) - bot not in guild`);
                    continue;
                }

                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) {
                    console.log(`Skipping ${server.guild_name} (${server.guild_id}) - user not in guild`);
                    continue;
                }

                const isActivelyBoostingThisServer = boostedGuildIds.has(server.guild_id);
                const hasAuxiliaryRole = server.auxiliary_boost_role_id &&
                    member.roles.cache.has(server.auxiliary_boost_role_id);

                if (isActivelyBoostingThisServer) {
                    // User is actually boosting this server - remove auxiliary role if they have it
                    if (hasAuxiliaryRole) {
                        const role = guild.roles.cache.get(server.auxiliary_boost_role_id!);
                        if (role) {
                            await member.roles.remove(role);
                            console.log(`✅ Removed auxiliary role from ${userId} in ${server.guild_name} (actively boosting)`);
                        }
                    }

                    // End any auxiliary boost records for this server
                    const endResult = await pooled_boost_model.updateMany(
                        {
                            user_id: userId,
                            guild_id: server.guild_id,
                            pool_id: poolId,
                            is_active: true,
                            is_auxiliary_boost: true
                        },
                        { boost_end: new Date(), is_active: false }
                    );

                    if (endResult.modifiedCount > 0) {
                        console.log(`✅ Ended ${endResult.modifiedCount} auxiliary boost records for ${userId} in ${server.guild_name}`);
                    }

                } else {
                    // User is NOT actively boosting this server
                    // They should have auxiliary role if they're boosting ANY server in the pool
                    const shouldHaveAuxiliaryRole = boostedGuildIds.size > 0 && server.auxiliary_boost_role_id;

                    if (shouldHaveAuxiliaryRole) {
                        // Give them the auxiliary role if they don't have it
                        if (!hasAuxiliaryRole) {
                            const role = guild.roles.cache.get(server.auxiliary_boost_role_id!);
                            if (role) {
                                await member.roles.add(role);
                                console.log(`✅ Added auxiliary role to ${userId} in ${server.guild_name}`);

                                // Log the auxiliary boost grant
                                const logger = getBoostLogger(this.client);
                                const originalGuildId = Array.from(boostedGuildIds)[0];
                                await logger.logBoostEvent({
                                    userId,
                                    guildId: server.guild_id,
                                    type: 'boost_start',
                                    timestamp: new Date(),
                                    nickname: member.nickname || member.user.username,
                                    poolInfo: {
                                        poolId: pool.pool_id,
                                        poolName: pool.pool_name,
                                        isAuxiliary: true,
                                        originalGuildId
                                    }
                                });
                            }
                        }

                        // Ensure auxiliary boost record exists
                        const existingAuxBoost = await pooled_boost_model.findOne({
                            user_id: userId,
                            guild_id: server.guild_id,
                            pool_id: poolId,
                            is_active: true,
                            is_auxiliary_boost: true
                        });

                        if (!existingAuxBoost) {
                            await pooled_boost_model.create({
                                user_id: userId,
                                guild_id: server.guild_id,
                                pool_id: poolId,
                                boost_start: new Date(),
                                boost_end: null,
                                is_active: true,
                                is_auxiliary_boost: true,
                                original_boost_guild_id: Array.from(boostedGuildIds)[0] // Just pick the first one
                            });
                            console.log(`✅ Created auxiliary boost record for ${userId} in ${server.guild_name}`);
                        }

                    } else {
                        // They shouldn't have the auxiliary role - remove it if they have it
                        if (hasAuxiliaryRole) {
                            const role = guild.roles.cache.get(server.auxiliary_boost_role_id!);
                            if (role) {
                                await member.roles.remove(role);
                                console.log(`✅ Removed auxiliary role from ${userId} in ${server.guild_name} (no active boosts in pool)`);

                                // Log the auxiliary boost removal
                                const logger = getBoostLogger(this.client);
                                await logger.logBoostEvent({
                                    userId,
                                    guildId: server.guild_id,
                                    type: 'boost_end',
                                    timestamp: new Date(),
                                    nickname: member.nickname || member.user.username,
                                    poolInfo: {
                                        poolId: pool.pool_id,
                                        poolName: pool.pool_name,
                                        isAuxiliary: true
                                    }
                                });
                            }
                        }

                        // End any auxiliary boost records
                        const endResult = await pooled_boost_model.updateMany(
                            {
                                user_id: userId,
                                guild_id: server.guild_id,
                                pool_id: poolId,
                                is_active: true,
                                is_auxiliary_boost: true
                            },
                            { boost_end: new Date(), is_active: false }
                        );

                        if (endResult.modifiedCount > 0) {
                            console.log(`✅ Ended ${endResult.modifiedCount} auxiliary boost records for ${userId} in ${server.guild_name}`);
                        }
                    }
                }

            } catch (error) {
                console.error(`❌ Failed to sync boost roles for ${userId} in ${server.guild_name} (${server.guild_id}):`, error);
            }
        }

        console.log(`✅ Finished syncing boost roles for user ${userId} in pool ${poolId}`);
    }

    /**
     * Give auxiliary boost roles to a user in all pool servers except the one they actually boosted
     * Skip servers where they already have booster roles
     */
    private async giveAuxiliaryBoosts(userId: string, poolId: string, excludeGuildId: string): Promise<void> {
        const pool = await pool_model.findOne({ pool_id: poolId });
        if (!pool) return;

        console.log(`Giving auxiliary boosts to ${userId} in pool ${poolId}, excluding ${excludeGuildId}`);

        for (const server of pool.servers) {
            if (server.guild_id === excludeGuildId) {
                console.log(`Skipping ${server.guild_name} (${server.guild_id}) - this is where they actually boosted`);
                continue; // Skip the server they actually boosted
            }

            if (!server.auxiliary_boost_role_id) {
                console.log(`Skipping ${server.guild_name} (${server.guild_id}) - no auxiliary role configured`);
                continue;
            }

            try {
                const guild = this.client.guilds.cache.get(server.guild_id);
                if (!guild) {
                    console.log(`Skipping ${server.guild_name} (${server.guild_id}) - bot not in guild`);
                    continue;
                }

                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) {
                    console.log(`Skipping ${server.guild_name} (${server.guild_id}) - user ${userId} not in guild`);
                    continue;
                }

                // NEW: Check if user already has a booster role in this server
                const hasExistingBoosterRole = await this.hasBoosterRole(member);
                if (hasExistingBoosterRole) {
                    console.log(`Skipping ${server.guild_name} (${server.guild_id}) - user ${userId} already has booster role`);
                    continue;
                }

                const role = guild.roles.cache.get(server.auxiliary_boost_role_id);
                if (!role) {
                    console.log(`Skipping ${server.guild_name} (${server.guild_id}) - auxiliary role ${server.auxiliary_boost_role_id} not found`);
                    continue;
                }

                // Check if they already have the auxiliary role
                if (member.roles.cache.has(role.id)) {
                    console.log(`User ${userId} already has auxiliary role in ${server.guild_name}`);
                } else {
                    await member.roles.add(role);
                    console.log(`✅ Added auxiliary role to ${userId} in ${server.guild_name}`);
                }

                // Create auxiliary boost event (check if it already exists)
                const existingAuxBoost = await pooled_boost_model.findOne({
                    user_id: userId,
                    guild_id: server.guild_id,
                    pool_id: poolId,
                    is_active: true,
                    is_auxiliary_boost: true
                });

                if (!existingAuxBoost) {
                    await pooled_boost_model.create({
                        user_id: userId,
                        guild_id: server.guild_id,
                        pool_id: poolId,
                        boost_start: new Date(),
                        boost_end: null,
                        is_active: true,
                        is_auxiliary_boost: true,
                        original_boost_guild_id: excludeGuildId
                    });
                    console.log(`✅ Created auxiliary boost record for ${userId} in ${server.guild_name}`);
                }

            } catch (error) {
                console.error(`❌ Failed to give auxiliary boost role to ${userId} in ${server.guild_name} (${server.guild_id}):`, error);
            }
        }
    }

    /**
     * Remove auxiliary boost roles from a user
     */
    private async removeAuxiliaryBoosts(userId: string, poolId: string, excludeGuildId?: string): Promise<void> {
        const pool = await pool_model.findOne({ pool_id: poolId });
        if (!pool) return;

        console.log(`Removing auxiliary boosts from ${userId} in pool ${poolId}${excludeGuildId ? `, excluding ${excludeGuildId}` : ''}`);

        for (const server of pool.servers) {
            if (excludeGuildId && server.guild_id === excludeGuildId) continue;

            try {
                const guild = this.client.guilds.cache.get(server.guild_id);
                if (!guild) continue;

                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) continue;

                // Check if they still have a booster role (excluding auxiliary) before removing auxiliary role
                const hasOtherBoosterRole = await this.hasBoosterRole(member);

                if (server.auxiliary_boost_role_id) {
                    const role = guild.roles.cache.get(server.auxiliary_boost_role_id);
                    if (role && member.roles.cache.has(role.id)) {
                        // Only remove auxiliary role if they don't have other booster roles
                        if (!hasOtherBoosterRole) {
                            await member.roles.remove(role);
                            console.log(`✅ Removed auxiliary role from ${userId} in ${server.guild_name}`);
                        } else {
                            console.log(`Keeping auxiliary role for ${userId} in ${server.guild_name} - they have other booster roles`);
                        }
                    }
                }

                // End auxiliary boost events regardless of role removal
                const updatedCount = await pooled_boost_model.updateMany(
                    {
                        user_id: userId,
                        guild_id: server.guild_id,
                        pool_id: poolId,
                        is_active: true,
                        is_auxiliary_boost: true
                    },
                    { boost_end: new Date(), is_active: false }
                );

                if (updatedCount.modifiedCount > 0) {
                    console.log(`✅ Ended ${updatedCount.modifiedCount} auxiliary boost records for ${userId} in ${server.guild_name}`);
                }

            } catch (error) {
                console.error(`❌ Failed to remove auxiliary boost role from ${userId} in ${server.guild_name} (${server.guild_id}):`, error);
            }
        }
    }

    /**
     * Sync auxiliary boosts for all current boosters in a pool
     */
    private async syncAuxiliaryBoosts(poolId: string): Promise<void> {
        const pool = await pool_model.findOne({ pool_id: poolId });
        if (!pool) return;

        // Get all active boosters in the pool
        const activeBoosts = await pooled_boost_model.find({
            pool_id: poolId,
            is_active: true,
            is_auxiliary_boost: false
        });

        // Get unique user IDs
        const uniqueUserIds = [...new Set(activeBoosts.map(b => b.user_id))];

        // Sync roles for each user
        for (const userId of uniqueUserIds) {
            await this.syncUserBoostRoles(userId, poolId);
        }
    }

    /**
     * Set the auxiliary boost role for a server in a pool
     */
    async setAuxiliaryBoostRole(poolId: string, guildId: string, roleId: string): Promise<void> {
        const pool = await pool_model.findOne({ pool_id: poolId });
        if (!pool) throw new Error('Pool not found');

        const server = pool.servers.find(s => s.guild_id === guildId);
        if (!server) throw new Error('Server not found in pool');

        server.auxiliary_boost_role_id = roleId;
        await (pool as BoostPoolDocument).save();

        // Give the role to existing auxiliary boosters (but check for existing booster roles first)
        const auxiliaryBoosters = await pooled_boost_model.find({
            guild_id: guildId,
            pool_id: poolId,
            is_active: true,
            is_auxiliary_boost: true
        });

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return;

        const role = guild.roles.cache.get(roleId);
        if (!role) return;

        for (const boost of auxiliaryBoosters) {
            try {
                const member = await guild.members.fetch(boost.user_id);

                // Check if they already have a booster role
                const hasBoosterRole = await this.hasBoosterRole(member);
                if (!hasBoosterRole) {
                    await member.roles.add(role);
                    console.log(`✅ Added auxiliary role to ${boost.user_id} in ${guild.name}`);
                } else {
                    console.log(`Skipped adding auxiliary role to ${boost.user_id} in ${guild.name} - already has booster role`);
                }
            } catch (error) {
                console.error(`Failed to add auxiliary role to ${boost.user_id}:`, error);
            }
        }
    }

    /**
     * Update boost counts for all servers in a pool
     */
    async updateBoostCounts(poolId: string): Promise<void> {
        const pool = await pool_model.findOne({ pool_id: poolId });
        if (!pool) return;

        for (const server of pool.servers) {
            server.current_boost_count = await this.getCurrentBoostCount(server.guild_id);
            server.auxiliary_boost_count = await pooled_boost_model.countDocuments({
                guild_id: server.guild_id,
                pool_id: poolId,
                is_active: true,
                is_auxiliary_boost: true
            });
        }

        await (pool as BoostPoolDocument).save();
    }

    /**
     * Get current boost count for a guild
     */
    private async getCurrentBoostCount(guildId: string): Promise<number> {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return 0;

        await memberBulkFetch(guild);
        return guild.members.cache.filter(member => member.premiumSince !== null).size;
    }

    /**
     * Get pool by guild ID
     */
    async getPoolByGuildId(guildId: string): Promise<BoostPoolDocument | null> {
        return await pool_model.findOne({
            'servers.guild_id': guildId,
            is_active: true
        });
    }

    /**
     * Get pool by pool ID
     */
    async getPool(poolId: string): Promise<BoostPoolDocument | null> {
        return await pool_model.findOne({ pool_id: poolId, is_active: true });
    }

    /**
     * Get pools where a guild is the lead server
     */
    async getPoolsByLeadServer(guildId: string): Promise<BoostPoolDocument[]> {
        return await pool_model.find({
            lead_server_id: guildId,
            is_active: true
        });
    }

    /**
     * Get servers that need more boosts (sorted by priority)
     */
    async getServersNeedingBoosts(poolId: string): Promise<PoolServer[]> {
        const pool = await this.getPool(poolId);
        if (!pool) return [];

        await this.updateBoostCounts(poolId);

        return pool.servers
            .filter(server => server.current_boost_count < server.target_boost_count)
            .sort((a, b) => {
                const aDeficit = a.target_boost_count - a.current_boost_count;
                const bDeficit = b.target_boost_count - b.current_boost_count;
                return bDeficit - aDeficit; // Highest deficit first
            });
    }
}