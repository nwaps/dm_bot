import { Client, ButtonInteraction } from 'discord.js';
import {
    buildServerListEmbed,
    buildServerListPagination
} from '../../commands/servers';

// Handler for all pagination buttons (first, prev, next, last)
async function handlePagination(client: Client, interaction: ButtonInteraction) {
    const parts = interaction.customId.split(':');
    // Format: servers-list-{action}:userId:page
    const page = parseInt(parts[2], 10);

    const { embed, totalPages } = buildServerListEmbed(client, page);
    const paginationButtons = buildServerListPagination(interaction.user.id, page, totalPages);

    await interaction.update({
        embeds: [embed],
        components: [paginationButtons]
    });
}

// Export handlers for each button type
module.exports = {
    data: { name: "servers-list-first" },
    execute: handlePagination
};
