import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, VoiceBasedChannel, TextInputBuilder, TextInputStyle, ModalBuilder, ButtonComponent, ActionRow, ContainerComponent } from 'discord.js';
import { get_settings, set_settings } from '../../util/settings';
import { rapeUser } from '../../commands/rape';
import { updateButtonStates } from '../../util/vcs';

module.exports = {
    data: { name: "vc-edit-limit" },
    async execute(client: Client, interaction: any) {
        const NAME = interaction.button_var
        if (interaction.passed?.length > 0) {
            const [action, amount] = interaction.passed;
            const channelId = interaction.channelId;

            // Get channel with fallback to fetch if not cached
            const channel = (interaction.guild.channels.cache.get(channelId) as VoiceBasedChannel) ??
                (await interaction.guild.channels.fetch(channelId) as VoiceBasedChannel);

            // Calculate new limit
            const amt = parseInt(amount, 10);
            const newLimit = calculateNewLimit(action, channel.userLimit, amt);

            updateButtonStates(interaction.message.components, newLimit, channel.members.size);

            // update interaction if not opening custom modal
            if (['plus', 'minus', 'reset'].includes(action)) {
                await channel.setUserLimit(newLimit);
                return await interaction.update({ components: interaction.message.components });
            }

            if (action === 'custom') {
                const modal = new ModalBuilder()
                    .setCustomId(`vc-edit-limit:${interaction.user.id}`)
                    .setTitle('Enter the new user limit');

                const textInput = new TextInputBuilder()
                    .setCustomId('vc-edit-limit')
                    .setLabel('User Limit (1-99)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(2);

                const modalRow = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
                modal.addComponents(modalRow);

                return await interaction.showModal(modal)
            }
        }
    },
};

function calculateNewLimit(action: string, currentLimit: number, amount: number) {
    switch (action) {
        case 'reset':
            return 0;
        case 'plus':
            return currentLimit + amount;
        case 'minus':
            return currentLimit - amount;
        default:
            return currentLimit;
    }
}