import { Client, ContainerBuilder, Role, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import { get_settings } from '../../util/settings';

module.exports = {
    data: { name: "clan-reward" },
    async execute(client: Client, interaction: any) {
        const user_id = interaction.button_var
        const role_id = interaction.passed[0]

        const role = interaction.guild.roles.cache.get(role_id) ?? await interaction.guild.roles.fetch(role_id)
        const member = await interaction.guild.members.fetch(user_id)
        if (!role || !member) return

        const settings = await get_settings(interaction.guild.id)
        const reward_role_ids = settings.roles.clan_rewards
        if (!reward_role_ids) return

        for (const roleId of reward_role_ids) {
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId)
            }
        }

        await member.roles.add(role)

        const container = new ContainerBuilder()
            .setAccentColor(0x10b981)
        const title = new TextDisplayBuilder()
            .setContent(`## Role has been applied`)
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