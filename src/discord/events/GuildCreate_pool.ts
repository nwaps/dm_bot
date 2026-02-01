// src/discord/events/guildCreate_pool.ts

import { Client, Events, Guild } from 'discord.js';
import { pool_model } from '../models/pools';

export default {
    name: Events.GuildCreate,
    async execute(client: Client, guild: Guild) {
        console.log(`Joined guild: ${guild.name} (${guild.id})`);
        
        try {
            // Update guild names in any pools this server is part of
            await pool_model.updateMany(
                { 'servers.guild_id': guild.id },
                { $set: { 'servers.$.guild_name': guild.name } }
            );
            
            console.log(`Updated guild name for ${guild.name} in pools`);
        } catch (error) {
            console.error('Error updating guild name in pools:', error);
        }
    },
};