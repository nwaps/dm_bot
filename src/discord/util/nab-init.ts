// src/discord/util/userNumbering-init.ts

import { Client } from 'discord.js';
import { getOrCreateConfig, initializeUserNumbering } from './nab';
import { memberBulkFetch } from './member-fetch-wrapper';

/**
 * Initialize the User Number Assignment system
 */
export async function initializeUserNumberingSystem(client: Client): Promise<void> {
    console.log('Initializing User Number Assignment system...');

    try {
        // Initialize the user numbering utility
        await initializeUserNumbering(client);

        // Perform initial sync for all guilds if needed
        await performInitialGuildSync(client);

        console.log('User Number Assignment system initialized successfully.');

        // Set up periodic maintenance
        setInterval(() => {
            performMaintenanceTasks(client);
        }, 3600000); // Every hour

    } catch (error) {
        console.error('Failed to initialize User Number Assignment system:', error);
        throw error;
    }
}

/**
 * Perform initial sync for all guilds
 */
async function performInitialGuildSync(client: Client): Promise<void> {
    try {
        console.log('Performing initial guild sync for user numbering...');

        const guilds = client.guilds.cache;
        let syncedGuilds = 0;

        for (const [guildId, guild] of guilds) {
            try {
                // Ensure all members are cached
                await memberBulkFetch(guild);

                // Get or create config for this guild
                await getOrCreateConfig(guildId);

                syncedGuilds++;
            } catch (error) {
                console.error(`Error syncing guild ${guild.name} (${guildId}):`, error);
            }
        }

        console.log(`Initial sync completed for ${syncedGuilds} guilds`);

    } catch (error) {
        console.error('Error during initial guild sync:', error);
    }
}

/**
 * Perform periodic maintenance tasks
 */
async function performMaintenanceTasks(client: Client): Promise<void> {
    try {
        // console.log('Performing maintenance tasks...');


    } catch (error) {
        console.error('Error during maintenance tasks:', error);
    }
}