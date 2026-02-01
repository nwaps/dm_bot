import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import settings_model from '../../models/settings';

module.exports = {
    data: { name: "rape-remove" },
    async execute(client: Client, interaction: any) {
        const NAME = interaction.button_var
        const TYPE = interaction.passed[0]
        const key = `settings.rape.${TYPE}.${NAME}`
        await settings_model.updateOne(
            { guildId: interaction.guildId },
            { $unset: { [key]: "" } }
        );

        const yes_button = new ButtonBuilder()
            .setCustomId(`rape-remove:${interaction.user.id}`)
            .setLabel('YA')
            .setDisabled(true)
            .setStyle(ButtonStyle.Danger)

        const no_button = new ButtonBuilder()
            .setCustomId(`rape-cancel:${interaction.user.id}`)
            .setLabel('WAIT!!! MISCLICK!!')
            .setStyle(ButtonStyle.Success)

        const row = new ActionRowBuilder().addComponents(yes_button).addComponents(no_button)


        if (interaction.message.attachments) await interaction.message.edit({ attachments: [] })
        try {
            await interaction.update({
                content: '',
                embeds: [{
                    title: `${TYPE === "phrases" ? "Phrase" : "Image"} has been deleted!`,
                    description: ``,
                    color: 0x00ff00,
                }],
                components: [row],
            })
        } catch (error) { console.log(error) }
    },
};

