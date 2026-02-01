import { ActionRowBuilder, ChatInputCommandInteraction, Client, Message, StringSelectMenuBuilder, StringSelectMenuInteraction, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { check_level } from "./permissions";
import { Permissions } from "../models/permissions";
import { HELP_CATEGORIES, CATEGORY_ALL } from "./help-categories";

function capitalizeFirstLetter(str: string) {
    if (str.length === 0) return str;  // Handle empty strings
    return str.charAt(0).toUpperCase() + str.slice(1);
}

interface HelpEmbedResult {
    embeds: any[];
    totalPages: number;
    currentPage: number;
    availableCategories: string[];
}

async function buildHelpEmbed(client: Client, interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | Message, command?: string, page: number = 0, categoryFilter: string = CATEGORY_ALL): Promise<HelpEmbedResult | any[]> {
    const level = await check_level(interaction);

    let usable_commands: { name: string, description: string }[] = [];
    let non_slash_commands: { name: string, description: string }[] = [];
    if (!interaction.guild) return { embeds: [], totalPages: 0, currentPage: 0, availableCategories: [CATEGORY_ALL] };
    const prefix = String(global.SETTINGS[interaction.guild.id].guild?.prefix ?? "[NO_PREFIX]")

    // Collect all available categories
    const availableCategories = new Set<string>();

    client.commands.forEach((cmd, key) => {
        if (level >= cmd.require_perm && cmd.data.description) {
            usable_commands.push({
                name: cmd.data.name,
                description: cmd.data.description.replace(new RegExp(/{{PREFIX}}/g), prefix)
            });
            availableCategories.add(cmd.category || HELP_CATEGORIES.UNCATEGORIZED);
        } else if (level >= cmd.require_perm) {
            non_slash_commands.push({
                name: cmd.data.name,
                description: "Context menu command",
            });
            availableCategories.add(cmd.category || HELP_CATEGORIES.UNCATEGORIZED);
        }
    });

    // Filter by category if not "All"
    if (categoryFilter !== CATEGORY_ALL) {
        usable_commands = usable_commands.filter(cmd => {
            const command = client.commands.get(cmd.name);
            const cmdCategory = command?.category || HELP_CATEGORIES.UNCATEGORIZED;
            return cmdCategory === categoryFilter;
        });

        non_slash_commands = non_slash_commands.filter(cmd => {
            const command = client.commands.get(cmd.name);
            const cmdCategory = command?.category || HELP_CATEGORIES.UNCATEGORIZED;
            return cmdCategory === categoryFilter;
        });
    }

    // Build sorted category list with "All" first
    const sortedCategories = [CATEGORY_ALL, ...Array.from(availableCategories).sort()];

    // if command is passed return just the one
    if (command) {
        const command_data = client.commands.get(command);

        if (command_data && level >= command_data.require_perm) {
            if (!command_data.help?.embed_data) {
                const description = command_data.help?.description ?? command_data.data.description;
                return [{
                    title: `${capitalizeFirstLetter(command_data.data.name)} help info`,
                    description: description.replace(new RegExp(/{{PREFIX}}/g), prefix),
                    color: 0x00ffff,
                }]
            } else { return [command_data.help.embed_data] }
        } else {
            return [{
                title: 'Error',
                description: `You do not have permission or the command "${command}" does not exist.`,
                color: 0xff0000,
            }];
        }
    }

    // if no command is passed, return all with pagination
    const MAX_DESCRIPTION_LENGTH = 3800;
    const pages: string[] = [];
    let currentPageText = '**__Slash commands__**\n';

    // Add slash commands
    for (const cmd of usable_commands) {
        const cmdLine = `**${cmd.name}**: ${cmd.description}\n`;

        // Check if adding this command would exceed the limit
        if ((currentPageText + cmdLine).length > MAX_DESCRIPTION_LENGTH && currentPageText.length > 50) {
            // Save current page and start new one
            pages.push(currentPageText);
            currentPageText = '**__Slash commands (continued)__**\n' + cmdLine;
        } else {
            currentPageText += cmdLine;
        }
    }

    // Add non-slash commands to the last page
    if (non_slash_commands.length > 0) {
        const non_slash_header = '\n**__Context menu commands__**\n';
        const non_slash_text = non_slash_commands.map(cmd => `**${cmd.name}**`).join('\n');
        const non_slash_section = non_slash_header + non_slash_text;

        // Check if we need a new page for context menu commands
        if ((currentPageText + non_slash_section).length > MAX_DESCRIPTION_LENGTH) {
            pages.push(currentPageText);
            currentPageText = non_slash_section;
        } else {
            currentPageText += non_slash_section;
        }
    }

    // Add the last page
    pages.push(currentPageText);

    const totalPages = pages.length;
    const safePage = Math.max(0, Math.min(page, totalPages - 1));

    // Build embed for requested page
    const pageFooter = totalPages > 1 ? `\nPage ${safePage + 1} of ${totalPages}` : '';
    const categoryFooter = categoryFilter !== CATEGORY_ALL ? ` (${categoryFilter})` : '';

    return {
        embeds: [{
            title: `Your permission level is ${Permissions[+level].replace('_', ' ').toLocaleLowerCase()} [${level}/10]${categoryFooter}`,
            description: pages[safePage] + pageFooter,
            color: 11468800,
        }],
        totalPages,
        currentPage: safePage,
        availableCategories: sortedCategories
    };
}

async function buildMetaEmbed(client: Client, interaction: ChatInputCommandInteraction | Message) {
    if(!interaction.guild) return
    const prefix = String(global.SETTINGS[interaction.guild.id].guild?.prefix ?? "[NO_PREFIX]")
    const embed = [{
        title: "_Frequently Asked Questions:_",
        description: `The **/freezer/** is a minimalist Discord server designed to inspire thought-provoking discussion. We allow users like yourself the freedom to create, share, and shape their own ideas in an open, creative space.\n
*Q:* I'm new here, what should I do now?
*A:* Adhere to <#1319362071737143327> and converse with people. You can create your own voice channel by typing: \`\`\`${prefix}create or /create\`\`\`
*Q:* How do I edit my own voice channel?
*A:* You can edit your channel after creating your own vc with the command: \`\`\`${prefix}edit or /edit\`\`\`
- Share /freezer/ with others
- Add an icon/avatar to your account if you don't have one, no one wants to see that Discord logo.
*Q:* Why is everyone numbered?\n*A:* This Discord server gives every user a unique number (No.xxx) as nicknames to promote anonymity, reflecting the \"anonymous\" culture of 4chan, privacy and freedom of speech are also important to the space.\n
_Note:_ If you'd like to post even more anonymously, you can alternatively see, and send messages in the /freezer/ server by visiting https://monoko.chat/chat/freezer\n
*Q:* How can I apply for a \"staff\" or moderator position?
*A:* We take monthly applications for Janitor in the last two weeks of every month. Do \`/apply\` for more info.\n
*Q:* Are there any benefits to boosting the server?
*A:* Yes, there are plenty of benefits to boosting the server; a user who has boosted the server will have the <@&1312629049830412400> role.\n
The ability to **temporarily** change the server's icon by typing: \`\`\`${prefix}si\`\`\`The ability to **temporarily** change the server's banner by typing: \`\`\`${prefix}sb\`\`\` The ability to **temporarily** change the server's name by typing: \`\`\`${prefix}sn\`\`\`\n
*Q:* Can I pick my own number?
*A:* Yes, by boosting the server, contact an administrator for help.`,
        // image: { url: interaction.guild?.bannerURL({ size: 4096 }) },
        // thumbnail: {
        //     url: interaction.guild?.iconURL({ size: 4096 })
        // },
        color: 11468800
    }]


    return embed
}

async function buildRulesEmbed(client: Client, interaction: ChatInputCommandInteraction | Message) {
    const embed = [{
        title: `_Rules_`,
        description: `1. Do not spam the chat\n2. Do not post anything that violates https://discord.com/guidelines`,
        color: 11468800,
    }]

    return embed
}

function createPaginationButtons(userId: string, currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
    const firstButton = new ButtonBuilder()
        .setCustomId(`help_first_page:${userId}`)
        .setLabel('First')
        .setEmoji('⏮️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0);

    const prevButton = new ButtonBuilder()
        .setCustomId(`help_prev_page:${userId}`)
        .setLabel('Previous')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId(`help_next_page:${userId}`)
        .setLabel('Next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages - 1);

    const lastButton = new ButtonBuilder()
        .setCustomId(`help_last_page:${userId}`)
        .setLabel('Last')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages - 1);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(firstButton, prevButton, nextButton, lastButton);
}

function buildCategorySelect(
    userId: string,
    availableCategories: string[],
    currentCategory: string
): StringSelectMenuBuilder {
    const options = availableCategories.map(cat => ({
        label: cat,
        value: cat,
        default: cat === currentCategory
    }));

    return new StringSelectMenuBuilder()
        .setCustomId(`help_category:${userId}`)
        .setPlaceholder('Filter by category')
        .addOptions(options);
}

async function setupHelpInteractionCollector(
    response: Message,
    client: Client,
    interaction: ChatInputCommandInteraction | Message,
    initialPage: number,
    initialCategory: string = CATEGORY_ALL
): Promise<void> {
    let currentPage = initialPage;
    let currentCategory = initialCategory;

    const collector = response.createMessageComponentCollector({
        time: 300000 // 5 minutes
    });

    collector.on('collect', async (i) => {
        // Check if user is authorized
        if (i.user.id !== interaction.user.id) {
            await i.reply({
                content: 'These buttons are not for you!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Handle category selection (StringSelectMenu)
        if (i.isStringSelectMenu()) {
            if (i.customId.startsWith('help_category:')) {
                currentCategory = i.values[0];
                currentPage = 0;  // Reset to first page when category changes
            }
        }
        // Handle pagination (Buttons)
        else if (i.isButton()) {
            const customId = i.customId.split(':')[0];
            switch (customId) {
                case 'help_first_page':
                    currentPage = 0;
                    break;
                case 'help_prev_page':
                    currentPage = Math.max(0, currentPage - 1);
                    break;
                case 'help_next_page':
                    currentPage = Math.min(currentPage + 1, 999); // Will be limited by actual page count
                    break;
                case 'help_last_page':
                    currentPage = 999; // Will be limited by actual page count
                    break;
                default:
                    // Not a pagination button, ignore
                    return;
            }
        }

        // Fetch updated embed with current state
        const helpData = await buildHelpEmbed(client, interaction, undefined, currentPage, currentCategory);

        // Type guard to ensure we have HelpEmbedResult
        if ('totalPages' in helpData) {
            // Limit currentPage to actual pages
            currentPage = Math.min(currentPage, helpData.totalPages - 1);

            // Build components dynamically
            const components: ActionRowBuilder<any>[] = [];

            // Row 1: Tab buttons
            const commands_button = new ButtonBuilder()
                .setCustomId(`help-commands:${interaction.user.id}`)
                .setLabel('Commands')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            const meta_button = new ButtonBuilder()
                .setCustomId(`help-meta:${interaction.user.id}`)
                .setLabel('Meta')
                .setStyle(ButtonStyle.Primary);
            const rules_button = new ButtonBuilder()
                .setCustomId(`help-rules:${interaction.user.id}`)
                .setLabel('Rules')
                .setStyle(ButtonStyle.Primary);
            const tabRow = new ActionRowBuilder<ButtonBuilder>().addComponents(commands_button, meta_button, rules_button);
            components.push(tabRow);

            // Row 2: Category select
            const categorySelect = buildCategorySelect(interaction.user.id, helpData.availableCategories, currentCategory);
            const categoryRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect);
            components.push(categoryRow);

            // Row 3: Pagination (only if needed)
            if (helpData.totalPages > 1) {
                const paginationRow = createPaginationButtons(interaction.user.id, currentPage, helpData.totalPages);
                components.push(paginationRow);
            }

            await i.update({
                embeds: helpData.embeds,
                components: components
            });
        }
    });

    collector.on('end', async () => {
        try {
            // Disable all buttons and select when collector ends
            const commands_button = new ButtonBuilder()
                .setCustomId(`help-commands:${interaction.user.id}`)
                .setLabel('Commands')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            const meta_button = new ButtonBuilder()
                .setCustomId(`help-meta:${interaction.user.id}`)
                .setLabel('Meta')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            const rules_button = new ButtonBuilder()
                .setCustomId(`help-rules:${interaction.user.id}`)
                .setLabel('Rules')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);
            const tabRow = new ActionRowBuilder<ButtonBuilder>().addComponents(commands_button, meta_button, rules_button);

            // Get final helpData to know how many rows we need
            const helpData = await buildHelpEmbed(client, interaction, undefined, currentPage, currentCategory);

            const disabledComponents: ActionRowBuilder<any>[] = [tabRow];

            if ('totalPages' in helpData) {
                // Disabled category select
                const categorySelect = buildCategorySelect(interaction.user.id, helpData.availableCategories, currentCategory);
                categorySelect.setDisabled(true);
                const categoryRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect);
                disabledComponents.push(categoryRow);

                // Disabled pagination if it exists
                if (helpData.totalPages > 1) {
                    const paginationRow = createPaginationButtons(interaction.user.id, currentPage, helpData.totalPages);
                    paginationRow.components.forEach(button => button.setDisabled(true));
                    disabledComponents.push(paginationRow);
                }
            }

            if (interaction instanceof Message) {
                await response.edit({ components: disabledComponents });
            } else {
                await interaction.editReply({ components: disabledComponents });
            }
        } catch (error) {
            console.error('Error disabling help buttons on collector end:', error);
        }
    });
}

// Keep old name as alias for backward compatibility
const setupHelpPaginationCollector = setupHelpInteractionCollector;

async function buildCommandSelect(client: Client, interaction: StringSelectMenuInteraction | ChatInputCommandInteraction | Message) {


    const level = await check_level(interaction)

    const usable_commands: { label: string, value: string }[] = [];
    // const non_slash_commands: { label: string, value: string }[] = [];
    client.commands.forEach((command, key) => {
        if (level >= command.require_perm && command.data.description) {
            usable_commands.push({
                label: command.data.name,
                value: command.data.name
            })
        }
    }) // non slash commands not added since they're pretty self explanatory?

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`command-select:${interaction.user.id}`)
        .setPlaceholder('Select the command to get info on')
        .addOptions(usable_commands)

    return menu
}

export { buildHelpEmbed, buildMetaEmbed, buildRulesEmbed, buildCommandSelect, createPaginationButtons, setupHelpPaginationCollector, buildCategorySelect, setupHelpInteractionCollector }