// src/discord/components/menus/channel-select.ts
import { Client, ChannelSelectMenuInteraction, ChannelType } from 'discord.js';
import { build_paged_embed, get_settings, set_settings, unflattened_settings } from '../../util/settings';

module.exports = {
    data: { name: "channel-select" },
    async execute(client: Client, interaction: ChannelSelectMenuInteraction) {
        if (!interaction.guild) return
        const [action, interaction_owner, key, option] = interaction.customId.split(':');
        const channels = interaction.values

        var flat_obj = { [key]: channels }
        const unflat = unflattened_settings(flat_obj)
        await set_settings(interaction.guild.id, unflat)

        const channel_array: string[] = channels.map((str: string) => `<#${str}>`)
        const channel_string: String = channel_array.join(' ')

        let settings: any;
        try {
            settings = await get_settings(interaction.guildId!);
        } catch (error) {
            await interaction.update('Failed to fetch settings.');
            return;
        }

        const settings_array = Object.entries(settings).map(([key, value]) => ({ key, value }));

        await build_paged_embed(interaction, settings_array, "New Settings");
    },
};