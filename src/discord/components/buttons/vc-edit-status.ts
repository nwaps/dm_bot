import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';

module.exports = {
    data: { name: "vc-edit-status" },
    async execute(client: Client, interaction: any) {
        // const channelId = interaction.channelId
        // const channel = interaction.channels.cache.get(channelId) ?? await interaction.channels.fetch(channelId)
        const modal = new ModalBuilder()
            .setCustomId(`vc-edit-status:${interaction.user.id}`)
            .setTitle('Enter the new channel status');

        const textInput = new TextInputBuilder()
            .setCustomId('vc-edit-status')
            .setLabel('Channel status')
            .setStyle(TextInputStyle.Short) 
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(90);

        const modalRow = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
        modal.addComponents(modalRow);

        await interaction.showModal(modal)
    },
};

