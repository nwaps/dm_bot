import { Client, PermissionFlagsBits, VoiceBasedChannel } from 'discord.js';
import { updateSpeakButtonState } from '../../util/vcs';

module.exports = {
    data: { name: "vc-edit-speak" },
    async execute(client: Client, interaction: any) {
        const channelId = interaction.channelId
        const channel = interaction.guild.channels.cache.get(channelId) as VoiceBasedChannel ?? await interaction.guild.channels.fetch(channelId) as VoiceBasedChannel

        const everyoneRole = interaction.guild.roles.everyone;
        const overwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);

        let currentSpeak;
        if(overwrite?.allow.has(PermissionFlagsBits.Speak)) currentSpeak = true
        else if(overwrite?.deny.has(PermissionFlagsBits.Speak)) currentSpeak = false
        else currentSpeak = false


        channel.permissionOverwrites.edit(everyoneRole, {
            Speak: !currentSpeak,
        });

        await updateSpeakButtonState(interaction.message.components, !currentSpeak)

        await interaction.update({ components: interaction.message.components });
    },
};