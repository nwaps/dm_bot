import { ActionRowBuilder, ChatInputCommandInteraction, Client, ContextMenuCommandInteraction, GuildMember, InteractionContextType, Message, User } from 'discord.js';
import { HELP_CATEGORIES } from '../util/help-categories';
import { ButtonBuilder, SlashCommandBuilder } from '@discordjs/builders';
import { Permissions } from '../models/permissions';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { exec } from 'child_process';
import { get_settings } from '../util/settings';
import crypto from 'crypto';

type ImageOptions = {
    posX_initiator: number | null;
    posY_initiator: number | null;
    posX_target: number | null;
    posY_target: number | null;
    initiator_scale?: number | null;
    target_scale?: number | null;
};

export default {
    require_perm: Permissions.BOOSTER,
    category: HELP_CATEGORIES.BOOSTS_REWARDS,
    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
        .setName('rape')
        .setDescription('rape user')
        .addMentionableOption(option =>
            option.setName('user')
                .setDescription('Who would you like to rape, sir?')
                .setRequired(true)
        )
    ,
    async execute(client: Client, interaction: ChatInputCommandInteraction | any) {
        let USER_OPTION: { user?: User } = {}
        if (interaction instanceof Message) return
        // USER_OPTION.user = interaction.mentions.users.first()
        else {
            USER_OPTION = interaction.options.get('user', true);
            await interaction.deferReply()
        }
        try {
            // throw if interaction invalid not in guild or user option not passed somehow (it's required?)
            if (!interaction.guild) throw new Error(`Guild isn't valid`)
            if (!USER_OPTION || !USER_OPTION.user) throw new Error(`User isn't valid`)

            // 
            const INITIATOR = await interaction.guild.members.fetch(interaction.user.id);
            const TARGET = await interaction.guild.members.fetch(USER_OPTION.user.id);
            try {
                const embed = await rapeUser(interaction, INITIATOR, TARGET)
                if (interaction instanceof Message) return await interaction.reply(embed)
                else if (interaction instanceof ChatInputCommandInteraction) return await interaction.editReply(embed)

            } catch (error) { console.log(error) }
        } catch (error) {
            console.error('Error executing command:', error);

            // await interaction.editReply({
            //     embeds: [{
            //         title: 'Error',
            //         description: `There was an error creating the image.\n${error}`,
            //         color: 0xff0000
            //     }]
            // });
        }
    },
};

function getExtension(url: string): string {
    return url.toLowerCase().includes('.gif') ? '.gif' : '.png';
}

async function downloadImage(url: string, filePath: string): Promise<void> {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        writer.on('finish', () => resolve());
        writer.on('error', reject);
    });
}

async function createCircularAvatar(input_path: string, output_path: string, size: number): Promise<void> {
    const r = Math.floor(size / 2);
    const cmd = `convert "${input_path}" -resize "${size}x${size}^" -gravity center -extent ${size}x${size} \\( -size ${size}x${size} xc:none -fill white -draw "circle ${r},${r} ${r},0" \\) -alpha off -compose CopyOpacity -composite "${output_path}"`;
    await execPromise(cmd);
}

function execPromise(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('exec error:', error);
                console.error('stderr:', stderr);
                return reject(error);
            }
            // console.log(stdout)
            resolve();
        });
    });
}


function hashFromURL(url: string): string {
    return crypto.createHash('sha1').update(url).digest('hex');
}

