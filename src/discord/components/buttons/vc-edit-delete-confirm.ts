import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';
import { cleanupChannelState } from '../../util/autodelete';

module.exports = {
    data: { name: "vc-edit-delete-confirm" },
    async execute(client: Client, interaction: any) {
        const [channel_id] = interaction.passed;
        const channel = interaction.guild.channels.cache.get(channel_id) ?? await interaction.guild.channels.fetch(channel_id)

        if (interaction.channelId === channel_id) {
            cleanupChannelState(channel_id)
            await interaction.update({
                embeds: [{
                    title: `Confirmed`,
                    description: `Deleting...`,
                    color: 0xff00ff
                }],
                flags: MessageFlags.Ephemeral,
                components: []
            })
            const home_vc_id = String(global.SETTINGS[interaction.guild.id].channels.vc_home[0])
            if (home_vc_id)
                if (home_vc_id !== channel.id)
                    console.log('deleting channel')
                // await channel.delete()
                else console.error(`#### ${interaction.user}(${interaction.user.id}) somehow triggered this out of band ####\n${interaction.channel.id} ${channel.name}`)
        }
        else console.error(`#### ${interaction.user.id} broke the interaction ${interaction.user} ${interaction.channel} ####`)
    },
};

