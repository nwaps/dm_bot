import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { get_settings, set_settings } from '../../util/settings';
import { rapeUser } from '../../commands/rape';

module.exports = {
    data: { name: "rape-target" },
    async execute(client: Client, interaction: any) {
        const NAME = interaction.button_var
        if (interaction.passed?.length > 0 && interaction.passed[0] != "back") {
            const [ACTION, DIRECTION, AMOUNT] = interaction.passed
            const back = new ButtonBuilder()
                .setCustomId(`rape-target:${interaction.user.id}:${NAME}:back`)
                .setEmoji('987468742315352170')
                .setStyle(ButtonStyle.Secondary)

            let row;
            if (ACTION === "x") {
                const target_plus10 = new ButtonBuilder()
                    .setCustomId(`rape-target:${interaction.user.id}:${NAME}:x:plus:10`)
                    .setLabel('Right +10')
                    .setStyle(ButtonStyle.Primary)

                const target_plus50 = new ButtonBuilder()
                    .setCustomId(`rape-target:${interaction.user.id}:${NAME}:x:plus:50`)
                    .setLabel('Right +50')
                    .setStyle(ButtonStyle.Primary)

                const target_minus10 = new ButtonBuilder()
                    .setCustomId(`rape-target:${interaction.user.id}:${NAME}:x:minus:10`)
                    .setLabel('Left -10')
                    .setStyle(ButtonStyle.Primary)

                const target_minus50 = new ButtonBuilder()
                    .setCustomId(`rape-target:${interaction.user.id}:${NAME}:x:minus:50`)
                    .setLabel('Left -50')
                    .setStyle(ButtonStyle.Primary)
                row = new ActionRowBuilder<ButtonBuilder>().addComponents(back, target_plus10, target_plus50, target_minus10, target_minus50)
            }
            else if (ACTION === "y") {
                const target_plus10 = new ButtonBuilder()
                    .setCustomId(`rape-target:${interaction.user.id}:${NAME}:y:plus:10`)
                    .setLabel('Down +10')
                    .setStyle(ButtonStyle.Primary)

                const target_plus50 = new ButtonBuilder()
                    .setCustomId(`rape-target:${interaction.user.id}:${NAME}:y:plus:50`)
                    .setLabel('Down +50')
                    .setStyle(ButtonStyle.Primary)

                const target_minus10 = new ButtonBuilder()
                    .setCustomId(`rape-target:${interaction.user.id}:${NAME}:y:minus:10`)
                    .setLabel('Up -10')
                    .setStyle(ButtonStyle.Primary)

                const target_minus50 = new ButtonBuilder()
                    .setCustomId(`rape-target:${interaction.user.id}:${NAME}:y:minus:50`)
                    .setLabel('Up -50')
                    .setStyle(ButtonStyle.Primary)
                row = new ActionRowBuilder<ButtonBuilder>().addComponents(back, target_plus10, target_plus50, target_minus10, target_minus50)
            }

            if (DIRECTION) {
                if (!client.user) throw new Error('Issue with client')
                const SETTINGS = await get_settings(interaction.guildId)
                const RAPE_SETTINGS = SETTINGS.rape.images[NAME]
                const INITIATOR = await interaction.guild.members.fetch(interaction.user.id);
                const BOT = await interaction.guild.members.fetch(client.user.id);

                const axisMapping: Record<string, string[]> = {
                    x: ['posX_target'],
                    y: ['posY_target'],
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

                type Action = 'x' | 'y';
                type Direction = 'plus' | 'minus';

                const directionText: Record<Action, Record<Direction, string>> = {
                    x: { plus: 'right', minus: 'left' },
                    y: { plus: 'down', minus: 'up' },
                };
                const direct = DIRECTION as Direction
                const act = ACTION as Action
                const message = `Moved Target profile ${amount} pixels ${directionText[act][direct]}`;


                let new_interaction = await rapeUser(interaction, INITIATOR, BOT, true, override, row)
                const new_text = { ...new_interaction, embeds: [{ ...new_interaction?.embeds[0], title: message, description: `Use the arrow button to return home save this position` }] }
                try {
                    return await interaction.update(new_text)
                } catch (error) {
                    console.log(error)
                }
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

            const target_posx = new ButtonBuilder()
                .setCustomId(`rape-target:${interaction.user.id}:${NAME}:x`)
                .setLabel('Left / Right')
                .setStyle(ButtonStyle.Primary)

            const target_posy = new ButtonBuilder()
                .setCustomId(`rape-target:${interaction.user.id}:${NAME}:y`)
                .setLabel('Up / Down')
                .setStyle(ButtonStyle.Primary)

            const row = new ActionRowBuilder().addComponents(back).addComponents(target_posx).addComponents(target_posy)
            try {
                await interaction.update({
                    embeds: [{
                        title: `Editing target (bot pfp)`,
                        description: `X does vertical movement, Y does horizontal`,
                        image: { url: interaction.message.embeds[0].image.url },
                        color: 0x00ff00,
                    }],
                    components: [row],
                })
                if (interaction.message.attachments) await interaction.message.edit({ attachments: [] })
            }
            catch (e) { console.log(e) }
        }
    },
};

