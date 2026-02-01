import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

module.exports = {
    data: { name: "rape-cancel" },
    async execute(client: Client, interaction: any) {
        const NAME = interaction.button_var
        const yes_button = new ButtonBuilder()
            .setCustomId(`rape-remove:${interaction.user.id}`)
            .setLabel(NAME ? "Cancelled deletion!" : "You're")
            .setDisabled(true)
            .setStyle(ButtonStyle.Danger)
        const no_button = new ButtonBuilder()
            .setCustomId(`rape-cancel:${interaction.user.id}`)
            .setLabel(NAME ? "Cancelled deletion!" : "Retarded")
            .setDisabled(true)
            .setStyle(ButtonStyle.Success)
        const row = new ActionRowBuilder().addComponents(yes_button).addComponents(no_button)

        if (interaction.message.attachments) await interaction.message.edit({ attachments: [] })
        if (!NAME) {
            return await interaction.update({
                content: '',
                embeds: [{
                    title: `Why did you think that would work?`,
                    description: ``,
                    color: 0x00ff00,
                }],
                components: [row],
            })
        } 
        await interaction.update({
            content: '',
            embeds: [{
                title: `Cancelled deletion of ${NAME}!`,
                description: ``,
                color: 0x00ff00,
            }],
            components: [row],
        })
        
    },
};