export async function mergeImages(
    initiator_avatarURL: string,
    target_avatarURL: string,
    template_path: string,
    output_path: string,
    options: ImageOptions,
    debug?: boolean
): Promise<void> {
    const TEMP_DIR = os.tmpdir();

    // Generate a hash for each URL
    const initiatorHash = hashFromURL(initiator_avatarURL + JSON.stringify(options));
    const targetHash = hashFromURL(target_avatarURL + JSON.stringify(options));

    // Determine file extensions
    let initiator_ext = getExtension(initiator_avatarURL);
    let target_ext = getExtension(target_avatarURL);

    // Create file paths using the hashes
    let initiator_path = path.join(TEMP_DIR, `image1_${initiatorHash}${initiator_ext}`);
    let target_path = path.join(TEMP_DIR, `image2_${targetHash}${target_ext}`);

    // Download the images only if they are not already cached
    if (!fs.existsSync(initiator_path) || debug) {
        await downloadImage(initiator_avatarURL, initiator_path);
    }
    if (!fs.existsSync(target_path) || debug) {
        await downloadImage(target_avatarURL, target_path);
    }

    // For animated GIFs, convert to a static image (first frame only) if not already done
    if (initiator_ext === '.gif') {
        const staticInitiatorPath = path.join(TEMP_DIR, `image1_${initiatorHash}_static.png`);
        if (!fs.existsSync(staticInitiatorPath)) {
            const initiator_cmd = `convert "${initiator_path}[0]" "${staticInitiatorPath}"`;
            await execPromise(initiator_cmd);
        }
        initiator_path = staticInitiatorPath;
    }
    if (target_ext === '.gif') {
        const staticTargetPath = path.join(TEMP_DIR, `image2_${targetHash}_static.png`);
        if (!fs.existsSync(staticTargetPath)) {
            const target_cmd = `convert "${target_path}[0]" "${staticTargetPath}"`;
            await execPromise(target_cmd);
        }
        target_path = staticTargetPath;
    }

    // Resize avatars (circular conversion)
    const default_size = 200;
    const initiator_resize = options.initiator_scale ?? default_size;
    const target_resize = options.target_scale ?? default_size;

    const circularInitiatorPath = path.join(TEMP_DIR, `image1_${initiatorHash}_circular.png`);
    const circularTargetPath = path.join(TEMP_DIR, `image2_${targetHash}_circular.png`);

    if (!fs.existsSync(circularInitiatorPath) || debug) {
        await createCircularAvatar(initiator_path, circularInitiatorPath, initiator_resize);
    }
    if (!fs.existsSync(circularTargetPath) || debug) {
        await createCircularAvatar(target_path, circularTargetPath, target_resize);
    }

    // Use the circular images in the merge command
    const initiator_processedPath = circularInitiatorPath;
    const target_processedPath = circularTargetPath;

    const template_ext = path.extname(template_path).toLowerCase();
    const isTemplateAnimated = template_ext === '.gif';

    const cmd = isTemplateAnimated
        ? `convert "${template_path}" -coalesce null: \\( "${target_processedPath}" -coalesce \\) -gravity northwest -geometry +${options.posX_target}+${options.posY_target} -layers composite null: \\( "${initiator_processedPath}" -coalesce \\) -gravity northwest -geometry +${options.posX_initiator}+${options.posY_initiator} -layers composite -layers optimize "${output_path}"`
        : `convert "${template_path}" \\( "${target_processedPath}" \\) -geometry +${options.posX_target}+${options.posY_target} -composite \\( "${initiator_processedPath}" \\) -geometry +${options.posX_initiator}+${options.posY_initiator} -composite -layers optimize "${output_path}"`;

    await execPromise(cmd);
}


const fallback = {
    name: "default",
    filename: "rape2.gif",
    config: {
        posX_initiator: 260,
        posY_initiator: -10,
        posX_target: 30,
        posY_target: 110,
        initiator_scale: 140,
        target_scale: 170,
    }
};

