// src/discord/components/buttons/vc-setup-change.ts

import { Client, ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType } from 'discord.js';

module.exports = {
    data: { name: "vc-setup-change" },
    async execute(client: Client, interaction: any) {
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId(`vc-setup-select:${interaction.user.id}`)
            .setPlaceholder('Choose the new home voice channel')
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildVoice);

        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

        await interaction.update({
            embeds: [{
                title: 'Change Home Voice Channel',
                description: 'Please select the new voice channel that will serve as the **home voice channel**.\n\nUsers will need to join this channel to create their own custom voice channels.',
                color: 0x6f96d1,
                footer: {
                    text: 'Select a new home voice channel'
                }
            }],
            components: [row]
        });
    },
};