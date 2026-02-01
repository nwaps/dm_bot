import { Client, Events, Message } from 'discord.js';
import { get_settings } from '../util/settings';
import { check_level } from '../util/permissions';
import { commandRateLimiter } from '../util/command-rate-limiter';

export default {
    name: Events.MessageCreate,
    async execute(client: Client, message: Message) {
        if (message.author.bot || !message.guild || message.system) return;

        // command handler
        const settings = await get_settings(message.guildId);
        if (!settings.guild.prefix) return
        if (message.content.indexOf(settings.guild.prefix) !== 0) return
        const args = message.content.slice(settings.guild.prefix.length).trim().split(/ +/g)
        const command = args.shift()?.toLowerCase()
        if (!command) return

        if (message.guild && !message.member) await message.guild.members.fetch(message.author)
        const level = await check_level(message)
        const cmd = client.commands.get(command) || client.aliases.get(command)

        if (!cmd) return
        if (cmd && !message.guild) return

        if (level < cmd.require_perm) return //message.reply(`You don't have the permissions to run this command`)

        // Check rate limiting
        const rateLimitCheck = await commandRateLimiter.checkRateLimit(
            message.author.id,
            message.guildId!,
            command,
            level
        );

        if (!rateLimitCheck.allowed) {
            if (rateLimitCheck.embed) {
                try {
                    await message.author.send({ embeds: [rateLimitCheck.embed] });
                } catch (error) {
                    try{
                        message.react('⏲️')
                    }catch{
                        console.error(`${message.author.username}(${message.author.id}) has the bot blocked`)
                    }
                    console.error(`Failed to send rate limit message to ${message.author.username}(${message.author.id})}`);
                }
            }
            return;
        }

        message.level = level
        message.args = []
        if (args && args.length > 0) {
            message.args.push(...args)
        }
        message.user = message.author

        // Record command usage for rate limiting
        await commandRateLimiter.recordCommandUsage(message.author.id, message.guildId!, command);

        await cmd.execute(client, message)
        console.log(`Prefix command: running ${cmd.data.name} for ${message.member?.nickname ?? message.author.username} ${args ? args : ""}`)

        // Gather role IDs.
        // const roles = message.member?.roles.cache.map((role: any) => role.id) || [];
    },
};
