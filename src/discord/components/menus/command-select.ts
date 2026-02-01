import { Client, ChannelSelectMenuInteraction, StringSelectMenuBuilder, ActionRowBuilder, StringSelectMenuInteraction, ChatInputCommandInteraction, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildCommandSelect, buildHelpEmbed } from '../../util/help';

module.exports = {
    data: { name: "command-select" },
    async execute(client: Client, interaction: StringSelectMenuInteraction) {
        const COMMAND = interaction.values
        const helpResult = await buildHelpEmbed(client, interaction, COMMAND[0])

        // Single command lookup always returns any[]
        const embed = Array.isArray(helpResult) ? helpResult : helpResult.embeds;

        const help_button = new ButtonBuilder()
            .setCustomId(`help-commands:${interaction.user.id}`)
            .setLabel('All commands')
            .setStyle(ButtonStyle.Primary)
        const meta_buton = new ButtonBuilder()
            .setCustomId(`help-meta:${interaction.user.id}`)
            .setLabel('Meta')
            .setStyle(ButtonStyle.Primary)
        const rules_button = new ButtonBuilder()
            .setCustomId(`help-rules:${interaction.user.id}`)
            .setLabel('Rules')
            .setStyle(ButtonStyle.Primary)
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(help_button, meta_buton, rules_button)
        const string_select = await buildCommandSelect(client, interaction)
        const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(string_select)

        await interaction.update({
            embeds: embed,
            components: [menu, row]
        })
    },
};