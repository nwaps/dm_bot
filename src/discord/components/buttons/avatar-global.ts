import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

module.exports = {
    data: { name: "avatar-global" },
    async execute(client: Client, interaction: any) {
        const USER_ID = interaction.button_var

        const TARGET_USER = await client.users.cache.get(USER_ID) ?? await client.users.fetch(USER_ID);
        const PFP = TARGET_USER.avatarURL({ size: 4096 });

        const server_avatar = new ButtonBuilder()
            .setCustomId(`avatar-server:${interaction.user.id}:${USER_ID}`)
            .setLabel("Server")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false)
        const global_avatar = new ButtonBuilder()
            .setCustomId(`avatar-global:${interaction.user.id}:${USER_ID}`)
            .setLabel('Global')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(server_avatar, global_avatar)

        await interaction.update({
            embeds: [{
                title: `Global avatar`,
                description: ``,
                image: { url: PFP },
                color: 0x5c6bc0,
            }],
            components: [buttons]
        });
    },
};

