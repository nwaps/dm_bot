import { Client, ButtonInteraction } from 'discord.js';
import {
    ServerTab,
    fetchServerData,
    buildServerInfoEmbed,
    buildPermissionsEmbed,
    buildConfigEmbed,
    buildUsageEmbed,
    buildTabButtons,
    buildActionButtons
} from '../../commands/servers';

module.exports = {
    data: { name: "servers-tab" },
    async execute(client: Client, interaction: ButtonInteraction) {
        const parts = interaction.customId.split(':');
        // Format: servers-tab:userId:guildId:tabId
        const guildId = parts[2];
        const tab = parts[3] as ServerTab;

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

        const data = await fetchServerData(guildId);
        let embed;

        switch (tab) {
            case 'info':
                embed = await buildServerInfoEmbed(guild, data);
                break;
            case 'perms':
                embed = buildPermissionsEmbed(guild);
                break;
            case 'config':
                embed = buildConfigEmbed(guildId, data);
                break;
            case 'usage':
                embed = buildUsageEmbed(data);
                break;
            default:
                embed = await buildServerInfoEmbed(guild, data);
        }

        const tabButtons = buildTabButtons(interaction.user.id, guildId, tab);
        const actionButtons = buildActionButtons(interaction.user.id, guildId);

        await interaction.update({
            embeds: [embed],
            components: [tabButtons, actionButtons]
        });
    }
};
