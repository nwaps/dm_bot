import { Client, ButtonInteraction, EmbedBuilder } from 'discord.js';
import { buildLeaveConfirmButtons } from '../../commands/servers';

module.exports = {
    data: { name: "servers-leave" },
    async execute(client: Client, interaction: ButtonInteraction) {
        const parts = interaction.customId.split(':');
        const guildId = parts[2];

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return await interaction.reply({
                content: 'Could not find the server. It may have been removed.',
                ephemeral: true
            });
        }

        // Show confirmation prompt
        const confirmEmbed = new EmbedBuilder()
            .setTitle('Confirm Leave Server')
            .setDescription(
                `Are you sure you want the bot to leave **${guild.name}**?\n\n` +
                `This action cannot be undone. The bot will need to be re-invited to rejoin.`
            )
            .setColor(0xFF0000)
            .setThumbnail(guild.iconURL({ size: 256 }));

        const confirmButtons = buildLeaveConfirmButtons(interaction.user.id, guildId);

        await interaction.update({
            embeds: [confirmEmbed],
            components: [confirmButtons]
        });
    }
};
