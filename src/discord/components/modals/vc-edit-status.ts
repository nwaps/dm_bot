import { Client } from 'discord.js';
import axios from 'axios';
import config from '../../../../config';
import { sanitizeString } from '../../util/vcs';
const token = config.DISCORD_TOKEN
const headers = {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json'
};
module.exports = {
    data: { name: "vc-edit-status" },
    async execute(client: Client, interaction: any) {
        const channelId = interaction.channelId
        const channel = interaction.guild.channels.cache.get(channelId) ?? await interaction.guild.channels.fetch(channelId)
        const new_name = await interaction.fields.getTextInputValue(`vc-edit-status`);

        const sanitized_name = sanitizeString(new_name);

        const endpoint = `https://discord.com/api/v9/channels/${channel.id}/voice-status`;
        const data = {
            status: sanitized_name
        };
        axios.put(endpoint, data, { headers })
            .then(response => {
                interaction.update({})
            })
            .catch(error => {
                console.error('Error:', error.response?.data || error.message);
            });
    },
};
