// src/discord/components/buttons/vc-bump-quick.ts

import { Client, MessageFlags, VoiceBasedChannel, VoiceChannel } from 'discord.js';
import { checkBumpCooldown, setBumpCooldown } from '../../util/bump-cooldowns';

module.exports = {
    data: { name: "vc-bump-quick" },
    async execute(client: Client, interaction: any) {
        try {
            if (!interaction.guild) throw new Error(`Not a guild interaction`);

            const initiator = await interaction.guild.members.cache.get(interaction.user.id) ?? await interaction.guild.members.fetch(interaction.user.id);
            const home_vc_channel = await interaction.guild.channels.cache.get(String(global.SETTINGS[interaction.guild.id].channels.vc_home[0])) ?? await interaction.guild.channels.fetch(String(global.SETTINGS[interaction.guild.id].channels.vc_home[0]));

            if (!home_vc_channel) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Setup Error',
                        description: 'The home voice channel is not properly configured. Please contact an administrator.',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Type guard to ensure we have a voice channel
            if (!(home_vc_channel instanceof VoiceChannel)) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Setup Error',
                        description: 'The home voice channel is not properly configured. Please contact an administrator.',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            const home_vc = home_vc_channel as VoiceChannel;

            // Check if user is in a voice channel
            const current_channel = initiator.voice.channel as VoiceBasedChannel;
            if (!current_channel) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Not in Voice Channel',
                        description: 'You must be in a voice channel to bump it!',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if this is the channel where the button was clicked
            if (current_channel.id !== interaction.channelId) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Wrong Channel',
                        description: 'You must be in this voice channel to bump it!',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if this is the home VC
            if (current_channel.id === home_vc.id) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Cannot Bump',
                        description: 'You cannot bump the home voice channel!',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if channel is a user-created VC
            const guild_vcs = global.VCS.get(interaction.guild.id);
            const owned_channel = guild_vcs?.channels.get(current_channel.id);
            
            if (!owned_channel) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Invalid Channel',
                        description: 'You can only bump user-created voice channels!',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check cooldown using MongoDB
            const cooldownCheck = await checkBumpCooldown(current_channel.id, interaction.guild.id);
            
            if (cooldownCheck.isOnCooldown) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Cooldown Active',
                        description: `This channel was bumped recently! Please wait **${cooldownCheck.timeString}** before bumping again.`,
                        color: 0xffaa00
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Calculate new position (right below home VC)
            const newPosition = home_vc.rawPosition + 1;
            
            try {
                await current_channel.setPosition(newPosition);
                
                // Set cooldown in MongoDB
                const cooldownSet = await setBumpCooldown(current_channel.id, interaction.guild.id);
                
                if (!cooldownSet) {
                    console.warn(`Failed to set bump cooldown for channel ${current_channel.id} in guild ${interaction.guild.id}`);
                }
                
                await interaction.reply({
                    embeds: [{
                        title: 'Channel Bumped!',
                        description: `Successfully moved "${current_channel.name}" to the top of the list!`,
                        color: 0x00ff00
                    }],
                    flags: MessageFlags.Ephemeral
                });

                // Send message to the channel
                await current_channel.send(`⬆️ **Bumped!** ${initiator} moved this channel to the top of the list.`);
                
            } catch (error) {
                console.error('Error bumping channel:', error);
                return await interaction.reply({
                    embeds: [{
                        title: 'Bump Failed',
                        description: 'Failed to bump channel. Please try again or contact an administrator.',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

        } catch (error) {
            console.error('Error in vc-bump-quick:', error);
            return await interaction.reply({
                embeds: [{
                    title: 'Error',
                    description: 'An unexpected error occurred. Please try again.',
                    color: 0xff0000
                }],
                flags: MessageFlags.Ephemeral
            });
        }
    },
};