import { Client, ButtonInteraction, ChannelType } from 'discord.js';
import {
    fetchServerData,
    buildServerInfoEmbed,
    buildTabButtons,
    buildActionButtons
} from '../../commands/servers';

module.exports = {
    data: { name: "servers-invite" },
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

        try {
            // Find a suitable channel to create an invite
            const channels = guild.channels.cache.filter(
                c => c.type === ChannelType.GuildText &&
                c.permissionsFor(guild.members.me!)?.has('CreateInstantInvite')
            );

            const channel = channels.first();
            if (!channel || !('createInvite' in channel)) {
                return await interaction.reply({
                    content: 'Could not find a suitable channel to create an invite. The bot may lack permissions.',
                    ephemeral: true
                });
            }

            // Create a permanent invite
            const invite = await channel.createInvite({
                maxAge: 0, // Never expires
                maxUses: 0, // Unlimited uses
                reason: `Invite created via /servers command by ${interaction.user.tag}`
            });

            // Update the view with the new invite shown
            const data = await fetchServerData(guildId);
            const embed = await buildServerInfoEmbed(guild, data);
            embed.addFields({
                name: 'New Invite Created',
                value: `https://discord.gg/${invite.code}`,
                inline: false
            });

            const tabButtons = buildTabButtons(interaction.user.id, guildId, 'info');
            const actionButtons = buildActionButtons(interaction.user.id, guildId);

            await interaction.update({
                embeds: [embed],
                components: [tabButtons, actionButtons]
            });

        } catch (error) {
            console.error('Error creating invite:', error);
            await interaction.reply({
                content: 'Failed to create invite. The bot may lack the Create Instant Invite permission.',
                ephemeral: true
            });
        }
    }
};
