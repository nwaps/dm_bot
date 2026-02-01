import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

module.exports = {
    data: { name: "rape-home" },
    async execute(client: Client, interaction: any) {
        const NAME = interaction.button_var
        const save_button = new ButtonBuilder()
            .setCustomId(`rape-save:${interaction.user.id}:${NAME}`)
            .setLabel('Save Positions')
            .setStyle(ButtonStyle.Success)
        const move_initiator = new ButtonBuilder()
            .setCustomId(`rape-init:${interaction.user.id}:${NAME}`)
            .setLabel('Move Initiator')
            .setStyle(ButtonStyle.Primary)
        const move_target = new ButtonBuilder()
            .setCustomId(`rape-target:${interaction.user.id}:${NAME}`)
            .setLabel('Move Target')
            .setStyle(ButtonStyle.Primary)
        const edit_scale = new ButtonBuilder()
            .setCustomId(`rape-scale:${interaction.user.id}:${NAME}`)
            .setLabel('Profile Scaling')
            .setStyle(ButtonStyle.Primary)
        const row = new ActionRowBuilder().addComponents(move_initiator).addComponents(move_target).addComponents(edit_scale).addComponents(save_button)

        await interaction.update({
            embeds: [{
                title: `Move the initiator and target and initator pfps with the buttons below.\nUse the scaling button to resize pfp's`,
                description: `Alternatively, click save to set current positions or rerun the command with new values`,
                image: { url: interaction.message.embeds[0].image.url },
                color: 0x00ff00,
            }],
            components: [row],
        })
        // await interaction.message.edit({ attachments: [] })
    },
};

