import settings_model, { complex_setting, guild_setting } from "../models/settings";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, ButtonInteraction, MessageFlags } from "discord.js";
import { mergeWith, merge } from 'lodash'; // npm install --save-dev @types/lodash
import { client } from "../bot";

const ITEMS_PER_PAGE = 5;

interface DefaultSettings {
    roles: {
        admin: string[] | null;
        member: string[] | null;
        lq: string[] | null;
        chud: string[] | null;
        autorole: string[] | null;
        clan_rewards: string[] | null;
    };
    channels: {
        monoko: string | null;
        vc_home: string | null;
        janny_log: string | null,
    };
    webhooks: {
        url: string | null;
    };
    server: {
        outgoing: boolean;
        incoming: boolean;
    };
    rape: {
        images: {
            [key: string]: {
                name: string;
                filename: string;
                config: {
                    posX_initiator: number,
                    posY_initiator: number,
                    posX_target: number,
                    posY_target: number,
                    initiator_scale: number,
                    target_scale: number
                };
                temp_config: {}
            }
        },
        phrases: { [key: string]: { name: string, phrase: string, theme: string } }
    },
    guild: { prefix: string | null, lookback: number, jq_delete: number, autodelete_bot: string | null}
}

const defaultSettings: DefaultSettings = {
    roles: {
        admin: null,
        member: null,
        lq: null,
        chud: null,
        autorole: null,
        clan_rewards: null
    },
    channels: {
        monoko: null,
        vc_home: null,
        janny_log: null,
    },
    webhooks: {
        url: null,
    },
    server: {
        outgoing: true,
        incoming: true
    },
    rape: { images: {}, phrases: {} },
    guild: { prefix: null, lookback: 60, jq_delete: 0, autodelete_bot: null}
};

function flatten_settings(obj: any, prefix = ''): Record<string, string> {
    let items: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (Array.isArray(value)) {
            // Format string arrays in a friendly way.
            items[newKey] = value.join(', ');
        } else if (typeof value === 'object' && value !== null) {
            // Recursive call to flatten nested objects
            items = { ...items, ...flatten_settings(value, newKey) };
        } else {
            items[newKey] = value ? value.toString() : '';
        }
    }

    return items;
}


function unflattened_settings(flatObject: { [key: string]: any }): { [key: string]: any } {
    const result: { [key: string]: any } = {};

    for (const key in flatObject) {
        if (flatObject.hasOwnProperty(key)) {
            const value = flatObject[key];
            const keys = key.split('.');

            keys.reduce((acc, part, index) => {
                if (index === keys.length - 1) {
                    acc[part] = value;
                } else {
                    if (!acc[part]) {
                        acc[part] = {};
                    }
                    return acc[part];
                }
            }, result);
        }
    }

    return result;
}


function create_embed_for_page(settings: Array<{ key: string; value: any }>, page: number, banner_override?: string): EmbedBuilder {
    var banner_string = "Server Settings - Page "
    if (banner_override) banner_string = banner_override + "Page "

    const embed = new EmbedBuilder()
        .setTitle(`${banner_override} ${page + 1}`)
        .setColor('#0099ff')
        .setTimestamp()
        .setFooter({ text: 'Settings' });

    // get number of embeds for page
    const start = page * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, settings.length);

    // ddd fields to current page
    for (let i = start; i < end; i++) {
        const { key, value } = settings[i];

        // Format the value depending on its type
        let displayValue: string;
        if (typeof value === 'object' && value !== null) {
            // Handle nested objects (roles and channels)
            if (key === 'roles') {
                displayValue = Object.entries(value)
                    .map(([subKey, subValue]) => {
                        if (Array.isArray(subValue)) {
                            const formattedArray = subValue.map(val => `<@&${val}>`).join(', ');
                            return `${subKey} = ${formattedArray}`;
                        }
                        return subValue ? `${subKey} = <@&${subValue}>` : `${subKey} = None`;
                    }).join('\n');
            } else if (key === 'channels') {
                displayValue = Object.entries(value)
                    .map(([subKey, subValue]) => {
                        if (Array.isArray(subValue)) {
                            const formattedArray = subValue.map(val => `<#${val}>`).join(', ');
                            return `${subKey} = ${formattedArray}`;
                        }
                        return subValue ? `${subKey} = <#${subValue}>` : `${subKey} = None`;
                    }).join('\n');
            } else if (key === 'webhooks') {
                displayValue = Object.entries(value)
                    .map(([subKey, subValue]) => {
                        if (Array.isArray(subValue)) {
                            const formattedArray = subValue.map(() => 'Hidden').join(', ');
                            return `${subKey} = ${formattedArray}`;
                        }
                        return subValue ? `${subKey} = Hidden` : `${subKey} = None`;
                    }).join('\n');
            } else {
                displayValue = Object.entries(value)
                    .map(([subKey, subValue]) => {
                        if (Array.isArray(subValue)) {
                            const formattedArray = subValue.map(val => `${val}`).join(', ');
                            return `${subKey} = ${formattedArray}`;
                        }
                        return subValue ? `${subKey} = ${subValue}` : `${subKey} = None`;
                    }).join('\n');
            }

        } else {
            displayValue = value ? value.toString() : 'None';
        }

        embed.addFields({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            value: displayValue,
        });
    }

    return embed;
}

