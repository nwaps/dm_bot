// src/discord/events/ChannelDelete.ts

import { Client, Events, VoiceChannel } from 'discord.js';
import { cleanupDeletedVC } from '../util/vc-cleanup';
import { removeVC } from '../util/vcs';

export default {
    name: Events.ChannelDelete,
    async execute(client: Client, channel: any) {
        try {
            // Only handle voice channels
            if (!(channel instanceof VoiceChannel)) return;

            console.log(`Voice channel deleted: ${channel.name} (${channel.id}) in guild ${channel.guild.name}`);

            // Check if this was a user-created VC
            const guild_vcs = global.VCS.get(channel.guild.id);
            const owned_channel = guild_vcs?.channels.get(channel.id);

            if (owned_channel) {
                console.log(`Cleaning up user-created VC: ${channel.name}`);
                
                // Remove from VC database
                await removeVC(channel);
                
                // Clean up bump cooldown
                await cleanupDeletedVC(channel.id, channel.guild.id);
                
                console.log(`Successfully cleaned up VC ${channel.name} (${channel.id})`);
            }

        } catch (error) {
            console.error('Error handling channel deletion:', error);
        }
    },
};