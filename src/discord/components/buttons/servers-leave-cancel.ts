import { Client, ButtonInteraction } from 'discord.js';
import {
    fetchServerData,
    buildServerInfoEmbed,
    buildTabButtons,
    buildActionButtons
} from '../../commands/servers';

module.exports = {
    data: { name: "servers-leave-cancel" },
    async execute(client: Client, interaction: ButtonInteraction) {
        const parts = interaction.customId.split(':');
        const guildId = parts[2];

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return await interaction.update({
                embeds: [{
                    title: 'Error',
                    description: 'Could not find the server. It may have been removed.',
                    color: 0xFF0000
                }],
                components: []
            });
        }

        // Go back to server info view
        const data = await fetchServerData(guildId);
        const embed = await buildServerInfoEmbed(guild, data);
        const tabButtons = buildTabButtons(interaction.user.id, guildId, 'info');
        const actionButtons = buildActionButtons(interaction.user.id, guildId);

        await interaction.update({
            embeds: [embed],
            components: [tabButtons, actionButtons]
        });
    }
};
