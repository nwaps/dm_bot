// src/discord/events/InteractionCreate_selfpin.ts

import { Client, ButtonInteraction, EmbedBuilder } from 'discord.js';
import { 
    getMemberCurrentNumber,
    getOrCreateConfig 
} from '../../util/nab';
import { getRepository, PinnedNumber } from '../../models/nab';

module.exports = {
    data: { name: "nab-reserve" },
    async execute(client: Client, interaction: any) {
        // Only handle button interactions with our specific custom ID
        await handleSelfPinInteraction(interaction);
    },
};

/**
 * Handle the self-pin button interaction
 * This function is extracted so it can be called from the persistent event handler
 */
async function handleSelfPinInteraction(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const user = interaction.user;

    if (!guild) {
        await interaction.editReply({ content: 'This can only be used in a server.' });
        return;
    }

    try {
        const config = await getOrCreateConfig(guild.id);
        
        if (!config.enabled) {
            await interaction.editReply({ 
                content: '**Number system disabled**\n\nThe number assignment system is currently disabled in this server. Contact an administrator for assistance.' 
            });
            return;
        }

        // Get the member
        const member = await guild.members.fetch(user.id);
        
        // Check if user has a current number
        const currentNumber = await getMemberCurrentNumber(member);
        if (currentNumber === null) {
            const embed = new EmbedBuilder()
                .setTitle('No Number to Reserve')
                .setDescription('You don\'t currently have a number in your nickname that can be reserved.')
                .setColor('#FF0000')
                .addFields(
                    { 
                        name: 'What you need', 
                        value: `You need to have a number in your nickname (starting with "${config.prefix}") before you can reserve it.`, 
                        inline: false 
                    },
                    { 
                        name: 'How to get a number', 
                        value: 'Contact an administrator to get assigned a number, or wait to be assigned one automatically when the system is active.', 
                        inline: false 
                    }
                );

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if this number is already pinned to someone else
        const existingPin = await getRepository().isPinnedToOther(guild.id, currentNumber, user.id);
        if (existingPin) {
            const embed = new EmbedBuilder()
                .setTitle('Number Already Reserved')
                .setDescription(`Number **${currentNumber}** is already reserved by another user.`)
                .setColor('#FF0000')
                .addFields(
                    { 
                        name: 'What this means', 
                        value: `Someone else has already reserved number ${currentNumber}. Only one person can reserve each number.`, 
                        inline: false 
                    },
                    { 
                        name: 'What you can do', 
                        value: 'Contact an administrator - they can:\n• Help resolve this conflict\n• Assign you a different number\n• Remove the other reservation if appropriate', 
                        inline: false 
                    },
                    // { 
                    //     name: 'Admin commands', 
                    //     value: `Admins can use \`/lookup ${currentNumber}\` to see who has it reserved and \`/unpin @user\` to remove reservations if needed.`, 
                    //     inline: false 
                    // }
                );

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if user already has this number pinned (update case)
        const existingUserPin = await getRepository().getPinnedNumber(guild.id, user.id);
        
        const pinnedNumber: PinnedNumber = {
            guildId: guild.id,
            userId: user.id,
            number: currentNumber,
            pinnedAt: new Date(),
            pinnedBy: user.id, // Self-pinned
            reason: 'Self-reserved via button'
        };

        await getRepository().pinNumber(pinnedNumber);

        // Create success embed
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .addFields(
                { 
                    name: 'Reserved Number', 
                    value: `**${currentNumber}**`, 
                    inline: true 
                },
                { 
                    name: 'What happens next', 
                    value: 'If you leave and rejoin this server, you\'ll automatically get this number back (if it\'s available).', 
                    inline: false 
                },
                { 
                    name: 'Managing your reservation', 
                    value: 'Administrators can remove your reservation using `/unpin @you` if needed. You can reserve a different number anytime by changing your number and using this button again.', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Your number is now safely reserved!' });

        if (existingUserPin && existingUserPin.number !== currentNumber) {
            embed.setTitle('Number Reservation Updated');
            embed.setDescription(`Successfully updated your reserved number from **${existingUserPin.number}** to **${currentNumber}**.`);
        } else if (existingUserPin && existingUserPin.number === currentNumber) {
            embed.setTitle('Number Already Reserved');
            embed.setDescription(`Number **${currentNumber}** was already reserved to your account. Your reservation is confirmed!`);
        } else {
            embed.setTitle('Number Reserved Successfully');
            embed.setDescription(`Successfully reserved number **${currentNumber}** to your account.`);
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
        console.error('Error in self-pin interaction:', error);
        
        const embed = new EmbedBuilder()
            .setTitle('Reservation Error')
            .setDescription('An error occurred while trying to reserve your number.')
            .setColor('#FF0000')
            .addFields(
                { 
                    name: 'What to do', 
                    value: 'Please contact an administrator for assistance. They can manually reserve your number using the `/pin` command.', 
                    inline: false 
                },
                { 
                    name: 'Error details', 
                    value: `\`${error.message}\``, 
                    inline: false 
                }
            );

        await interaction.editReply({ embeds: [embed] });
    }
}
