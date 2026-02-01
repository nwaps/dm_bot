import { Client, Events, Message, MessageFlags } from 'discord.js';
import { set_settings } from '../util/settings';
import { LoggedMessage } from '../models/message_history';

export default {
    name: Events.MessageCreate,
    async execute(client: Client, message: Message) {

        if (message.author.bot || !message.guild || message.system) return;
        // message.reply({ content: 'hi', flags: MessageFlags.SuppressNotifications })

        if (!message.guildId) return
        // history for jq log
        const guild_id = message.guildId;
        if (!global.SETTINGS[guild_id]) await set_settings(guild_id, { guild: { lookback: 60 } }) // init settings if not found
        if (!guild_id) return;

        if (!MESSAGES[guild_id]) {
            MESSAGES[guild_id] = [];
        }
        const guild_log = MESSAGES[guild_id];
        const urlOnlyRegex = /^https?:\/\/(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/\S*)?$/

        const sticker_name = message.stickers.size > 0
            ? message.stickers.map(s => s.name)
            : undefined;
        const attach_info = message.attachments.size > 0
            ? message.attachments.map(a => ({
                name: a.name ?? '<no-name>',
                url: a.url
            }))
            : undefined;

        const embed_labels: string[] = []
        if (message.embeds.length > 0) {
            embed_labels.push(
                ...message.embeds.map(e => e.title ?? e.description ?? e.url ?? '<no-name>')
            )
        } else {
            if (urlOnlyRegex.test(message.content)) {
                const rawUrl = message.content.trim()
                const lastSegment = rawUrl.split('/').pop() ?? rawUrl
                const filename = lastSegment.split('?')[0] || '<no-name>'
                embed_labels.push(filename)
            }
        }

        const entry: LoggedMessage = {
            userId: message.author.id,
            content: embed_labels.length > 0 ? '' : message.content,
            messageId: message.id,
            ...(sticker_name && { stickers: sticker_name }),
            ...(embed_labels && { embeds: embed_labels }),
            ...(attach_info && { attachments: attach_info }),
        };
        // console.log(entry)

        guild_log.push(entry);
        const lookback = global.SETTINGS[guild_id].guild.lookback
        if (guild_log.length > Number(lookback)) {
            guild_log.shift();
        }
    },
};
