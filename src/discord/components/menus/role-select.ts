import { ChannelType, Client, RoleSelectMenuInteraction } from 'discord.js';
import { set_settings, unflattened_settings } from '../../util/settings';

module.exports = {
    data: { name: "role-select" },
    async execute(client: Client, interaction: RoleSelectMenuInteraction) {
        if(!interaction.guild) return
        const [action, argument, option] = interaction.customId.split(':');
        const roles = interaction.values
        
        var flat_obj = { [option]: roles }
        const unflat = unflattened_settings(flat_obj)
        await set_settings(interaction.guild.id, unflat)

        const role_array: string[] = roles.map((str:string) => `<@&${str}>`)
        const role_string:String = role_array.join(' ')

        await interaction.update({
            embeds: [
                {
                    title: `You have updated the channel options in ${interaction.guild}`,
                    description: `${option} is now set to ${role_string}`,
                    color: 0x00ffff,
                },
            ],
        });
    },
};