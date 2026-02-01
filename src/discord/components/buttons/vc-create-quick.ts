// src/discord/components/buttons/vc-create-quick.ts

import { Client, MessageFlags, ChannelType, PermissionFlagsBits, VoiceChannel, ButtonBuilder, ButtonStyle, ActionRowBuilder, VideoQualityMode } from 'discord.js';
import { createVC, updateSettings, findNextChannelPositionFromHome, sanitizeString } from '../../util/vcs';
import { addProtectedMessage } from '../../util/protected-messages';

const OWNER_BITFIELD =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.Connect |
    PermissionFlagsBits.SendMessages |
    PermissionFlagsBits.UseApplicationCommands

module.exports = {
    data: { name: "vc-create-quick" },
    async execute(client: Client, interaction: any) {
        try {
            if (!interaction.guild) throw new Error(`Not a guild interaction`);

            const homeVcId = String(global.SETTINGS[interaction.guild.id].channels.vc_home[0])
            const initiator = await interaction.guild.members.cache.get(interaction.user.id) ?? await interaction.guild.members.fetch(interaction.user.id);
            const home_vc = await interaction.guild.channels.cache.get(homeVcId) ?? await interaction.guild.channels.fetch(homeVcId);

            if (!home_vc || home_vc.type !== ChannelType.GuildVoice) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Setup Error',
                        description: 'The home voice channel is not properly configured. Please contact an administrator.',
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if user is in the home voice channel
            if (!initiator.voice?.channel || initiator.voice.channel.id !== home_vc.id) {
                return await interaction.reply({
                    embeds: [{
                        title: 'Join Home Channel',
                        description: `You must be in ${home_vc} to create a custom voice channel.`,
                        color: 0xff0000
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Create the voice channel
            const permissionOverwrites = home_vc.permissionOverwrites.cache;
            const overwrites = permissionOverwrites.map((overwrite: any) => ({
                id: overwrite.id,
                allow: overwrite.allow.bitfield,
                deny: overwrite.deny.bitfield,
            }));
            overwrites.push({
                id: initiator.id,
                allow: OWNER_BITFIELD,
                deny: BigInt(0),
            });

            const channel_name = `${initiator.nickname ?? initiator.user.username}'s voice channel`;
            const sanitized_name = sanitizeString(channel_name);
            const position = await findNextChannelPositionFromHome(interaction, home_vc);

            console.log(`Quick creating channel ${sanitized_name} for ${interaction.user.username}`);

            const new_channel = await interaction.guild.channels.create({
                name: sanitized_name,
                type: ChannelType.GuildVoice,
                videoQualityMode: VideoQualityMode.Full,
                position: position,
                permissionOverwrites: overwrites,
                parent: home_vc.parent,
                nsfw: true
            });

            // Setup autodelete and database entry
            const autodelete_bot = global.SETTINGS[interaction.guildId!].guild.autodelete_bot ?? client.user?.id;
            const autodelete = await new_channel.send(`<@${autodelete_bot}> setup 7m 12`);

            // Create control panel message with buttons
            const editButton = new ButtonBuilder()
                .setCustomId(`vc-edit-quick`)
                .setLabel('Edit Channel')
                .setStyle(ButtonStyle.Primary);

            const bumpButton = new ButtonBuilder()
                .setCustomId(`vc-bump-quick`)
                .setLabel('Bump Channel')
                .setStyle(ButtonStyle.Secondary);

            const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(editButton, bumpButton);

            const controlPanel = await new_channel.send({
                embeds: [{
                    title: 'Voice Channel Controls',
                    description: `**Edit Channel** - Customize settings (owner/promoted only)\n**Bump Channel** - Move to top of list (anyone in channel)\n\n*Note: Bump has a 5-minute cooldown*`,
                    color: 0x6f96d1,
                    footer: {
                        text: 'Voice Channel System'
                    }
                }],
                components: [controlRow]
            });

            // Protect the control panel from autodelete
            await addProtectedMessage(new_channel.id, controlPanel.id);

            // const noticeMessage = await new_channel.send({
            //     content: `<@${interaction.user.id}>`,
            //     embeds: [{
            //         title: `Your Voice Channel is Ready!`,
            //         description: `Welcome to your custom voice channel!\n\n**Quick Commands:**\n• \`/edit\` - Customize your channel settings\n• \`/ban @user\` - Ban users from your channel\n• \`/promote @user\` - Give others management permissions\n\n**Note:** Due to Discord limitations, use the commands above to edit your channel settings.`,
            //         color: 0x00ff00
            //     }]
            // });

            // Clean up the autodelete message after 5 seconds
            setTimeout(() => {
                autodelete.delete().catch(() => { });
            }, 5000);

            const new_vc = await createVC(interaction, new_channel, autodelete);
            updateSettings();

            // Move user to the new channel
            initiator.voice.setChannel(new_channel).catch((e: any) =>
                console.error(`Couldn't move user to new channel: ${e}`)
            );

            return await interaction.reply({
                embeds: [{
                    title: 'Voice Channel Created!',
                    description: `Your voice channel has been created: ${new_vc.autodelete_link}\n\nYou've been moved to your new channel!`,
                    color: 0x00ff00
                }],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('Error in vc-create-quick:', error);
            // return await interaction.reply({
            //     embeds: [{
            //         title: 'Creation Failed',
            //         description: 'Failed to create your voice channel. Please try again or contact an administrator.',
            //         color: 0xff0000
            //     }],
            //     flags: MessageFlags.Ephemeral
            // });
        }
    },
};

