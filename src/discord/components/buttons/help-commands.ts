import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { buildHelpEmbed, buildCommandSelect, createPaginationButtons, setupHelpInteractionCollector, buildCategorySelect } from '../../util/help';
import { CATEGORY_ALL } from '../../util/help-categories';

module.exports = {
    data: { name: "help-commands" },
    async execute(client: Client, interaction: any) {
        // const NAME = interaction.button_var

        const helpData = await buildHelpEmbed(client, interaction, undefined, 0, CATEGORY_ALL);

        const help_button = new ButtonBuilder()
            .setCustomId(`help-commands:${interaction.user.id}`)
            .setLabel('Commands')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        const meta_buton = new ButtonBuilder()
            .setCustomId(`help-meta:${interaction.user.id}`)
            .setLabel('Meta')
            .setStyle(ButtonStyle.Primary)
        const rules_button = new ButtonBuilder()
            .setCustomId(`help-rules:${interaction.user.id}`)
            .setLabel('Rules')
            .setStyle(ButtonStyle.Primary)
        const row = new ActionRowBuilder().addComponents(help_button, meta_buton, rules_button)

        // const string_select = await buildCommandSelect(client, interaction)
        // const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(string_select)

        if ('totalPages' in helpData) {
            const components: ActionRowBuilder<any>[] = [row];

            // Add category dropdown
            const categorySelect = buildCategorySelect(interaction.user.id, helpData.availableCategories, CATEGORY_ALL);
            const categoryRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect);
            components.push(categoryRow);

            // Add pagination row if needed
            if (helpData.totalPages > 1) {
                const paginationRow = createPaginationButtons(interaction.user.id, 0, helpData.totalPages);
                components.push(paginationRow);
            }

            const response = await interaction.update({
                embeds: helpData.embeds,
                components: components,
                fetchReply: true
            });

            setupHelpInteractionCollector(response, client, interaction, 0, CATEGORY_ALL);
        } else {
            // Legacy format fallback (should not happen with current code)
            await interaction.update({
                embeds: Array.isArray(helpData) ? helpData : [],
                components: [row],
            });
        }
    },
};

