import {
    BaseGuildTextChannel,
    BaseGuildVoiceChannel,
    ChannelType,
    ChatInputCommandInteraction,
    Collection,
    GuildBasedChannel,
    GuildChannel,
    GuildMember,
    Message,
    MessageFlags,
    NonThreadGuildBasedChannel,
    VoiceBasedChannel,
    VoiceChannel
} from 'discord.js';
import vc_model, { ChannelSettings, VcSettings } from '../models/vc_channel';

import { addProtectedMessage } from './protected-messages';
import { client } from '../bot';

import config from '../../../config';

export async function protectVCMessage(channelId: string, messageId: string): Promise<boolean> {
    return await addProtectedMessage(channelId, messageId);
}

export async function pgFetchCombinedUserChannels(userId: string) {
    const query = `SELECT * FROM user_made_vc WHERE user_id = $1 OR $1 = ANY(promoted_users)`;
    return null
}

export async function pgDemoteUser(channelId: string, userIdToRemove: string): Promise<boolean> {
    const query = `
        UPDATE user_made_vc
        SET promoted_users = array_remove(promoted_users, $1)
        WHERE channel_id = $2 AND $1 = ANY(promoted_users)
    `;
    try {

        // Ensure that result and rowCount are both not null or undefined
        return false
    } catch (error) {
        console.error('Error removing promoted user:', error);
        return false; // Return false in case of any errors
    }
}
export async function updateSettings() {
    try {
        const guildsMap: Map<string, VcSettings> = new Map();
        const allVCS = await vc_model.find({}).lean();

        if (allVCS.length === 0) console.log("No data found in the database.");

        allVCS.forEach((vc) => {
            const guildId = vc.guildId;
            const channelsMap: Map<string, ChannelSettings> = new Map();

            Object.keys(vc.channels).forEach((channelId) => {
                channelsMap.set(channelId, vc.channels[channelId]);
            });

            guildsMap.set(guildId, { channels: channelsMap });
        });

        global.VCS = guildsMap;
    } catch (error) {
        console.error("Error updating settings:", error);
    }
}

export function getChannelsByOwnerOrPromoted(vcs: VcSettings, user_id: string) {
    const result: Map<string, ChannelSettings> = new Map();

    vcs.channels.forEach((channel, id) => {
        if (
            channel.owner?.includes(user_id) ||
            channel.promoted?.includes(user_id)
        ) {
            result.set(id, channel);
        }
    });

    return result;
}

export function getChannelsByBanned(vcs: VcSettings, user_id: string) {
    const result: Map<string, ChannelSettings> = new Map();

    vcs.channels.forEach((channel, id) => {
        if (
            channel.banned?.includes(user_id)
        ) {
            result.set(id, channel);
        }
    });

    return result;
}

export async function removeVC(channel: GuildChannel) {
    if (!channel) return console.error("not a valid channel");
    if (!channel.guild) return console.error("not a valid guild");

    const removed_vc = vc_model.findOneAndUpdate(
        { guildId: channel.guild.id },
        {
            $unset: { // Remove the 'channels' map entry for the given channel
                [`channels.${channel.id}`]: ""
            }
        }
    );

    return removed_vc;
}

export async function createVC(interaction: ChatInputCommandInteraction | Message, channel: VoiceChannel, autodelete: Message): Promise<any> {
    if (!interaction) return console.error("not a valid interaction")
    if (!interaction.guild) return console.error("not a valid guild")
    if (!interaction.channel) return console.error("not a valid channel")

    const autodelete_link = `https://discord.com/channels/${interaction.guild.id}/${channel.id}/${autodelete.id}`

    const channelData = {
        owner: [interaction.user.id],
        autodelete_link: autodelete_link
    };

    await vc_model.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
            $set: {
                [`channels.${channel.id}.owner`]: channelData.owner,
                [`channels.${channel.id}.autodelete_link`]: channelData.autodelete_link,
            }
        },
        { upsert: true }
    );

    return channelData;
}

// Role-based ban/unban/promote/demote functions
export async function banRole(interaction: ChatInputCommandInteraction | Message, channel: VoiceBasedChannel, roleIds: string[]) {
    if (!interaction) return console.error("not a valid interaction")
    if (!interaction.guild) return console.error("not a valid guild")
    const updated_vc = vc_model.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
            $addToSet: { [`channels.${channel.id}.banned_roles`]: { $each: roleIds } }
        },
        { upsert: true, new: true }
    );
    
    // Apply role-based permission denials
    denyJoinPermissionsForRoles(interaction, channel.id, roleIds)
    return updated_vc;
}

