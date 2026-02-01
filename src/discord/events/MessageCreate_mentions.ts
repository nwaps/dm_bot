import { Client, Events, Message } from 'discord.js';
import mentionModel from '../models/mentions.js';

export default {
    name: Events.MessageCreate,
    async execute(client: Client, message: Message) {
        if (message.author.bot || !message.guild || message.system) return;

        // Check if message has mentions
        const mentions = message.mentions.users;
        if (mentions.size === 0) return;

        // Process content for files and stickers
        let processedContent = message.content;
        
        // Replace file attachments with [filename]
        if (message.attachments.size > 0) {
            message.attachments.forEach(attachment => {
                processedContent += ` [${attachment.name}]`;
            });
        }

        // Replace stickers with [stickername]
        if (message.stickers.size > 0) {
            message.stickers.forEach(sticker => {
                processedContent += ` [${sticker.name}]`;
            });
        }

        // Track each mention
        const mentionPromises = mentions.map(async (mentionedUser) => {
            // Don't track self-mentions
            if (mentionedUser.id === message.author.id) return;

            const mention = new mentionModel({
                guildId: message.guild!.id,
                channelId: message.channel.id,
                messageId: message.id,
                mentionedUserId: mentionedUser.id,
                mentionedByUserId: message.author.id,
                mentionedByUsername: message.member?.nickname || message.author.displayName,
                mentionContent: `<@${mentionedUser.id}>`,
                timestamp: message.createdAt,
                messageContent: processedContent
            });

            try {
                await mention.save();
            } catch (error) {
                console.error('Error saving mention:', error);
            }
        });

        await Promise.all(mentionPromises);
    },
};