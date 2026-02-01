import { Client, ButtonInteraction, EmbedBuilder } from 'discord.js';

module.exports = {
    data: { name: "servers-leave-confirm" },
    async execute(client: Client, interaction: ButtonInteraction) {
        const parts = interaction.customId.split(':');
        const guildId = parts[2];

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return await interaction.update({
                embeds: [{
                    title: 'Error',
                    description: 'Could not find the server. It may have already been removed.',
                    color: 0xFF0000
                }],
                components: []
            });
        }

        const guildName = guild.name;

        try {
            await guild.leave();

            const successEmbed = new EmbedBuilder()
                .setTitle('Left Server')
                .setDescription(`Successfully left **${guildName}**.`)
                .setColor(0x00FF00);

            await interaction.update({
                embeds: [successEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error leaving server:', error);
            await interaction.update({
                embeds: [{
                    title: 'Error',
                    description: `Failed to leave **${guildName}**. Please try again.`,
                    color: 0xFF0000
                }],
                components: []
            });
        }
    }
};
