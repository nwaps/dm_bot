import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuInteraction, VoiceBasedChannel, ComponentType, MessageFlags } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';
import { updateBitrateMenu, updateRegionMenu } from '../../util/vcs';

module.exports = {
    data: { name: "vc-edit-region" },
    async execute(client: Client, interaction: StringSelectMenuInteraction) {
        const option = interaction.values[0]
        const channelId = interaction.channelId
        const channel = interaction.guild?.channels.cache.get(channelId) as VoiceBasedChannel ?? await interaction.guild?.channels.fetch(channelId) as VoiceBasedChannel

        updateRegionMenu(interaction.message.components, option)

        const region = option == "null" ? null : option
        channel.setRTCRegion(region)
        interaction.update({ components: interaction.message.components })
    },
};