export async function unbanRole(interaction: ChatInputCommandInteraction | Message, channel: VoiceBasedChannel, roleIds: string[]) {
    if (!interaction) return console.error("not a valid interaction")
    if (!interaction.guild) return console.error("not a valid guild")
    const updated_vc = vc_model.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
            $pull: { [`channels.${channel.id}.banned_roles`]: { $in: roleIds } }
        },
        { upsert: true, new: true }
    );
    
    // Remove role-based permission denials
    allowJoinPermissionsForRoles(interaction, channel.id, roleIds)
    return updated_vc;
}

export async function banUser(interaction: ChatInputCommandInteraction | Message, channel: VoiceBasedChannel, userIds: string[]) {
    if (!interaction) return console.error("not a valid interaction")
    if (!interaction.guild) return console.error("not a valid guild")
    const updated_vc = vc_model.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
            $addToSet: { [`channels.${channel.id}.banned`]: { $each: userIds } }
        },
        { upsert: true, new: true } // `upsert: true` will create the document if it doesn't exist
    );
    // console.log(updated_vc)
    denyJoinPermissions(interaction, channel.id, userIds)
    return updated_vc;
}

// Check if user_id is present in the owner or promoted arrays
export async function unbanUser(interaction: ChatInputCommandInteraction | Message, channel: VoiceBasedChannel, userIds: string[]) {
    if (!interaction) return console.error("not a valid interaction")
    if (!interaction.guild) return console.error("not a valid guild")
    const updated_vc = vc_model.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
            $pull: { [`channels.${channel.id}.banned`]: { $in: userIds } }
        },
        { upsert: true, new: true } // `upsert: true` will create the document if it doesn't exist
    );
    // console.log(updated_vc)
    allowJoinPermissions(interaction, channel.id, userIds)
    return updated_vc;
}

export async function promoteUser(interaction: ChatInputCommandInteraction | Message, channel: VoiceBasedChannel, userIds: string[]) {
    if (!interaction) return console.error("not a valid interaction")
    if (!interaction.guild) return console.error("not a valid guild")
    const promoted_users = vc_model.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
            $addToSet: { [`channels.${channel.id}.promoted`]: { $each: userIds } }
        },
        { upsert: true, new: true } // `upsert: true` will create the document if it doesn't exist
    );
    // givePromotedPermissions(interaction, channel.id, userIds)
    return promoted_users;
}

export async function demoteUser(interaction: ChatInputCommandInteraction | Message, channel: VoiceBasedChannel, userIds: string[]) {
    if (!interaction) return console.error("not a valid interaction")
    if (!interaction.guild) return console.error("not a valid guild")
    const promoted_users = vc_model.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
            $pull: { [`channels.${channel.id}.promoted`]: { $in: userIds } }
        },
        { upsert: true, new: true } // `upsert: true` will create the document if it doesn't exist
    );
    // removePromotedPermissions(interaction, channel.id, userIds)
    return promoted_users;
}

// Role-based permission functions
export async function denyJoinPermissionsForRoles(interaction: ChatInputCommandInteraction | Message | GuildMember, channel_id: string, role_ids: string[]) {
    try {
        const channel = await interaction.guild?.channels.fetch(channel_id);
        if (!channel || !(channel instanceof VoiceChannel)) throw new Error(`Channel not found or not a voice channel: ${channel}`);
        
        for (const role_id of role_ids) {
            const permissions = channel.permissionOverwrites.cache.get(role_id);
            if (permissions) await permissions.edit({ Connect: false });
            else await channel.permissionOverwrites.create(role_id, { Connect: false });
        }
    } catch (error) {
        console.error('Error denying join permissions for roles:', error);
    }
}

export async function allowJoinPermissionsForRoles(interaction: ChatInputCommandInteraction | Message, channel_id: string, role_ids: string[]) {
    try {
        const channel = await interaction.guild?.channels.fetch(channel_id);
        if (!channel || !(channel instanceof VoiceChannel)) throw new Error(`Channel not found or not a voice channel: ${channel}`);
        
        for (const role_id of role_ids) {
            const permissions = channel.permissionOverwrites.cache.get(role_id);
            // Remove the permission override instead of explicitly allowing
            if (permissions) await permissions.delete();
        }
    } catch (error) {
        console.error('Error allowing join permissions for roles:', error);
    }
}

