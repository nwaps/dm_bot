import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuInteraction, VoiceBasedChannel, ComponentType, MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';
import { updateBitrateMenu, updateButtonStates } from '../../util/vcs';

module.exports = {
    data: { name: "vc-edit-limit" },
    async execute(client: Client, interaction: ModalSubmitInteraction | any) {
        const option = await interaction.fields.getTextInputValue(`vc-edit-limit`);
        const regex = /\D/
        if (regex.test(option)) return

        let new_limit = parseInt(option, 10)
        if (new_limit > 99) new_limit = 99
        if (new_limit < 0) new_limit = 0
        const channelId = interaction.channelId
        const channel = interaction.guild?.channels.cache.get(channelId) as VoiceBasedChannel ?? await interaction.guild?.channels.fetch(channelId) as VoiceBasedChannel

        updateButtonStates(interaction.message.components, new_limit, channel.members.size)

        channel.setUserLimit(new_limit)
        interaction.update({ components: interaction.message.components })
    },
};

