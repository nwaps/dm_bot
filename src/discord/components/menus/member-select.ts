import { Client, ActionRowBuilder, MentionableSelectMenuBuilder } from 'discord.js';

module.exports = {
    data: { name: "member-select" },
    async execute(client: Client, interaction: any) {
        const selectMenu = new MentionableSelectMenuBuilder()
                .setCustomId('member-select')
                .setPlaceholder('Choose a member')

        // const new_level = interaction.values[0]
        
        // const current_level = await manageSecurityLevel(new_level);
        var row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.update({
            embeds: [
                {
                    title: `You have updated the member options`,
                    description: `Thanks!`,
                    color: 0x00ffff,
                },
            ],
            components: [row],
        });
    },
};