export async function denyJoinPermissions(interaction: ChatInputCommandInteraction | Message | GuildMember, channel_id: string, user_ids: string[]) {
    try {
        const channel = await interaction.guild?.channels.fetch(channel_id);
        if (!channel || !(channel instanceof VoiceChannel)) throw new Error(`Channel not found or not a voice channel: ${channel}`);
        for (const user_id of user_ids) {
            const permissions = channel.permissionOverwrites.cache.get(user_id);

            if (permissions) await permissions.edit({ Connect: false });
            else await channel.permissionOverwrites.create(user_id, { Connect: false });
        }
    } catch (error) {
        console.error('Error denying join permissions:', error);
    }
}

export async function allowJoinPermissions(interaction: ChatInputCommandInteraction | Message, channel_id: string, user_ids: string[]) {
    try {
        const channel = await interaction.guild?.channels.fetch(channel_id);
        if (!channel || !(channel instanceof VoiceChannel)) throw new Error(`Channel not found or not a voice channel: ${channel}`);
        for (const user_id of user_ids) {
            const permissions = channel.permissionOverwrites.cache.get(user_id);

            if (permissions) await permissions.edit({ Connect: true });
            else await channel.permissionOverwrites.create(user_id, { Connect: true });
        }
    } catch (error) {
        console.error('Error allowing join permissions:', error);
    }
}

export async function givePromotedPermissions(interaction: ChatInputCommandInteraction | Message | GuildMember, channel_id: string, user_ids: string[]) {
    try {
        const channel = await interaction.guild?.channels.fetch(channel_id);
        if (!channel || !(channel instanceof VoiceChannel)) throw new Error(`Channel not found or not a voice channel: ${channel}`);
        for (const user_id of user_ids) {
            const permissions = channel.permissionOverwrites.cache.get(user_id);

            if (permissions) await permissions.edit({ ManageChannels: true });
            else await channel.permissionOverwrites.create(user_id, { ManageChannels: true });
        }
    } catch (error) {
        console.error('Error giving promoted permissions:', error);
    }
}

export async function removePromotedPermissions(interaction: ChatInputCommandInteraction | Message | GuildMember, channel_id: string, user_ids: string[]) {
    try {
        const channel = await interaction.guild?.channels.fetch(channel_id);
        if (!channel || !(channel instanceof VoiceChannel)) throw new Error(`Channel not found or not a voice channel: ${channel}`);
        for (const user_id of user_ids) {
            const permissions = channel.permissionOverwrites.cache.get(user_id);

            if (permissions) await permissions.edit({ ManageChannels: false });
            else await channel.permissionOverwrites.create(user_id, { ManageChannels: false });
        }
    } catch (error) {
        console.error('Error removing promoted permissions:', error);
    }
}



export async function dcOrMoveToHome(channel_id: string, new_member: GuildMember) {
    if(new_member.id === config.OWNER_ID) return
    const guild = new_member.guild
    const channel = await guild.channels.cache.get(channel_id) ?? await guild.channels.fetch(channel_id)
    const member = await guild.members.cache.get(new_member.id) ?? await guild.members.fetch(new_member.id)
    if (member.voice.channel && channel) {
        if (member.voice.channel.id === channel.id) {
            const home_vc_id = String(global.SETTINGS[guild.id].channels.vc_home[0])
            if (home_vc_id) {
                const home_vc = await guild.channels.cache.get(home_vc_id) ?? await guild.channels.fetch(home_vc_id)
                if (home_vc && home_vc.type == ChannelType.GuildVoice) member.voice.setChannel(home_vc).then().catch(e =>
                    console.log(`error moving ${new_member} to home`))
            } else member.voice.disconnect().then().catch(e => console.log(`error disconnecting ${new_member} `))
        }
    }
}

export async function notInVoiceMessage(interaction: Message, home_vc: GuildBasedChannel) {
    if (home_vc.isSendable()) {
        home_vc.send(`${interaction.user} You must run the command in [${home_vc.name}](https://discord.com/channels/${interaction.guild!.id}/${home_vc.id}) to do this`)
    }
    interaction.react('❌').then().catch(e => { return })
}

export async function findNextChannelPositionFromHome(
    interaction: ChatInputCommandInteraction | Message,
    home_vc: BaseGuildVoiceChannel | BaseGuildTextChannel): Promise<number> {
    if (!interaction.guild) return 0

    const channels = await interaction.guild.channels.fetch()
    let voice_channels: Collection<string, NonThreadGuildBasedChannel | null>;

    if (home_vc.parent === null) voice_channels = channels.filter(ch => !ch?.parent)
    else voice_channels = channels.filter(ch => ch?.parentId === home_vc?.parent?.id)

    const last_channel = voice_channels.last()
    if (!last_channel) throw new Error(`Couldn't figure out where to place the vc`)
    const position = last_channel.rawPosition + 1
    return position
}

