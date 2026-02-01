import { ButtonInteraction, Client, MessageFlags } from 'discord.js';
import { Permissions } from '../../models/permissions.js';

module.exports = {
    require_perm: Permissions.USER,
    data: {
        name: 'show_more'
    },
    async execute(client: Client, interaction: ButtonInteraction) {
        if (!interaction.guild) {
            return interaction.reply({ 
                content: 'This can only be used in a guild.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Extract user and guild IDs from custom ID: show_more:userId:guildId
        const userId = interaction.button_var;
        const guildId = interaction.passed?.[0];
        
        // Only allow the mentioned user to see their own mentions
        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: 'You can only view your own mentions.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            // Simply acknowledge and instruct user to run command again
            await interaction.update({
                embeds: [
                    {
                        title: '📄 Show More Mentions',
                        description: 'Use `/wp` again to see more of your unread mentions.',
                        color: 0x5865F2,
                        timestamp: new Date().toISOString()
                    }
                ],
                components: []
            });
        } catch (error) {
            console.error('Error showing more mentions:', error);
            await interaction.reply({
                content: 'An error occurred. Try using `/wp` again.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};