// src/discord/components/modals/apply-submit-modal.ts
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { applicationQuestions, formatCycleTitle, formatDate, showExistingApplication } from '../../commands/apply';
import { Application, Question } from '../../models/application';
import { getCurrentCycle, getUpcomingCycle } from '../../models/cycle';

module.exports = {
    data: { name: "apply-submit-modal" },
    async execute(client: Client, interaction: any) {
        let page = Number(interaction.passed[0])
        const { cycleId } = await getCurrentCycle();

        try {
            const QUESTIONS_PER_PAGE = 5
            const startIndex = page * QUESTIONS_PER_PAGE;
            const pagedQuestions = applicationQuestions.slice(
                startIndex,
                startIndex + QUESTIONS_PER_PAGE
            );
            const answers: Question[] = pagedQuestions.map((q, idx) => {
                const raw = interaction.fields.getTextInputValue(`question_${startIndex + idx}`) || '';
                return {
                    question: q.question,
                    answer: raw.trim() || 'No answer provided',
                    type: q.type as 'yes_no' | 'short_answer',
                    required: q.required,
                };
            });


            // Create application in database

            let application = await Application.findOne({
                userId: interaction.user.id,
                cycleId: cycleId
            })

            if (!application) {
                application = new Application({
                    userId: interaction.user.id,
                    username: interaction.user.username,
                    nickname: interaction.user.nickname,
                    avatarUrl: interaction.user.displayAvatarURL({
                        extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
                        size: 512
                    }),
                    status: 'pending',
                    activityCount: 0,
                    templateName: 'janny',
                    questions: [...answers],
                    endorsements: [],
                    activity_pending: false,
                    cycleId,
                    guildId: interaction.guild.id,
                    appointed: false,
                    createdAt: new Date()
                })
                await application.save()
            } else {
                application.questions!.push(...answers);
                await application.save();

            }
            const totalAnswered = Math.min((page+1) * QUESTIONS_PER_PAGE, applicationQuestions.length);
            const lastPageDone = totalAnswered >= applicationQuestions.length;
            page += 1;

            if (lastPageDone) {
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
            } else {
                // for (let i = 0 * Number(page); i <= page * 5; i++) {
                // if (i >= 5) return;

                // Show success message
                const embed = new EmbedBuilder()
                    .setTitle('More answers required')
                    .setDescription(`You have completed ${totalAnswered} / ${applicationQuestions.length} questions. Click the button below to continue your application`)
                    .setColor('#ff8822'); // Success color

                // Create refresh button
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`apply-start:${interaction.user.id}:${page}:${application._id.toString()}`)
                            .setLabel('Continue questions')
                            .setStyle(ButtonStyle.Primary)
                    );


                await interaction.reply({
                    embeds: [embed],
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });


            }
        } catch (error) {
            console.error('Error submitting application:', error);

            await interaction.reply({
                content: 'An error occurred while submitting your application. Please try again later.',
                embeds: [],
                components: [],
                flags: MessageFlags.Ephemeral
            });
        }

    },
};
