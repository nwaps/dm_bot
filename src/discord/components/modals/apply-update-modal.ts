// src/discord/components/modals/apply-update-modal.ts
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, MessageFlags } from 'discord.js';
import { applicationQuestions, formatCycleTitle } from '../../commands/apply';
import { Application, Question } from '../../models/application';
import { getUpcomingCycle } from '../../models/cycle';

module.exports = {
    data: { name: "apply-update-modal" },
    async execute(client: Client, interaction: any) {
        const customId = interaction.customId;
        const page = interaction.passed[0]
        const applicationId = customId.replace(`apply-update-modal:${interaction.user.id}:`, '');

        try {
            // Find the application
            const application = await Application.findById(applicationId);

            if (!application) {
                return interaction.reply({
                    content: 'Application not found.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Get all answers from modal
            const answers: Question[] = [];

            for (let i = 0 + page; i < applicationQuestions.length; i++) {
                const question = applicationQuestions[i];
                const answer = interaction.fields.getTextInputValue(`question_${i}`);

                answers.push({
                    question: question.question,
                    answer: answer,
                    type: question.type as "yes_no" | "short_answer", // Explicit cast to the expected union type
                    required: question.required
                });
            }

            // Update application in database
            application.questions = answers;
            await application.save();
            const upcomingCycle = await getUpcomingCycle()

            // Show success message
            const embed = new EmbedBuilder()
                .setTitle('Application Updated')
                .setDescription(`Your application for the ${formatCycleTitle(upcomingCycle.cycleId)} has been updated successfully.`)
                .addFields(
                    { name: 'Status', value: application.status.charAt(0).toUpperCase() + application.status.slice(1) },
                    { name: 'Next Steps', value: 'Your application will be reviewed during the review period. You can check your application status any time with the /apply command.' }
                )
                .setColor('#10b981'); // Success color

            // Create refresh button
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`apply-refresh:${interaction.user.id}:${application._id.toString()}`)
                        .setLabel('Check Status')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Error updating application:', error);

            await interaction.reply({
                content: 'An error occurred while updating your application. Please try again later.',
                embeds: [],
                components: [],
                flags: MessageFlags.Ephemeral
            });
        }
    },
};
