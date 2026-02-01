import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuInteraction, VoiceBasedChannel, ComponentType, MessageFlags } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';
import { updateBitrateMenu } from '../../util/vcs';

module.exports = {
    data: { name: "vc-edit-bitrate" },
    async execute(client: Client, interaction: StringSelectMenuInteraction) {
        const option = interaction.values[0]
        const channelId = interaction.channelId
        const channel = interaction.guild?.channels.cache.get(channelId) as VoiceBasedChannel ?? await interaction.guild?.channels.fetch(channelId) as VoiceBasedChannel

        updateBitrateMenu(interaction.message.components, option)

        channel.setBitrate(Number(option))
        interaction.update({ components: interaction.message.components })
    },
};

