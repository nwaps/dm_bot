import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { get_settings, set_settings } from '../../util/settings';
import { rapeUser } from '../../commands/rape';

module.exports = {
    data: { name: "rape-scale" },
    async execute(client: Client, interaction: any) {
        const NAME = interaction.button_var
        if (interaction.passed?.length > 0 && interaction.passed[0] != "back") {
            const [ACTION, DIRECTION, AMOUNT] = interaction.passed
            const back = new ButtonBuilder()
                .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:back`)
                .setEmoji('987468742315352170')
                .setStyle(ButtonStyle.Secondary)

            let row;
            if (ACTION === "targ") {
                const scale_plus5 = new ButtonBuilder()
                    .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:targ:plus:5`)
                    .setLabel('bigger +5')
                    .setStyle(ButtonStyle.Primary)

                const scale_plus20 = new ButtonBuilder()
                    .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:targ:plus:20`)
                    .setLabel('bigger +20')
                    .setStyle(ButtonStyle.Primary)

                const scale_minus5 = new ButtonBuilder()
                    .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:targ:minus:5`)
                    .setLabel('smaller -5')
                    .setStyle(ButtonStyle.Primary)

                const scale_minus20 = new ButtonBuilder()
                    .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:targ:minus:20`)
                    .setLabel('smaller -20')
                    .setStyle(ButtonStyle.Primary)
                row = new ActionRowBuilder<ButtonBuilder>().addComponents(back).addComponents(scale_plus5).addComponents(scale_plus20).addComponents(scale_minus5).addComponents(scale_minus20)
            }
            else if (ACTION === "init") {
                const scale_plus5 = new ButtonBuilder()
                    .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:init:plus:5`)
                    .setLabel('bigger +5')
                    .setStyle(ButtonStyle.Primary)

                const scale_plus20 = new ButtonBuilder()
                    .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:init:plus:20`)
                    .setLabel('bigger +20')
                    .setStyle(ButtonStyle.Primary)

                const scale_minus5 = new ButtonBuilder()
                    .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:init:minus:5`)
                    .setLabel('smaller -5')
                    .setStyle(ButtonStyle.Primary)

                const scale_minus20 = new ButtonBuilder()
                    .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:init:minus:20`)
                    .setLabel('smaller -20')
                    .setStyle(ButtonStyle.Primary)
                row = new ActionRowBuilder<ButtonBuilder>().addComponents(back).addComponents(scale_plus5).addComponents(scale_plus20).addComponents(scale_minus5).addComponents(scale_minus20)
            }

            if (DIRECTION) {
                if (!client.user) throw new Error('Issue with client')
                const SETTINGS = await get_settings(interaction.guildId)
                const RAPE_SETTINGS = SETTINGS.rape.images[NAME]
                const INITIATOR = await interaction.guild.members.fetch(interaction.user.id);
                const BOT = await interaction.guild.members.fetch(client.user.id);

                const axisMapping: Record<string, string[]> = {
                    targ: ['target_scale'],
                    init: ['initiator_scale'],
                };

                const multiplier = DIRECTION === "plus" ? 1 : -1;
                const amount = parseInt(AMOUNT, 10);

                let new_settings: any = { ...RAPE_SETTINGS.temp_config };

                axisMapping[ACTION]?.forEach((key) => {
                    if (key in new_settings) {
                        new_settings[key] += multiplier * amount;
                    }
                });

                let override: any = {
                    name: RAPE_SETTINGS.name,
                    filename: RAPE_SETTINGS.filename,
                    config: new_settings
                };
                set_settings(interaction.guildId, {
                    rape: {
                        images: { [NAME]: { temp_config: new_settings } }
                    }
                })

                const message = `Scaled ${ACTION === "init" ? "Initiator" : "Target"} profile ${amount} pixels ${DIRECTION === "plus" ? "bigger" : "smaller"}}`;

                let new_interaction = await rapeUser(interaction, INITIATOR, BOT, true, override, row)
                const new_text = { ...new_interaction, embeds: [{ ...new_interaction?.embeds[0], title: message, description: `Use the arrow button to return home save this position` }] }
                try {
                    return await interaction.update(new_text)
                } catch (error) { console.log(error) }
            } else {
                try {
                    return await interaction.update({
                        components: [row]
                    })
                } catch (error) { console.log(error) }
            }
        } else {

            const back = new ButtonBuilder()
                .setCustomId(`rape-home:${interaction.user.id}:${NAME}`)
                .setEmoji('987468742315352170')
                .setStyle(ButtonStyle.Secondary)

            const scale_posx = new ButtonBuilder()
                .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:targ`)
                .setLabel('Target')
                .setStyle(ButtonStyle.Primary)

            const scale_posy = new ButtonBuilder()
                .setCustomId(`rape-scale:${interaction.user.id}:${NAME}:init`)
                .setLabel('Initiator')
                .setStyle(ButtonStyle.Primary)

            const row = new ActionRowBuilder().addComponents(back, scale_posx, scale_posy)
            await interaction.update({
                embeds: [{
                    title: `Editing scale (bot pfp)`,
                    description: `X does vertical movement, Y does horizontal`,
                    image: { url: interaction.message.embeds[0].image.url },
                    color: 0x00ff00,
                }],
                components: [row],
            })
            if (interaction.message.attachments) await interaction.message.edit({ attachments: [] })
        }
    },
};

