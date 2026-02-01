import { Client, Events, GuildChannel, GuildMember } from 'discord.js';
import { denyJoinPermissions, getChannelsByBanned, removeVC, updateSettings } from '../util/vcs';

export default {
    name: Events.ChannelDelete,
    async execute(client: Client, deleted_channel: GuildChannel) {
        const channel = global.VCS.get(deleted_channel.guild.id)
        if (channel) {
            removeVC(deleted_channel)
            updateSettings() 
        }
    },
};
