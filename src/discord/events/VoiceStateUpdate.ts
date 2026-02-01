import { Client, Events, GuildChannel, GuildMember, VoiceChannel, VoiceState } from 'discord.js';
import { denyJoinPermissions, getChannelsByBanned, removeVC, updateSettings } from '../util/vcs';

export default {
    name: Events.VoiceStateUpdate,
    async execute(client: Client, old_state: VoiceState, new_state: VoiceState) {
        const guild_channels = global.VCS.get(old_state.guild.id)
        if (guild_channels) {
            if (old_state?.channel) {
                const channel = guild_channels.channels.get(old_state.channel.id)
                if (channel) {
                    const got_channel = await client.channels.fetch(old_state.channel.id) as VoiceChannel
                    if (got_channel.members.size === 0) {
                        removeVC(got_channel)
                        got_channel.delete().catch(e => { return })
                    }
                }
            }
        }

    },
};
