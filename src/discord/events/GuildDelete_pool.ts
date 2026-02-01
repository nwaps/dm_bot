// src/discord/events/guildDelete_pool.ts

import { Client, Events, Guild } from 'discord.js';
import { pool_model } from '../models/pools';
import { pooled_boost_model } from '../models/pools';

export default {
    name: Events.GuildDelete,
    async execute(client: Client, guild: Guild) {
        console.log(`Left guild: ${guild.name} (${guild.id})`);
        
        try {
            // Check if this guild is a lead server for any pools
            const ledPools = await pool_model.find({ lead_server_id: guild.id, is_active: true });
            
            for (const pool of ledPools) {
                console.log(`Deactivating pool ${pool.pool_name} - lead server left`);
                
                // Deactivate the pool
                pool.is_active = false;
                await pool.save();
                
                // End all active pooled boost events
                await pooled_boost_model.updateMany(
                    { pool_id: pool.pool_id, is_active: true },
                    { boost_end: new Date(), is_active: false }
                );
                
                // TODO: Notify other servers in the pool that it's been deactivated
                // This would require storing channel IDs for notifications
            }
            
            // Remove guild from any pools it was a member of
            await pool_model.updateMany(
                { 'servers.guild_id': guild.id, is_active: true },
                { $pull: { servers: { guild_id: guild.id } } }
            );
            
            // End active boost events for this guild
            await pooled_boost_model.updateMany(
                { guild_id: guild.id, is_active: true },
                { boost_end: new Date(), is_active: false }
            );
            
        } catch (error) {
            console.error('Error handling guild leave for pools:', error);
        }
    },
};