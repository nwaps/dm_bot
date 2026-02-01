import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';

module.exports = {
    data: { name: "vc-edit-delete-cancel" },
    async execute(client: Client, interaction: any) {
        await interaction.update({
            embeds: [{
                title: `Request cancelled`,
                color: 0xffff00
            }],
            components: []
        } )
    },
};

