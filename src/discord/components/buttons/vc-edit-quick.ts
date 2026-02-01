// src/discord/components/buttons/vc-edit-quick.ts

import { Client, MessageFlags } from 'discord.js';

module.exports = {
    data: { name: "vc-edit-quick" },
    async execute(client: Client, interaction: any) {
        try {
            if (!interaction.guild) throw new Error(`Not a guild interaction`);

            const initiator = await interaction.guild.members.cache.get(interaction.user.id) ?? await interaction.guild.members.fetch(interaction.user.id);
            
            // Check if user is in a voice channel
            if (!initiator.voice?.channel) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Not in Voice Channel',
                        description: 'You must be in a voice channel to edit it!',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if this is the channel where the button was clicked
            if (initiator.voice.channel.id !== interaction.channelId) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Wrong Channel',
                        description: 'You must be in this voice channel to edit it!',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if channel is a user-created VC
            const guild_vcs = global.VCS.get(interaction.guild.id);
            const owned_channel = guild_vcs?.channels.get(initiator.voice.channel.id);
            
            if (!owned_channel) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Invalid Channel',
                        description: 'This is not a user-created voice channel!',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if user is owner or promoted
            const isAuthorized = owned_channel.owner?.includes(initiator.user.id) || owned_channel.promoted?.includes(initiator.user.id);
            
            if (!isAuthorized) {
                const prefix = String(global.SETTINGS[interaction.guild.id].guild?.prefix ?? "[NO_PREFIX]")
                return await interaction.reply({
                    embeds: [{
                        title: 'No Permission',
                        description: `You must be the channel owner or promoted to edit this channel. Ask the owner to \`${prefix}promote\` you.`,
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Execute the edit command logic
            const editCommand = client.commands.get('edit');
            if (editCommand) {
                return await editCommand.execute(client, interaction);
            } else {
                return await interaction.reply({
                    embeds: [{
                        title: 'Command Error',
                        description: 'The edit command is not available. Please try using `/edit` instead.',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

        } catch (error) {
            console.error('Error in vc-edit-quick:', error);
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