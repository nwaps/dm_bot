// src/discord/components/buttons/apply-refresh.ts
import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, MessageFlags, EmbedBuilder, ButtonInteraction } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';
import { applicationQuestions, formatCycleTitle, handleRefreshStatus, showExistingApplication } from '../../commands/apply';
import { Question } from '../../models/application';
import { Application } from '../../models/application';
import { getCurrentCycle } from '../../models/cycle';

module.exports = {
    data: { name: "apply-refresh" },
    async execute(client: Client, interaction: any) {
        let [, , freshCustomId , customId] = interaction.customId.split(':')
        await handleRefreshStatus(interaction, customId ?? freshCustomId)
    },
};


