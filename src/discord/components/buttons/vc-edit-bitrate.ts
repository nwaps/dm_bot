import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';

module.exports = {
    data: { name: "vc-edit-bitrate" },
    async execute(client: Client, interaction: any) {
        const NAME = interaction.button_var

        const embed = await buildMetaEmbed(client, interaction)

        const help_button = new ButtonBuilder()
            .setCustomId(`help-commands:${interaction.user.id}`)
            .setLabel('Commands')
            .setStyle(ButtonStyle.Primary)
        const meta_buton = new ButtonBuilder()
            .setCustomId(`help-meta:${interaction.user.id}`)
            .setLabel('Meta')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        const rules_button = new ButtonBuilder()
            .setCustomId(`help-rules:${interaction.user.id}`)
            .setLabel('Rules')
            .setStyle(ButtonStyle.Primary)
        const row = new ActionRowBuilder().addComponents(help_button, meta_buton, rules_button)

        await interaction.update({
            embeds: embed,
            components: [row],
        })
    },
};

