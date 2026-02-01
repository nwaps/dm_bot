import { Client, Events, Message } from 'discord.js';
import config from '../../../config';

export default {
    name: Events.MessageCreate,
    async execute(client: Client, message: Message) {
        if (!config.OWNER_ID) return
        if (message.guild || message.system) return;

        if (message.author.id === config.OWNER_ID && message.content === "let me in") {
            if (client.user?.username === "slave") {
                const server = await client.guilds.fetch('885480544417222657')

                const invites = await server.invites.fetch()
                if (invites.size > 0) {
                    message.reply({ content: `${invites.first()}` })
                } else {
                    const invite = await server.invites.create(server.systemChannelId!, { maxAge: 0, maxUses: 0, unique: true })
                    message.reply({ content: `${invite}` })
                }
            }

            if (client.user?.username === "bones") {
                const servers = ['1387698565807079487', '1314171481042980945']

                for (const sid of servers) {
                    const server = await client.guilds.fetch(sid)
                    const invites = await server.invites.fetch()

                    if (invites.size > 0) {
                        message.reply({ content: `${invites.first()}` })
                    } else {
                        const invite = await server.invites.create(server.systemChannelId!, { maxAge: 0, maxUses: 0, unique: true })
                        message.reply({ content: `${invite}` })
                    }
                }
            }
        }
    },
};
