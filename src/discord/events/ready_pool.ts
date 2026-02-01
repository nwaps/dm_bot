// src/discord/events/ready_pool.ts

import { Client, Events } from 'discord.js';
import { pool_model } from '../models/pools';
import { PoolManager } from '../util/pool';

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: Client) {
        try {
            const poolManager = new PoolManager(client);

            // Update boost counts for all active pools
            const activePools = await pool_model.find({ is_active: true });

            let successCount = 0;
            let errorCount = 0;

            for (const pool of activePools) {
                try {
                    await poolManager.updateBoostCounts(pool.pool_id);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to update boost counts for pool ${pool.pool_name}:`, error);
                    errorCount++;
                }
            }

            console.log(`Pool system initialized: ${activePools.length} pools (${successCount} updated, ${errorCount} errors)`);

        } catch (error) {
            console.error('Error initializing pool system:', error);
        }
    },
};