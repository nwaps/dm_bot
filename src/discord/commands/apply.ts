// commands/apply.ts
import {
    ChatInputCommandInteraction,
    Client,
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Message,
} from 'discord.js';
import { Permissions } from '../models/permissions';
import { Application, db_application, Question } from '../models/application';
import { getCurrentCycle, getUpcomingCycle, manageCycles } from '../models/cycle';
import { ManagedGuild } from '../models/managed_guild';
import { GuildMember as GM } from '../models/guild_member';
import { ApplicationTemplate } from '../models/application_template';
import { HELP_CATEGORIES } from '../util/help-categories';

// Questions to ask during application process, 5 max
export let applicationQuestions = [
    {
        id: 'error',
        question: 'Run the command again',
        type: 'yes_no',
        required: false
    }
];

export default {
    require_perm: Permissions.USER,
    category: HELP_CATEGORIES.APPLICATIONS,
    help: `Apply for a community position during the application period`,
    data: new SlashCommandBuilder()
        .setName('apply')
        .setDescription('Apply for a community position')
        .setContexts(InteractionContextType.Guild),
    async execute(client: Client, interaction: ChatInputCommandInteraction | Message) {
        if (interaction instanceof Message) { interaction.react('📬').catch(() => true); return interaction.user.send('Please use /apply instead'); }
        if(interaction.guild?.id !== "224284702213668864") return await interaction.reply({
            embeds: [{
                title: `Error`,
                description: `Applications are not enabled in this guild. Contact haggardwarsage for help`,
                color: 0xff0000
            }],
            flags: MessageFlags.Ephemeral
        })
        try {
            if (!interaction.guild) return
            const guildId = interaction.guild.id
            const userId = interaction.user.id;
            const existingGuild = await ManagedGuild.findOne({ guildId })
            const existingUser = await GM.findOne({ userId, guildId })
            const application = await ApplicationTemplate.findOne({ name: 'janny' })
            if (application) applicationQuestions = application.questions
            if (!existingUser) {
                const newUser = new GM({
                    userId,
                    guildId,
                    role: 'user'
                })
                newUser.save()
            }
            if (!existingGuild) {
                // Create new guild with default settings
                const newGuild = new ManagedGuild({
                    guildId,
                    guildName: interaction.guild.name,
                    iconUrl: interaction.guild.iconURL(),
                    bannerUrl: interaction.guild.bannerURL(),
                    description: interaction.guild.description,
                    applicationsEnabled: true,
                    isOnboarded: true,
                    permissions: {
                        user: {
                            permissions: ['edit-own-applications']
                        },
                        mod: {
                            permissions: ['edit-own-applications', 'approve-deny-applications']
                        },
                        admin: {
                            permissions: ['edit-own-applications', 'approve-deny-applications', 'edit-others-applications']
                        }
                    },
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                newGuild.save();
            }

            // Run cycle management to ensure we're in the correct cycle
            await manageCycles();

            // Get the current cycle
            const currentCycle = await getCurrentCycle();

            // Get current date
            const now = new Date();

            // Check if we're in the application period
            const applicationStartDate = new Date(currentCycle.startDate);
            const applicationDeadline = new Date(currentCycle.applicationDeadline);

            const isApplicationPeriod = now >= applicationStartDate && now <= applicationDeadline;


            // Check if user already has an application for this cycle
            const existingApplication = await Application.findOne({
                userId,
                cycleId: currentCycle.cycleId
            });

            const nextCycle = await getUpcomingCycle()
            if (existingApplication) {
                // User already has an application for this cycle
                await showExistingApplication(interaction, existingApplication, nextCycle, isApplicationPeriod);
            } else {
                // User doesn't have an application yet
                if (!isApplicationPeriod) {
                    // Not in application period
                    const embed = new EmbedBuilder()
                        .setTitle('Application Period Closed')
                        .setDescription(`The application period for the ${formatCycleTitle(nextCycle.cycleId)} is not currently open.`)
                        .addFields(
                            { name: 'Application Period', value: `**Opens:** <t:${applicationStartDate.getTime() / 1000}:F>\n**Closes:** <t:${applicationDeadline.getTime() / 1000}:F>` }
                        )
                        .setColor('#ef4444'); // Red color from your theme

                    return interaction.reply({
                        embeds: [embed],
                        flags: MessageFlags.Ephemeral
                    });
                }

                // Start new application process
                await startNewApplication(interaction, currentCycle);
            }
        } catch (error) {
            console.error('Error in apply command:', error);
            return interaction.reply({
                content: 'An error occurred while processing your application. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

// Helper function to format dates
export function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Helper function to format cycle title
export function formatCycleTitle(cycleId: string): string {
    const [year, month] = cycleId.split('-');

    const date = new Date();
    date.setFullYear(parseInt(year));
    date.setMonth(parseInt(month) - 1);

    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) + ' Cycle';
}

// Show existing application
export async function showExistingApplication(
    interaction: ChatInputCommandInteraction | any,
    application: db_application,
    cycle: any,
    isApplicationPeriod: boolean
) {
    // Create an embed to display the application status
    const embed = new EmbedBuilder()
        .setTitle('Your Application')
        .setDescription(`You have already applied for the ${formatCycleTitle(cycle.cycleId)}.\nWant to see all the applications? https://apply.monoko.chat\nWant to edit your application? https://apply.monoko.chat\nWant to endorse an applcation? https://apply.monoko.chat\n\n**Your responses:**`)
        .setColor(getStatusColor(application.status));

    // Add fields for questions and answers
    if (application.questions && application.questions.length > 0) {
        application.questions.forEach((qa, index) => {
            embed.addFields({ name: `${index + 1}) ${qa.question}`, value: qa.answer });
        });
    }

    embed.addFields(
        { name: 'Status', value: application.status.charAt(0).toUpperCase() + application.status.slice(1), inline: true },
        { name: 'Submitted on', value: formatDate(application.createdAt), inline: true },
        { name: 'Endorsements', value: `${application.endorsements.length}`, inline: true }
    )

    // Create action buttons
    const row = new ActionRowBuilder<ButtonBuilder>();

    // Only allow updates during application period and if not already approved/denied
    // if (isApplicationPeriod && application.status === 'pending') {
    //     row.addComponents(
    //         new ButtonBuilder()
    //             .setCustomId(`apply-update:${interaction.user.id}:${application._id.toString()}`)
    //             .setLabel('Update Application')
    //             .setStyle(ButtonStyle.Primary)
    //     );
    // }

    // Add view status button
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`apply-refresh:${interaction.user.id}:${application._id.toString()}`)
            .setLabel('Refresh Status')
            .setStyle(ButtonStyle.Secondary)
    );

    // Reply with the embed and buttons
    if (row.components.length > 0) {
        if (interaction instanceof ChatInputCommandInteraction) {
            await interaction.reply({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.update({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        }
    } else {
        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    }
}

// Start a new application
async function startNewApplication(interaction: ChatInputCommandInteraction, currentCycle: any) {
    const embed = new EmbedBuilder()
        .setTitle('JQ Application')
        .setDescription(`As a Janitor, you will receive access to a special command that is able to time a user out temporarily. As such, there are some rules:

**1) Be Active & Involved**
\`\`\`Janitors must be consistently active in the server and well-acquainted with its culture, rules, and user dynamics.\`\`\`
**2) Act Professionally**
\`\`\`This is a role of trust. Handle  user interaction with maturity, fairness, and discretion.\`\`\`
**3) Tech Requirements**
\`\`\`You must moderate from your own personal computer (not shared or borrowed) and have a basic working knowledge of Discord’s moderation tools (message deletion, timeout, user history, etc.).\`\`\`
**4) No Favourites**
\`\`\`You should not be taking sides and using your power to target "the opposition". If we detect any bias, your posittion will be revoked.\`\`\`
**5) Confusion**
\`\`\`In complex or uncertain situations, it's best to take no action. It is best to err on the side of inaction if you are unsure is something requires cleaning.\`\`\`
**6) Stay Neutral**
\`\`\`Avoid personal disputes or drama. Janitors should lead by quiet example and not fan flames in any channel.\`\`\`
**7) No Logging or Sharing**
\`\`\`Do not log, screenshot, or share internal janitor discussions or moderation actions with non-staff. What happens in janitor channels stays there.\`\`\`
**8) Maintain Obscurity**
\`\`\`Do not publicly identify yourself as a janitor. Janitors operate quietly to preserve neutrality and avoid status-chasing or clout dynamics.\`\`\`
**➈) Keep your Cool**
\`\`\`Janitors are not staff — they help keep chat clean, not moderate it. Power-tripping, overstepping, or creating fear-based environments will lead to immediate removal.\`\`\`
### By applying, you agree to the above rules and to not plead ignorance if your position is revoked for abuse.

-# Applications open from ${formatDate(new Date(currentCycle.startDate))} to ${formatDate(new Date(currentCycle.applicationDeadline))}`)
        .setColor('#6d8bad'); // Primary color from your theme

    // Create button to start application
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`apply-start:${interaction.user.id}:0:${currentCycle.cycleId}`)
                .setLabel('I AGREE')
                .setStyle(ButtonStyle.Success)
        );

    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
    });
}

// Get color based on application status
export function getStatusColor(status: string): number {
    switch (status) {
        case 'approved':
            return 0x10b981; // success color
        case 'denied':
            return 0xef4444; // danger color
        case 'pending':
            return 0x6f96d1; // info color
        default:
            return 0x6d8bad; // primary color
    }
}

// Handle modal submission (for all questions at once)
export async function handleApplyModal(interaction: any) {
    const customId = interaction.customId;

    // Handle full application modal submission
    if (customId.startsWith(`apply-submit-modal:${interaction.user.id}:0:`)) {
        const cycleId = customId.replace(`apply-submit-modal:${interaction.user.id}:0:`, '');

        try {
            // Get all answers from modal
            const answers: Question[] = [];

            for (let i = 0; i <= 5; i++) {
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
                        .setCustomId(`apply-refresh:${interaction.user.id}:0:${application._id.toString()}`)
                        .setLabel('Check Status')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({
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
    else if (customId.startsWith(`apply-update-modal:${interaction.user.id}:0:`)) {
        const applicationId = customId.replace(`apply-update-modal:${interaction.user.id}:0:`, '');

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

            // Show success message
            const embed = new EmbedBuilder()
                .setTitle('Application Updated')
                .setDescription(`Your application for the ${formatCycleTitle(application.cycleId)} has been updated successfully.`)
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

// Handle application update - Shows modal with current answers prefilled
// async function handleUpdateApplication(interaction: any, applicationId: string) {
//     try {
//         // Find the application
//         const application = await Application.findById(applicationId);

//         if (!application) {
//             return interaction.update({
//                 content: 'Application not found.',
//                 embeds: [],
//                 components: [],
//                 flags: MessageFlags.Ephemeral
//             });
//         }

//         // Check if user owns this application
//         if (application.userId !== interaction.user.id) {
//             return interaction.update({
//                 content: 'You can only update your own applications.',
//                 embeds: [],
//                 components: [],
//                 flags: MessageFlags.Ephemeral
//             });
//         }

//         // Create a modal with all questions and prefill with existing answers
//         const modal = new ModalBuilder()
//             .setCustomId(`apply-update-modal:${interaction.user.id}:0:${applicationId}`)
//             .setTitle('Update Application');

//         // Add each question as a field in the modal
//         applicationQuestions.forEach((question, index) => {
//             // Find existing answer for this question
//             const existingAnswer = application.questions.find(q => q.question === question.question);

//             const textInput = new TextInputBuilder()
//                 .setCustomId(`question_${index}`)
//                 .setLabel(question.question)
//                 .setStyle(question.type === 'short_answer' ? TextInputStyle.Paragraph : TextInputStyle.Short)
//                 .setRequired(question.required)
//                 .setMaxLength(1000);

//             // Prefill with existing answer if available
//             if (existingAnswer) {
//                 textInput.setValue(existingAnswer.answer);
//             }

//             // For yes/no questions, add a placeholder to guide the user
//             if (question.type === 'yes_no') {
//                 textInput.setPlaceholder('Type Yes or No');
//                 textInput.setStyle(TextInputStyle.Short);
//                 textInput.setMaxLength(3);
//             }

//             const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
//             modal.addComponents(actionRow);
//         });

//         // Show the modal to the user
//         await interaction.showModal(modal);
//     } catch (error) {
//         console.error('Error updating application:', error);

//         await interaction.update({
//             content: 'An error occurred while updating your application. Please try again later.',
//             embeds: [],
//             components: [],
//             flags: MessageFlags.Ephemeral
//         });
//     }
// }

// Handle application refresh
export async function handleRefreshStatus(interaction: any, applicationId: string) {
    try {
        // Find the application
        const application = await Application.findById(applicationId);

        if (!application) {
            return interaction.update({
                content: 'Application not found.',
                embeds: [],
                components: [],
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if user owns this application
        if (application.userId !== interaction.user.id) {
            return interaction.update({
                content: 'You can only view your own applications.',
                embeds: [],
                components: [],
                flags: MessageFlags.Ephemeral
            });
        }

        // Get current cycle
        const currentCycle = await getUpcomingCycle();

        // Check if we're in the application period
        const now = new Date();
        const applicationStartDate = new Date(currentCycle.startDate);
        const applicationDeadline = new Date(currentCycle.applicationDeadline);
        const isApplicationPeriod = now >= applicationStartDate && now <= applicationDeadline;

        // Show the application
        await showExistingApplication(interaction, application, currentCycle, isApplicationPeriod);
    } catch (error) {
        console.error('Error refreshing application:', error);

        await interaction.update({
            content: 'An error occurred while refreshing your application. Please try again later.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }
}