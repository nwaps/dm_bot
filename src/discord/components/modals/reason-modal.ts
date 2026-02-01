import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, MessageFlags } from 'discord.js';

module.exports = {
    data: { name: "reason-modal" },
    async execute(client: Client, interaction: any) {
        const reason_text = interaction.fields.getTextInputValue('reason-text');
        const message_id = interaction.passed[0]
        const log_channel_id = String(global.SETTINGS[interaction.guildId].channels.janny_log)

        const log_channel = await client.channels.fetch(log_channel_id)
        if (!log_channel) { console.log(`Couldn't find log channel in reason-modal`); return interaction.reply(`Error getting log channel`) }
        if (log_channel.type !== ChannelType.GuildText) { console.log(`Log channel wasn't set to a text channel`); return interaction.reply(`Error with log channel`) }

        const log_message = await log_channel.messages.fetch(message_id)
        const embed = EmbedBuilder.from(log_message.embeds[0]);
        const field_index = embed.data.fields?.findIndex(f => f.name === 'Reason:') ?? -1;

        if (field_index >= 0) {
            embed.spliceFields(field_index, 1,
                {
                    name: 'Reason:',
                    value: reason_text,
                    inline: false
                }
            );
        } else {
            embed.addFields({
                name: 'Reason:',
                value: reason_text,
                inline: false
            });
        }
        embed.setColor(0x5c6bc0);

        const button = new ButtonBuilder()
            .setCustomId(`open-reason:${interaction.user.id}:${log_message.id}`)
            .setLabel('Edit reason')
            .setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        log_message.edit({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `Justification recieved. Payment sent.... received: 💎`, flags: MessageFlags.Ephemeral })
    },
};
