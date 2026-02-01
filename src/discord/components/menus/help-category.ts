import { Client, StringSelectMenuInteraction } from 'discord.js';

module.exports = {
    data: { name: "help_category" },
    async execute(client: Client, interaction: StringSelectMenuInteraction) {
        // This interaction is handled by the collector in setupHelpInteractionCollector
        // But if it somehow routes here, just defer to prevent errors
        await interaction.deferUpdate();
    }
};
