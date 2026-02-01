import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

module.exports = {
    data: { name: "avatar-server" },
    async execute(client: Client, interaction: any) {
        const USER_ID = interaction.button_var

        const TARGET_MEMBER = await interaction.guild.members.cache.get(USER_ID) ?? await interaction.guild.members.fetch(USER_ID);
        const PFP = TARGET_MEMBER.displayAvatarURL({ size: 4096 });

        const server_avatar = new ButtonBuilder()
            .setCustomId(`avatar-server:${interaction.user.id}:${USER_ID}`)
            .setLabel("Server")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        const global_avatar = new ButtonBuilder()
            .setCustomId(`avatar-global:${interaction.user.id}:${USER_ID}`)
            .setLabel('Global')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(false)

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

