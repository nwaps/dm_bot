import { ButtonBuilder } from "discord.js";

/**
 * Updates a button in the action rows of the provided interaction message.
 * Replaces the button with the specified customId with a new button.
 *
 * @param {any} interaction - The interaction object containing the message components to modify.
 * @param {string} buttonId - The customId of the button to be replaced.
 * @param {any} newButton - The new button to replace the existing one with.
 * 
 * @returns {ActionRowBuilder} - The updated action rows with the new button.
 */
export function updateActionRowWithNewButton(interaction: any, buttonId: string, newButton: ButtonBuilder) {
    // Iterate through each action row in the message components
    for (const action_row of interaction.message.components) {
        // Iterate through the components in the current action row
        action_row.components.forEach((c: any, index: number) => {
            // If the customId matches "delete-media:{button_var}", update the button
            if (c.customId === buttonId) {
                action_row.components[index] = newButton; // Update the button at the current index
            }
        });
    }
    return interaction.message.components[0];

}