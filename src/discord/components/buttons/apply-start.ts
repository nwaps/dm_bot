// src/discord/components/buttons/apply-start.ts
import {
    Client,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalBuilder,
    MessageFlags,
    EmbedBuilder,
    ButtonInteraction
} from 'discord.js';
import { applicationQuestions, formatCycleTitle } from '../../commands/apply';
import { Question } from '../../models/application';
import { Application } from '../../models/application';
import { getUpcomingCycle } from '../../models/cycle';

module.exports = {
    data: { name: "apply-start" },
    async execute(client: Client, interaction: any) {
        let page = interaction.passed[0]
        await handleApplyButton(interaction, page)
    },
};

async function handleApplyButton(interaction: ButtonInteraction, page: number) {
    const customId = interaction.customId;

    // Handle Start Application button
    if (customId.startsWith(`apply-start:${interaction.user.id}:`)) {
        const cycleId = customId.replace(`apply-start:${interaction.user.id}:${page}:`, '');
        await handleStartApplication(interaction, cycleId, page);
    }
}

// Handle starting a new application - Shows full application modal
async function handleStartApplication(interaction: any, cycleId: string, page: number) {
    // Create a single modal with all questions
    const modal = new ModalBuilder()
        .setCustomId(`apply-submit-modal:${interaction.user.id}:${page}:${cycleId}`)
        .setTitle('Application Form');

    // Calculate the range of questions for this page
    const QUESTIONS_PER_PAGE = 5;
    const startIndex = page * QUESTIONS_PER_PAGE;
    const endIndex = Math.min(startIndex + QUESTIONS_PER_PAGE, applicationQuestions.length);

    // Add each question as a field in the modal
    // Discord has a limit of 5 text inputs per modal
    for (let i = startIndex; i < endIndex; i++) {
        const question = applicationQuestions[i];
        if (!question) {
            console.warn(`Question at index ${i} is undefined`);
            continue;
        }

        const textInput = new TextInputBuilder()
            .setCustomId(`question_${i}`)
            .setLabel(question.question)
            .setStyle(question.type === 'short_answer' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(question.required)
            .setMaxLength(Math.floor(4000 / applicationQuestions.length));

        // For yes/no questions, add a placeholder to guide the user
        if (question.type === 'yes_no') {
            textInput.setPlaceholder('Type Yes or No');
            textInput.setStyle(TextInputStyle.Short);
            textInput.setMaxLength(3);
        }

        const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
        modal.addComponents(actionRow);
    }

    // Ensure we have at least one component before showing the modal
    if (modal.components.length === 0) {
        await interaction.update({
            content: 'No more questions to answer. Your application is complete!',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Show the modal to the user
    await interaction.showModal(modal);
}

// Handle modal submission (for all questions at once)
export async function handleApplyModal(interaction: any, page: number) {
    const customId = interaction.customId;

    // Handle full application modal submission
    if (customId.startsWith(`apply-submit-modal:${interaction.user.id}:${page}:`)) {
        const cycleId = customId.replace(`apply-submit-modal:${interaction.user.id}:${page}:`, '');

        try {
            // Get all answers from modal
            const answers: Question[] = [];

            for (let i = 0; i <= page * 5; i++) {
                const question = applicationQuestions[i];
                const answer = interaction.fields.getTextInputValue(`question_${i}`);

                answers.push({
                    question: question.question,
                    answer: answer,
                    type: question.type as "yes_no" | "short_answer",  // Explicit cast to the expected union type
                    required: question.required
                });
            }

            // Create application in database
            const application = await Application.create({
                userId: interaction.user.id,
                username: interaction.user.username,
                nickname: interaction.member?.nickname || null,
                avatarUrl: interaction.user.displayAvatarURL({
                    extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
                    size: 512
                }),
                status: 'pending',
                activityCount: 0,
                questions: answers,
                endorsements: [],
                activity_pending: false,
                cycleId: cycleId,
                appointed: false,
                createdAt: new Date()
            });

            const upcomingCycle = await getUpcomingCycle()
            // Show success message
            const embed = new EmbedBuilder()
                .setTitle('Application Submitted')
                .setDescription(`Your application for the ${formatCycleTitle(upcomingCycle.cycleId)} has been submitted successfully.`)
                .addFields(
                    { name: 'Status', value: 'Pending' },
                    { name: 'Next Steps', value: 'Your application will be reviewed during the review period. You can check your application status any time with the /apply command.' }
                )
                .setColor('#10b981'); // Success color

            // Create refresh button
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`apply-refresh:${interaction.user.id}:${page}:${application._id.toString()}`)
                        .setLabel('Check Status')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Error submitting application:', error);

            await interaction.reply({
                content: 'An error occurred while submitting your application. Please try again later.',
                embeds: [],
                components: [],
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // Handle update modal submission
    else if (customId.startsWith(`apply-update-modal:${interaction.user.id}:${page}:`)) {
        const applicationId = customId.replace(`apply-update-modal:${interaction.user.id}:${page}:`, '');

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

            for (let i = 0; i <= 5; i++) {
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

            await interaction.reply({
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
    }
}