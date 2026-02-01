import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';

module.exports = {
    data: { name: "vc-edit-delete" },
    async execute(client: Client, interaction: any) {
        const confirm_button = new ButtonBuilder()
            .setCustomId(`vc-edit-delete-confirm:${interaction.user.id}:${interaction.channelId}`)
            .setLabel('Confirm ✅')
            .setStyle(ButtonStyle.Success)
        const cancel_buton = new ButtonBuilder()
            .setCustomId(`vc-edit-delete-cancel:${interaction.user.id}:${interaction.channelId}`)
            .setLabel('Cancel ❌')
            .setStyle(ButtonStyle.Danger)
        const row = new ActionRowBuilder().addComponents(confirm_button, cancel_buton)

        await interaction.reply({
            embeds: [{
                title: `Confirm`,
                description: `Are you sure you would like to delete the channel?`,
                color: 0xff0000
            }],
            flags: MessageFlags.Ephemeral,
            components: [row],
        })
    },
};