// check if in guild

// check if is in vc
export async function isInVC(
    interaction: ChatInputCommandInteraction | Message,
    home_vc: GuildBasedChannel,
    initiator: GuildMember,
    prefix: string,
) {
    if (initiator.voice?.channel) {
        return true
    }

    if (interaction instanceof Message) {
        if (home_vc.isSendable()) {
            home_vc.send(`${interaction.user} You must run the command in [${home_vc.name}](https://discord.com/channels/${interaction.guild!.id}/${home_vc.id}) to do this`)
        }
        interaction.react('❌').then().catch(e => { return })
    } else {
        await interaction.reply({
            embeds: [{
                title: `You're not in a voice channel! Create one with /create or ${prefix}create in the https://discord.com/channels/${interaction.guild!.id}/${home_vc.id}`,
                color: 0xff0000,
            }],
            flags: MessageFlags.Ephemeral
        })
    }
    return false
}

export async function isInHomeVC(
    interaction: ChatInputCommandInteraction | Message,
    home_vc: GuildBasedChannel,
    initiator: GuildMember,
    prefix: string,
) {
    if (initiator.voice.channel)
        if (initiator.voice.channel.id === home_vc.id) {
            return true
        }

    if (interaction instanceof Message) {
        // if (interaction.channel.type !== ChannelType.GuildText) {
        const msg = await interaction.reply(`${interaction.user}, join [${home_vc.name}](https://discord.com/channels/${interaction.guild!.id}/${home_vc.id}) to create your own voice channel`)
        interaction.react('❌').then().catch(e => { return })
        setTimeout(() => {
            msg.delete().catch(() => { return })
        }, 2000)
        // } else {
        //     if (home_vc.isSendable()) {
        //         home_vc.send(`${interaction.user}, join [${home_vc.name}](https://discord.com/channels/${interaction.guild!.id}/${home_vc.id}) to create your own voice channel`)
        //     }
        //     interaction.react('❌').then().catch(e => { return })
        // }
    } else {
        await interaction.reply({
            embeds: [{
                title: `Join the https://discord.com/channels/${interaction.guild!.id}/${home_vc.id} to create your own voice channel`,
                color: 0xff0000,
            }],
            flags: MessageFlags.Ephemeral
        })
    }
    return false
}

// check if is in owned channel
export async function isCommandRunInOwnedVC(
    interaction: ChatInputCommandInteraction | Message | any,
    owned_channel: ChannelSettings | undefined,
    target_channel_id: string,
) {
    if (interaction.channel?.id === target_channel_id) {
        return true
    }

    if (interaction instanceof Message) {
        // await interaction.reply({ embeds: [{ title: `You must run this command in ${owned_channel?.autodelete_link}`, color: 0xff0000, }] })
        const channel = await interaction.guild?.channels.cache.get(target_channel_id) ?? await interaction.guild?.channels.fetch(target_channel_id)
        if (channel?.isSendable()) await channel.send({ content: `<@${interaction.user.id}>`, embeds: [{ description: `You need to run that command in your vc or use the slash command`, color: 0xff0000 }] })
        await interaction.react('❌').then().catch(e => { return })
    } else {
        if (interaction.commandName === "edit") {
            interaction.reply({
                embeds: [{
                    description: `You must run this command in ${owned_channel?.autodelete_link ?? `your vc`}`,
                    color: 0xff0000,
                }],
                flags: MessageFlags.Ephemeral
            })
            return false
        }
        return true
        // await interaction.reply({
        //     embeds: [{
        //         title: `You must run this command in ${owned_channel?.autodelete_link}`,
        //         color: 0xff0000,
        //     }],
        //     flags: MessageFlags.Ephemeral
        // });
    }
    return false
}

// check if authorised within channel
export async function isOwnerOrPromotedInVC(
    interaction: ChatInputCommandInteraction | Message,
    owned_channel: ChannelSettings | undefined,
    initiator: GuildMember,
    prefix: string,
) {
    if (owned_channel?.owner?.includes(initiator.user.id) || owned_channel?.promoted?.includes(initiator.user.id)) {
        return true
    }

    if (interaction instanceof Message) {
        await interaction.reply({
            embeds: [{ title: `Couldn't find any of your active vcs or you're not ${prefix}promote(d) here`, color: 0xff0000, }],
        })
    } else {
        await interaction.reply({
            embeds: [{ title: `Couldn't find any of your active vcs or you're not ${prefix}promote(d) here`, color: 0xff0000, }], flags: MessageFlags.Ephemeral
        });
    }

    return false
}




