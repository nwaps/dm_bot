// src/discord/events/InteractionCreate_selfpin.ts

import { Client, ButtonInteraction, EmbedBuilder } from 'discord.js';
import { 
    getOrCreateConfig 
} from '../../util/nab';
import { getRepository } from '../../models/nab';

module.exports = {
    data: { name: "nab-reserve" },
    async execute(client: Client, interaction: any) {
        // Only handle button interactions with our specific custom ID
        await handleSelfUnpinInteraction(interaction);
    },
};

/**
 * Handle the self-pin button interaction
 * This function is extracted so it can be called from the persistent event handler
 */
async function handleSelfUnpinInteraction(interaction: ButtonInteraction): Promise<void> {
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
                content: '❌ **Number system disabled**\n\nThe number assignment system is currently disabled in this server. Contact an administrator for assistance.' 
            });
            return;
        }

        // Check if user has a pinned number
        const pinnedNumber = await getRepository().getPinnedNumber(guild.id, user.id);
        if (!pinnedNumber) {
            const embed = new EmbedBuilder()
                .setTitle('❌ No Reservation to Remove')
                .setDescription('You don\'t currently have any number reservation to remove.')
                .setColor('#FF0000')
                .addFields(
                    { 
                        name: 'What this means', 
                        value: 'You haven\'t reserved any number yet, so there\'s nothing to remove.', 
                        inline: false 
                    },
                    { 
                        name: 'What you can do', 
                        value: 'If you want to reserve your current number, use the "Reserve My Number" button instead.', 
                        inline: false 
                    }
                );

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Remove the pin
        await getRepository().unpinNumber(guild.id, user.id);

        // Create success embed
        const embed = new EmbedBuilder()
            .setTitle('✅ Reservation Removed Successfully')
            .setDescription(`Successfully removed your reservation for number **${pinnedNumber.number}**.`)
            .setColor('#00FF00')
            .addFields(
                { 
                    name: 'What this means', 
                    value: `Number **${pinnedNumber.number}** is no longer reserved to your account.`, 
                    inline: false 
                },
                { 
                    name: 'What happens next', 
                    value: 'If you leave and rejoin this server, you\'ll be assigned a new number normally instead of getting your old number back.', 
                    inline: false 
                },
                { 
                    name: 'Your current number', 
                    value: 'Your current number in the server remains unchanged. This only affects what happens when you rejoin in the future.', 
                    inline: false 
                },
                { 
                    name: 'Want to reserve again?', 
                    value: 'You can reserve your current number again anytime by clicking the "Reserve My Number" button.', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Your number reservation has been removed.' });

        await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
        console.error('Error in self-unpin interaction:', error);
        
        const embed = new EmbedBuilder()
            .setTitle('❌ Removal Error')
            .setDescription('An error occurred while trying to remove your number reservation.')
            .setColor('#FF0000')
            .addFields(
                { 
                    name: 'What to do', 
                    value: 'Please contact an administrator for assistance. They can manually remove your reservation using the `/unpin` command.', 
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
