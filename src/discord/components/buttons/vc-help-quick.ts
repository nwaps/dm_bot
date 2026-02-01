// src/discord/components/buttons/vc-help-quick.ts

import { Client, MessageFlags, EmbedBuilder } from 'discord.js';

module.exports = {
    data: { name: "vc-help-quick" },
    async execute(client: Client, interaction: any) {
        const helpEmbed = new EmbedBuilder()
            .setTitle('Voice Channel System Help')
            .setDescription('Here\'s everything you need to know about the custom voice channel system!')
            .addFields([
                {
                    name: 'Getting Started',
                    value: '• Join the home voice channel\n• Click "Create Voice Channel" or use `/create`\n• You\'ll be moved to your new channel automatically',
                    inline: false
                },
                {
                    name: 'Channel Management',
                    value: '• `/edit` - Open the channel settings menu\n• `/ban @user` - Ban users from your channel\n• `/unban @user` - Unban users from your channel\n• `/promote @user` - Give management permissions\n• `/demote @user` - Remove management permissions',
                    inline: false
                },
                // {
                //     name: 'Admin Commands',
                //     value: '• `/adminpromote @user` - Force promote (admin only)\n• `/vc user:@user` - See user\'s channels (mod only)\n• `/vc channel:#channel` - See channel info (mod only)',
                //     inline: false
                // },
                {
                    name: 'Channel Settings',
                    value: '• **Name & Status** - Customize your channel\n• **User Limit** - Set how many people can join\n• **Region** - Choose server region for best quality\n• **Bitrate** - Adjust audio quality\n• **Speak Permissions** - Control who can talk',
                    inline: false
                },
                {
                    name: 'Tips',
                    value: '• Your channel auto-deletes when empty\n• You can have multiple promoted users\n• Banned users can\'t join even if invited\n• Use right-click → Apps → "VC Ban" for quick bans',
                    inline: false
                }
            ])
            .setColor(0x00ffff)
            .setFooter({
                text: 'Voice Channel System • Need more help? Ask a moderator!'
            });

        await interaction.reply({
            embeds: [helpEmbed],
            flags: MessageFlags.Ephemeral
        });
    },
};