async function build_paged_embed(interaction: any, settings: Array<{ key: string; value: any }>, banner_override?: string): Promise<void> {
    const total_pages = Math.ceil(settings.length / ITEMS_PER_PAGE);
    var banner_string = "Server Settings - Page "
    if (banner_override) banner_string = `${banner_override} - Page`

    // craate the next / prev buttons
    let current_page = 0;
    let embed = create_embed_for_page(settings, current_page, banner_string);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`prev_page:${interaction.user.id}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(current_page === 0),
            new ButtonBuilder()
                .setCustomId(`next_page:${interaction.user.id}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(total_pages <= 1)
        );

    let message = interaction
    try {
        message = await interaction.update({
            embeds: [embed],
            components: [row],
            withReponse: true
        }) as Message;
    } catch (err) {

        message = await interaction.reply({
            embeds: [embed],
            components: [row],
            withReponse: true
        }) as Message;
    }

    // handle button interactions
    const filter = (i: any) => i.customId === `prev_page:${interaction.user.id}` || i.customId === `next_page:${interaction.user.id}`;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (i: ButtonInteraction) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'This is not your interaction. Run the command yourself', flags: MessageFlags.Ephemeral });
        }
        const [button, user_id] = i.customId.split(':');

        if (button === `next_page`) {
            current_page = Math.min(current_page + 1, total_pages - 1);
        } else if (button === 'prev_page') {
            current_page = Math.max(current_page - 1, 0);
        }

        embed = create_embed_for_page(settings, current_page, banner_string);
        const next_row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`prev_page:${interaction.user.id}`)
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current_page === 0),
                new ButtonBuilder()
                    .setCustomId(`next_page:${interaction.user.id}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current_page >= total_pages - 1)
            );

        await i.update({
            embeds: [embed],
            components: [next_row]
        });
    });

    collector.on('end', () => {
        // Disable buttons after the collector ends
        message.edit({
            components: [
                new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`prev_page:${interaction.user.id}`)
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`next_page:${interaction.user.id}`)
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true)
                    )
            ]
        });
    });
}

async function get_settings(guildId: string | null) {
    try {
        // get current settings by guild id
        const settingsDoc = await settings_model.findOne({ guildId });

        // merge settings with defaults and return
        if (settingsDoc && settingsDoc.settings) {
            return merge({}, defaultSettings, settingsDoc.settings);
        }

        // no settings exist, return all defualts 
        return defaultSettings;
    } catch (error) {
        console.error('Error fetching settings:', error);
        throw error;
    }
}


async function get_all_settings() {
    const allSettings = await settings_model.find({});
    return allSettings;
}


async function set_settings(guildId: string, new_settings: complex_setting) {
    const settings = await get_settings(guildId)

    new_settings = mergeWith(settings, new_settings, (objValue: string, srcValue: string) => {
        if (Array.isArray(objValue)) return srcValue;
    });

    global.SETTINGS[guildId] = new_settings as guild_setting

    await settings_model.findOneAndUpdate(
        { guildId },
        { settings: new_settings },
        { upsert: true, new: true }
    );
}

export { set_settings, get_settings, get_all_settings, build_paged_embed, flatten_settings, unflattened_settings };