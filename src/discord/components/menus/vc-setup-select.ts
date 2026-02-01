// src/discord/components/menus/vc-setup-select.ts

import { Client, ChannelSelectMenuInteraction, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { set_settings, unflattened_settings } from '../../util/settings';

module.exports = {
    data: { name: "vc-setup-select" },
    async execute(client: Client, interaction: ChannelSelectMenuInteraction) {
        if (!interaction.guild) return;

        try {
            const selectedChannelId = interaction.values[0];
            const selectedChannel = await interaction.guild.channels.fetch(selectedChannelId);

            if (!selectedChannel || selectedChannel.type !== ChannelType.GuildVoice) {
                return await interaction.update({
                    embeds: [{
                        title: 'Invalid Selection',
                        description: 'Please select a valid voice channel.',
                        color: 0xff0000
                    }],
                    components: []
                });
            }

            // Save the home VC to settings
            const flat_obj = { 'channels.vc_home': [selectedChannelId] };
            const unflat = unflattened_settings(flat_obj);
            await set_settings(interaction.guild.id, unflat);

            // Create button to setup interface
            const setupButton = new ButtonBuilder()
                .setCustomId(`vc-setup-interface:${interaction.user.id}:${selectedChannelId}`)
                .setLabel('Setup User Interface')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(setupButton);

            await interaction.update({
                embeds: [{
                    title: 'Home Voice Channel Set',
                    description: `**Home Voice Channel:** ${selectedChannel}\n\nNow click the button below to setup the user interface in the associated text channel.`,
                    color: 0x00ff00,
                    footer: {
                        text: 'Step 2 of 2: Setup User Interface'
                    }
                }],
                components: [row]
            });

        } catch (error) {
            console.error('Error in vc-setup-select:', error);
            await interaction.update({
                embeds: [{
                    title: 'Setup Error',
                    description: 'An error occurred while saving the home voice channel. Please try again.',
                    color: 0xff0000
                }],
                components: []
            });
        }
    },
};