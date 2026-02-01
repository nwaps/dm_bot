import { Client } from 'discord.js';
import { set_settings, get_settings } from '../../util/settings';

module.exports = {
    data: { name: "rape-save" },
    async execute(client: Client, interaction: any) {
        const NAME = interaction.button_var

        const SETTINGS = await get_settings(interaction.guildId)
        const RAPE_SETTINGS = SETTINGS.rape.images[NAME]

        await set_settings(interaction.guildId, { rape: { images: { [NAME]: { config: RAPE_SETTINGS.temp_config } } } })
        try {
            await interaction.update({
                embeds: [{
                    title: `RAPE SAVED`,
                    description: ``,
                    image: { url: interaction.message.embeds[0].image.url },
                    color: 0x00ff00,
                }],
                components: []
            })
            await interaction.message.edit({ attachments: [] })
        } catch (error) { console.log(error) }
    },
};

