import { Client, ButtonInteraction } from 'discord.js';
import {
    buildServerListEmbed,
    buildServerListPagination
} from '../../commands/servers';

module.exports = {
    data: { name: "servers-list-last" },
    async execute(client: Client, interaction: ButtonInteraction) {
        const parts = interaction.customId.split(':');
        const page = parseInt(parts[2], 10);

        const { embed, totalPages } = buildServerListEmbed(client, page);
        const paginationButtons = buildServerListPagination(interaction.user.id, page, totalPages);

        await interaction.update({
            embeds: [embed],
            components: [paginationButtons]
        });
    }
};
