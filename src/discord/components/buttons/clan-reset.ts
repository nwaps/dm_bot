import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, Role, ContainerBuilder, TextDisplayBuilder, SeparatorSpacingSize, SeparatorBuilder } from 'discord.js';
import { buildMetaEmbed } from '../../util/help';
import { get_settings } from '../../util/settings';

module.exports = {
    data: { name: "clan-reset" },
    async execute(client: Client, interaction: any) {
        const user_id = interaction.button_var

        const member = await interaction.guild.members.fetch(user_id)
        if (!member) return

        const settings = await get_settings(interaction.guild.id)
        const reward_role_ids = settings.roles.clan_rewards
        if (!reward_role_ids) return

        for (const roleId of reward_role_ids) {
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId)
            }
        }

        const container = new ContainerBuilder()
            .setAccentColor(0x10b981)
        const title = new TextDisplayBuilder()
            .setContent(`## Roles have been reset`)
        container.addTextDisplayComponents(title)
        const small_separator = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        container.addSeparatorComponents(small_separator)

        const blurb = new TextDisplayBuilder()
            .setContent(`### __Loading screen tips:__\nYou can **boost the server** for a custom number\nDo */help* to see all **commands**, **server meta info** and **rules**`)
        container.addTextDisplayComponents(blurb)


        await interaction.update({
            components: [container]
        })

    },
};

