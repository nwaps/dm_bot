import { ButtonInteraction, Client, EmbedBuilder, MessageFlags } from 'discord.js';
import { Permissions } from '../../models/permissions.js';
import mentionModel from '../../models/mentions.js';
import mongoose from 'mongoose';

module.exports = {
    require_perm: Permissions.USER,
    data: {
        name: 'mark_read'
    },
    async execute(client: Client, interaction: ButtonInteraction) {
        if (!interaction.guild) {
            return interaction.reply({ 
                content: 'This can only be used in a guild.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Extract data from custom ID: mark_read:userId:guildId:count
        const userId = interaction.button_var;
        const guildId = interaction.passed?.[0];
        const countStr = interaction.passed?.[1];
        
        if (!countStr) {
            return interaction.reply({
                content: 'Invalid button data. Please try the command again.',
                flags: MessageFlags.Ephemeral
            });
        }

        const countToMark = parseInt(countStr);
        if (isNaN(countToMark) || countToMark <= 0) {
            return interaction.reply({
                content: 'Invalid mention count. Please try the command again.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        // Only allow the mentioned user to mark their own mentions as read
        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: 'You can only mark your own mentions as read.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            // Get the first N unread mentions in the same order as the display
            // (newest first, same as the command query)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const mentionsToMark = await mentionModel.find({
                mentionedUserId: userId,
                guildId: guildId,
                timestamp: { $gte: twentyFourHoursAgo },
                isRead: { $ne: true }
            }).sort({ timestamp: -1 }).limit(countToMark);

            if (mentionsToMark.length === 0) {
                return interaction.update({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ No Mentions to Mark')
                        .setDescription('No unread mentions found to mark as read.')
                        .setColor(0x00ff00)
                        .setTimestamp()
                    ],
                    components: []
                });
            }

            // Mark the specific mentions as read
            const mentionIds = mentionsToMark.map(m => m._id);
            const result = await mentionModel.updateMany({
                _id: { $in: mentionIds }
            }, {
                $set: { isRead: true }
            });

            const markedCount = result.modifiedCount;

            // Check if there are any remaining unread mentions from the last 24 hours
            const remainingMentions = await mentionModel.find({
                mentionedUserId: userId,
                guildId: guildId,
                timestamp: { $gte: twentyFourHoursAgo },
                isRead: { $ne: true }
            }).limit(1);

            if (remainingMentions.length === 0) {
                // No more unread mentions
                const embed = new EmbedBuilder()
                    .setTitle('✅ All caught up!')
                    .setDescription(`You have no more unread mentions from the last 24 hours.`)
                    .setColor(0x00ff00)
                    .setTimestamp();

                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            } else {
                // There are more mentions - manually recreate the display logic
                try {
                    await interaction.deferUpdate();

                    // Re-execute the same logic as the wp command to show remaining mentions
                    const { collapseSpamMentions, formatMentionText } = require('../../util/mention-formatter.js');
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

                    // Get remaining unread mentions
                    const remainingUnreadMentions = await mentionModel.find({
                        mentionedUserId: userId,
                        guildId: guildId,
                        timestamp: { $gte: twentyFourHoursAgo },
                        isRead: { $ne: true }
                    }).sort({ timestamp: -1 }).limit(100);

                    const collapsedMentions = collapseSpamMentions(remainingUnreadMentions);
                    const uniqueUsers = new Set(collapsedMentions.map((m: any) => m.mentionedByUserId)).size;

                    // Recreate the display logic
                    const maxDescriptionLength = 4000;
                    let description = '';
                    let processedMentions = [];
                    let hasMoreMentions = false;

                    for (const mention of collapsedMentions) {
                        const mentionText = formatMentionText(mention);
                        const newLineChar = description ? '\n\n' : '';
                        const potentialLength = description.length + newLineChar.length + mentionText.length;
                        
                        if (potentialLength > maxDescriptionLength) {
                            hasMoreMentions = true;
                            break;
                        }

                        if (description) description += '\n\n';
                        description += mentionText;
                        processedMentions.push(mention);
                    }

                    if (processedMentions.length === 0 && collapsedMentions.length > 0) {
                        const firstMention = collapsedMentions[0];
                        const mentionText = formatMentionText(firstMention);
                        if (mentionText.length > maxDescriptionLength) {
                            const truncatedText = mentionText.substring(0, maxDescriptionLength - 3) + '...';
                            description = truncatedText;
                        } else {
                            description = mentionText;
                        }
                        processedMentions.push(firstMention);
                        hasMoreMentions = collapsedMentions.length > 1;
                    }

                    const totalUnreadMentions = remainingUnreadMentions.length;
                    const shownMentions = processedMentions.length;
                    const footerText = hasMoreMentions 
                        ? `Showing ${shownMentions} of ${totalUnreadMentions} unread mentions from ${uniqueUsers} users`
                        : `${totalUnreadMentions} unread mentions from ${uniqueUsers} users`;

                    const embed = new EmbedBuilder()
                        .setTitle('who.....pinged?')
                        .setDescription(description)
                        .setColor(0x5865F2)
                        .setTimestamp()
                        .setFooter({ text: footerText });

                    // Add buttons
                    const components = [];
                    if (processedMentions.length > 0) {
                        const customId = `mark_read:${userId}:${guildId}:${shownMentions}`;
                        const markReadButton = new ButtonBuilder()
                            .setCustomId(customId)
                            .setLabel(`Mark ${shownMentions} as Read`)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('✅');

                        components.push(new ActionRowBuilder().addComponents(markReadButton));
                    }

                    await interaction.editReply({
                        embeds: [embed],
                        components: components
                    });

                } catch (error) {
                    console.error('Error showing next mentions:', error);
                    // Fallback on error
                    await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle('✅ Mentions Marked as Read')
                            .setDescription(`You still have more unread mentions. Use \`/wp\` to see them.`)
                            .setColor(0x00ff00)
                            .setTimestamp()
                        ],
                        components: []
                    });
                }
            }

        } catch (error) {
            console.error('Error marking mentions as read:', error);
            await interaction.reply({
                content: 'An error occurred while marking mentions as read.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};