import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, MessageFlags, VoiceBasedChannel } from 'discord.js';
import { applicationQuestions, formatCycleTitle } from '../../commands/apply';
import { Application, Question } from '../../models/application';
import { getUpcomingCycle } from '../../models/cycle';
import { sanitizeString } from '../../util/vcs';

module.exports = {
    data: { name: "vc-edit-name" },
    async execute(client: Client, interaction: any) {
        const channelId = interaction.channelId
        const channel = interaction.guild.channels.cache.get(channelId) ?? await interaction.guild.channels.fetch(channelId)

        const new_name = await interaction.fields.getTextInputValue(`vc-edit-name`);

        const sanitized_name = sanitizeString(new_name);

        channel.setName(sanitized_name)

        interaction.update({})
    },
};