// check if user is mentioned

// check if mentioned user is self


// updating user limit buttons in channel editing menu
export function updateButtonStates(components: any[], newLimit: number, memberCount: number): void {
    components[0].components.forEach((comp: any) => {
        if (!comp.components) return;

        // plus/minus buttons
        if (comp.components[0].data?.custom_id?.startsWith('vc-edit-limit')) {
            comp.components.forEach((button: any) => {
                const [, , buttonAction, buttonAmount] = button.data.custom_id.split(':');

                if (buttonAction === 'minus') {
                    button.data.disabled = (newLimit - Number(buttonAmount) < 0) || (newLimit === 0);
                } else if (buttonAction === 'plus') {
                    button.data.disabled = newLimit + Number(buttonAmount) > 99;
                }
            });
        }

        // reset button and status line
        if (comp.accessory?.data?.custom_id.split(':')[2] === 'reset') {
            comp.accessory.data.disabled = newLimit === 0;

            const limitDisplay = newLimit === 0 ? 'NO LIMIT' : newLimit.toString();
            comp.components[0].data.content = `### User Limit [${memberCount}/${limitDisplay}]`;
        }
    });
}

// set bitrate string menu selected option
export function updateBitrateMenu(components: any[], newLimit: string): void {
    components[0].components.forEach((comp: any) => {
        if (!comp.components) return;

        if (comp.components[0].data?.custom_id?.startsWith('vc-edit-bitrate')) {
            comp.components[0].data.options.forEach((opt: any) => {
                if (opt.value === newLimit) opt.default = true
                else opt.default = false
            })
        }
    });
}

// update region menu default option
export function updateRegionMenu(components: any[], newRegion: string): void {
    const stringified_region = newRegion ?? "null"
    components[0].components.forEach((comp: any) => {
        if (!comp.components) return;

        if (comp.components[0].data?.custom_id?.startsWith('vc-edit-region')) {
            comp.components[0].data.options.forEach((opt: any) => {
                if (opt.value === stringified_region) opt.default = true
                else opt.default = false
            })
        }
    });
}

// updating everyone speaking status
export function updateSpeakButtonState(components: any[], canSpeak: boolean): void {
    components[0].components.forEach((comp: any) => {
        if (!comp.components) return;

        comp.components?.forEach((button: any) => {
            if (button?.data?.custom_id?.startsWith('vc-edit-speak')) {
                const style = canSpeak ? 3 : 4
                const label = canSpeak ? `Can speak` : `Cannot speak`
                button.data.style = style
                button.data.label = label
                return
            }
        });
    });
}

const leetMap: Record<string, string[]> = {
    '0': ['o'],
    '1': ['i', 'l'],
    '!': ['i'],
    '|': ['i', 'l'],
    '3': ['e'],
    '4': ['a'],
    '@': ['a'],
    '5': ['s'],
    '$': ['s'],
    '7': ['t'],
    '+': ['t'],
    '8': ['b'],
    '9': ['g'],
    '(': ['c'],
    '/': ['v'],
};

function containsMacron(word: string): boolean {
    return /[āēīōūĀĒĪŌŪ]/.test(word);
}

function generatePermutations(word: string): string[] {
    const chars = word.toLowerCase().split('');
    const possibilities = chars.map(char => {
        const mapped = leetMap[char] ?? [char];
        return Array.isArray(mapped) ? mapped : [mapped];
    });

    const combine = (arr: string[][]): string[] => {
        return arr.reduce((acc, curr) => {
            const res: string[] = [];
            for (const a of acc) {
                for (const b of curr) {
                    res.push(a + b);
                }
            }
            return res;
        }, ['']);
    };

    const candidates = combine(possibilities);
    return candidates.map(w => w.replace(/[^a-z]/g, ''));
}

export function sanitizeString(input: string): string {
    const words = input.split(/\s+/);

    return words
        .map(word => {
            if (containsMacron(word)) {
                return global.ALLOWED_THOUGHTS[
                    Math.floor(Math.random() * global.ALLOWED_THOUGHTS.length)
                ];
            }

            const candidates = generatePermutations(word);
            const matches = global.BAD_THOUGHTS.some(badWord => 
                candidates.some(candidate => candidate.includes(badWord))
            );

            if (matches) {
                return global.ALLOWED_THOUGHTS[
                    Math.floor(Math.random() * global.ALLOWED_THOUGHTS.length)
                ];
            }

            return word;
        })
        .join(' ');
}