export async function rapeUser(
    interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
    INITIATOR: GuildMember,
    TARGET: GuildMember | string,
    debug?: boolean,
    options_override?: typeof fallback,
    row?: ActionRowBuilder<ButtonBuilder>
) {
    const TEMP_DIR = os.tmpdir();
    const initiator_avatarUrl =
        INITIATOR.displayAvatarURL({ size: 128 }) ?? INITIATOR.avatarURL({ size: 128 });


    let selfrape = false
    if (!(TARGET instanceof GuildMember)) { selfrape = true, TARGET = INITIATOR }

    const target_avatarUrl = TARGET.displayAvatarURL({ size: 128 }) ?? TARGET.avatarURL({ size: 128 });

    const SETTINGS = await get_settings(interaction.guildId);
    const rapes = SETTINGS.rape.images;
    const RESOURCE_FOLDER = path.resolve(global.ROOT, './src/discord/resources');

    // Get available template files
    const resource_files = fs
        .readdirSync(RESOURCE_FOLDER)
        .filter(file => ['.png', '.jpg', '.jpeg', '.gif'].includes(path.extname(file).toLowerCase()));
    if (resource_files.length === 0) {
        throw new Error('No template images found in the resources folder.');
    }

    // Fallback object when no valid rape config is found
    const validRapeKeys = Object.keys(rapes).filter(key => rapes[key].config !== null);
    let selectedRape: typeof fallback | typeof rapes[string];
    if (debug && options_override) {
        selectedRape = options_override
    }
    else if (validRapeKeys.length > 0) {
        const randomKey = validRapeKeys[Math.floor(Math.random() * validRapeKeys.length)];
        selectedRape = rapes[randomKey];
    } else selectedRape = fallback;

    const template_path = path.join(RESOURCE_FOLDER, selectedRape.filename);

    let options: ImageOptions;
    // console.log(options_override)
    if (debug && options_override) {
        options = { ...fallback.config, ...options_override.config };
    } else {
        if ('config' in selectedRape && selectedRape.config) {
            options = { ...fallback.config, ...selectedRape.config };
        } else {
            options = fallback.config;
        }
    }
    // console.log(options)

    const hash = hashFromURL(`${path.basename(selectedRape.filename, path.extname(selectedRape.filename))}${INITIATOR.user.id}${TARGET.user.id}${JSON.stringify(options)}`)
    const output_path = path.join(
        TEMP_DIR,
        `${hash}${path.extname(selectedRape.filename)}`
    );

    if (!fs.existsSync(output_path) || debug) {
        await mergeImages(initiator_avatarUrl, target_avatarUrl, template_path, output_path, options, debug);
    }

    const phrases = SETTINGS.rape.phrases
    const validRapePhrases = Object.keys(phrases).filter(key => phrases[key].phrase !== null);

    let selectedPhrase = "{{initiator}} raped {{target}} and then killed themself"
    if (validRapePhrases.length > 0) {
        const randomKey = validRapePhrases[Math.floor(Math.random() * validRapePhrases.length)];
        selectedPhrase = phrases[randomKey].phrase;
    }

    let rape_phrase = selectedPhrase.replace(/{{initiator}}/g, INITIATOR.toString()).replace(/{{target}}/g, TARGET.toString());
    if (selfrape) rape_phrase = `${INITIATOR} accidentally raped themself!`
    //title:  Move the initiator and target and initator pfps with the buttons below.\nUse the scaling button to resize pfp's
    // Alternatively, click save to set current positions or rerun the command with new values
    if (debug) {
        if (row) return {
            content: `Initiator(you): ${INITIATOR} Target(bot): ${TARGET}`,
            embeds: [{
                title: ``,
                description: `\n
                **__Initiator__**:\n**X**: ${options.posX_initiator}\n**Y**: ${options.posY_initiator}
                **__Target__**:\n**X**: ${options.posX_target}\n**Y**: ${options.posY_target}
                **__Scale__**:\n**Initiator**: ${options.initiator_scale}\n**Target**: ${options.target_scale}\n
                +x to go down, +y go to right`,
                color: 0x00ffff,
                image: { url: `attachment://${path.basename(output_path)}` }
            }],
            files: [output_path],
            components: [row]
        }
        else return {
            content: `Initiator(you): ${INITIATOR} Target(bot): ${TARGET}`,
            embeds: [{
                title: ``,
                description: ``,
                color: 0x00ffff,
                image: { url: `attachment://${path.basename(output_path)}` }
            }],
            files: [output_path],
        }
    } else return {
        content: rape_phrase,
        embeds: [{
            color: 0x00ffff,
            image: { url: `attachment://${path.basename(output_path)}` }
        }],
        files: [output_path]
    }

}
// await interaction.editReply({
//     content: rape_phrase,
//     embeds: [{
//         color: 0x00ffff,
//         image: { url: `attachment://${path.basename(output_path)}` }
//     }],
//     files: [output_path]
// })
// } catch (error) { console.log(error) }
// }
