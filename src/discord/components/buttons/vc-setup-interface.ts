import { Client, ChannelType, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder } from 'discord.js';
import { addProtectedMessage } from '../../util/protected-messages';

module.exports = {
    data: { name: "vc-setup-interface" },
    async execute(client: Client, interaction: any) {
        if (!interaction.guild) return;

        try {
            const [, , channelId] = interaction.customId.split(':');
            const voiceChannel = await interaction.guild.channels.fetch(channelId);

            if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
                return await interaction.update({
                    embeds: [{
                        title: 'Error',
                        description: 'The voice channel could not be found.',
                        color: 0xef4444
                    }],
                    components: []
                });
            }

            // Voice channels have built-in text channels, so we can send directly to the voice channel
            const textChannel = voiceChannel;

            // Create the user interface message
            const createButton = new ButtonBuilder()
                .setCustomId(`vc-create-quick`)
                .setLabel('Create VC')
                .setStyle(ButtonStyle.Primary);

            const helpButton = new ButtonBuilder()
                .setCustomId(`vc-help-quick`)
                .setLabel('Help & Commands')
                .setStyle(ButtonStyle.Secondary);

            const interfaceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(createButton, helpButton);

            const interfaceEmbed = new EmbedBuilder()
                .setTitle('Custom Voice Channels')
                .setDescription(`Welcome to the voice channel system!\n\n**How to use:**\n• Join this voice channel and click the button below to create your own voice channel\n• Use \`/create\` while in this channel for advanced options\n• Manage your channel with commands like \`/ban\`, \`/promote\`, \`/edit\`\n\n**Quick Create:**`)
                .setColor(0x6f96d1)
                .setFooter({
                    text: 'Voice Channel System • Join this channel to get started'
                });

            // Send the interface message to the voice channel's built-in text chat
            const interfaceMessage = await textChannel.send({
                embeds: [interfaceEmbed],
                components: [interfaceRow]
            });

            // PROTECT THE INTERFACE MESSAGE FROM AUTODELETE
            await addProtectedMessage(textChannel.id, interfaceMessage.id);

            // Pin the message (can't pin in side channels)
            try {
                await interfaceMessage.pin();
            } catch (error) {
                console.log('Could not pin message - missing permissions, pin limit reached or is in text side channel');
            }

            // Update the setup interaction
            await interaction.update({
                embeds: [{
                    title: 'Voice Channel System Setup Complete!',
                    description: `**Home Voice Channel:** ${voiceChannel}\n**Interface Posted In:** Voice channel's built-in text chat\n**Interface Message:** [Click here](${interfaceMessage.url})\n\nThe system is now ready for use! Users can join the home voice channel and use the interface to create their own channels.`,
                    color: 0x10b981,
                    footer: {
                        text: 'Setup completed successfully'
                    }
                }],
                components: []
            });

        } catch (error) {
            console.error('Error setting up VC interface:', error);
            await interaction.update({
                embeds: [{
                    title: 'Setup Error',
                    description: 'An error occurred while setting up the user interface. Please check permissions and try again.',
                    color: 0xef4444
                }],
                components: []
            });
        }
    },
};