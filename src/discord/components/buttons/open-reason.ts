import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

module.exports = {
    data: { name: "open-reason" },
    async execute(client: Client, interaction: any) {
        const user_id = interaction.button_var
        const message_id = interaction.passed[0]

        const modal = new ModalBuilder()
            .setCustomId(`reason-modal:${user_id}:${message_id}`)
            .setTitle('Enter your reason');

        const textInput = new TextInputBuilder()
            .setCustomId('reason-text')
            .setLabel('Your reason')
            .setStyle(TextInputStyle.Paragraph) 
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(100);

        const modalRow = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
        modal.addComponents(modalRow);

        await interaction.showModal(modal)


    },
};

