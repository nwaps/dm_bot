// components/buttons/boost-dashboard-refresh.ts
import { ButtonInteraction, Client } from 'discord.js';
import { getBoostDashboardBuilder } from '../../util/boostDashboardBuilder';

module.exports = {
    data: {
        name: 'boost-dashboard-refresh'
    },

    async execute(client: Client, interaction: ButtonInteraction) {
        // Extract the user ID from the custom ID
        const [, authorizedUserId] = interaction.customId.split(':');

        // Check if the user clicking the button is the one who ran the command
        if (interaction.user.id !== authorizedUserId) {
            return interaction.reply({
                content: 'Only the user who opened the dashboard can refresh it.',
                ephemeral: true
            });
        }

        const guild = interaction.guild;
        if (!guild) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true
            });
        }

        await interaction.deferUpdate();

        try {
            const dashboardBuilder = getBoostDashboardBuilder(client);
            const { data, embeds } = await dashboardBuilder.buildCompleteDashboard(guild);

            // Keep the same button
            await interaction.editReply({
                embeds,
                components: interaction.message.components
            });

        } catch (error) {
            console.error('Error refreshing boost dashboard:', error);
            await interaction.followUp({
                content: 'An error occurred while refreshing the dashboard.',
                ephemeral: true
            });
        }
    }
};
