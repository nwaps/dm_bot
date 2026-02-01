// commands/dm_all.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, Client, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, InteractionContextType, PermissionFlagsBits } from 'discord.js';
import { HELP_CATEGORIES } from '../util/help-categories';
import { Permissions } from '../models/permissions';
import { dm_task_model } from '../models/dm-tasks';
import https from 'https';
import http from 'http';

export default {
    require_perm: Permissions.ADMIN,
    category: HELP_CATEGORIES.UTILITY,
    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setName('dm_all')
        .setDescription('Sends a direct message to all users in the server with a configurable delay')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a new DM task')
                .addAttachmentOption(option =>
                    option.setName('embed_json')
                        .setDescription('JSON file containing the embed configuration')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('delay')
                        .setDescription('Delay between messages (default: 22)')
                        .setMinValue(1)
                        .setMaxValue(300))
                .addStringOption(option =>
                    option.setName('unit')
                        .setDescription('Time unit for delay (default: seconds)')
                        .addChoices(
                            { name: 'Seconds', value: 'seconds' },
                            { name: 'Minutes', value: 'minutes' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View the status of active DM tasks'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel an active DM task')
                .addStringOption(option =>
                    option.setName('task_id')
                        .setDescription('The ID of the task to cancel (leave empty to cancel current server task)')
                        .setRequired(false))),
    async execute(client: Client, interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'status') {
            await handleStatus(interaction, client);
        } else if (subcommand === 'cancel') {
            await handleCancel(interaction);
        } else if (subcommand === 'start') {
            await handleStart(interaction, client);
        }
    },
};

// Helper function to download attachment content
async function downloadAttachment(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download file: ${response.statusCode}`));
                return;
            }

            let data = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Helper function to validate and parse embed JSON
function parseEmbedJson(jsonString: string): { content?: string; embeds?: any[]; attachments?: any[] } {
    try {
        const parsed = JSON.parse(jsonString);
        
        // Validate basic structure
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('JSON must be an object');
        }

        // Check if it's the Discord message format with content/embeds/attachments
        if (parsed.content !== undefined || parsed.embeds !== undefined || parsed.attachments !== undefined) {
            // Discord message format
            const message: { content?: string; embeds?: any[]; attachments?: any[] } = {};
            
            if (parsed.content !== undefined) {
                if (typeof parsed.content !== 'string') {
                    throw new Error('Content must be a string');
                }
                message.content = parsed.content;
            }
            
            if (parsed.embeds !== undefined) {
                if (!Array.isArray(parsed.embeds)) {
                    throw new Error('Embeds must be an array');
                }
                
                if (parsed.embeds.length > 10) {
                    throw new Error('Maximum of 10 embeds allowed');
                }
                
                // Validate each embed has at least some content
                for (const embed of parsed.embeds) {
                    const hasContent = embed.title || embed.description || embed.fields || 
                                     embed.author || embed.footer || embed.image || embed.thumbnail;
                    
                    if (!hasContent) {
                        throw new Error('Each embed must have at least one of: title, description, fields, author, footer, image, or thumbnail');
                    }
                }
                
                message.embeds = parsed.embeds;
            }
            
            if (parsed.attachments !== undefined) {
                if (!Array.isArray(parsed.attachments)) {
                    throw new Error('Attachments must be an array');
                }
                message.attachments = parsed.attachments;
            }
            
            // Validate that there's at least some content
            if (!message.content && (!message.embeds || message.embeds.length === 0)) {
                throw new Error('Message must have either content or at least one embed');
            }
            
            return message;
        } else {
            // Legacy format: single embed or array of embeds
            const embedArray = Array.isArray(parsed) ? parsed : [parsed];
            
            // Validate embed count
            if (embedArray.length === 0) {
                throw new Error('At least one embed is required');
            }
            
            if (embedArray.length > 10) {
                throw new Error('Maximum of 10 embeds allowed');
            }

            // Validate each embed has at least some content
            for (const embed of embedArray) {
                const hasContent = embed.title || embed.description || embed.fields || 
                                 embed.author || embed.footer || embed.image || embed.thumbnail;
                
                if (!hasContent) {
                    throw new Error('Each embed must have at least one of: title, description, fields, author, footer, image, or thumbnail');
                }
            }

            return { embeds: embedArray };
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('Invalid JSON format: ' + error.message);
        }
        throw error;
    }
}

// Helper function to create embed from JSON
function createEmbedsFromJson(embedsData: any[]): EmbedBuilder[] {
    return embedsData.map(embedData => {
        const embed = new EmbedBuilder();

        if (embedData.title) embed.setTitle(embedData.title);
        if (embedData.description) embed.setDescription(embedData.description);
        if (embedData.url) embed.setURL(embedData.url);
        if (embedData.color) embed.setColor(embedData.color);
        if (embedData.timestamp) embed.setTimestamp(embedData.timestamp === true ? new Date() : new Date(embedData.timestamp));
        if (embedData.footer) {
            embed.setFooter({
                text: embedData.footer.text,
                iconURL: embedData.footer.icon_url
            });
        }
        if (embedData.image) embed.setImage(embedData.image.url || embedData.image);
        if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail.url || embedData.thumbnail);
        if (embedData.author) {
            embed.setAuthor({
                name: embedData.author.name,
                iconURL: embedData.author.icon_url,
                url: embedData.author.url
            });
        }
        if (embedData.fields && Array.isArray(embedData.fields)) {
            embed.addFields(embedData.fields.map((field: any) => ({
                name: field.name,
                value: field.value,
                inline: field.inline || false
            })));
        }

        return embed;
    });
}

async function handleStatus(interaction: ChatInputCommandInteraction, client: Client) {
    const activeTasks = await dm_task_model.find({
        guild_id: interaction.guildId!,
        is_active: true
    });

    if (activeTasks.length === 0) {
        await interaction.reply({
            content: 'No active DM tasks running in this server.',
            ephemeral: true
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('Active DM Tasks')
        .setColor(0x0099FF)
        .setTimestamp();

    for (const task of activeTasks) {
        const progress = ((task.sent_count + task.failed_count) / task.total_members * 100).toFixed(1);
        const user = await client.users.fetch(task.started_by).catch(() => null);

        // Calculate estimated time remaining
        const remainingMembers = task.total_members - task.current_index;
        const estimatedTimeMs = remainingMembers * task.delay;
        const estimatedFinishTime = new Date(Date.now() + estimatedTimeMs);
        const estimatedFinishEpoch = Math.floor(estimatedFinishTime.getTime() / 1000);

        // Format time remaining
        const hours = Math.floor(estimatedTimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((estimatedTimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((estimatedTimeMs % (1000 * 60)) / 1000);

        let timeRemainingStr = '';
        if (hours > 0) {
            timeRemainingStr = `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            timeRemainingStr = `${minutes}m ${seconds}s`;
        } else {
            timeRemainingStr = `${seconds}s`;
        }

        // Format delay display
        const delaySeconds = task.delay / 1000;
        let delayDisplay = '';
        if (delaySeconds >= 60) {
            const mins = Math.floor(delaySeconds / 60);
            const secs = delaySeconds % 60;
            delayDisplay = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
        } else {
            delayDisplay = `${delaySeconds}s`;
        }

        embed.addFields({
            name: `Task ${task._id}`,
            value: `**Started by:** ${user?.tag || 'Unknown'}\n**Progress:** ${task.sent_count + task.failed_count}/${task.total_members} (${progress}%)\n**Sent:** ${task.sent_count} | **Failed:** ${task.failed_count}\n**Delay:** ${delayDisplay}\n**Started:** <t:${Math.floor(task.started_at.getTime() / 1000)}:R>\n**Last processed:** <t:${Math.floor(task.last_processed_at.getTime() / 1000)}:R>\n**Est. time remaining:** ${timeRemainingStr}\n**Finishes:** <t:${estimatedFinishEpoch}:F> (<t:${estimatedFinishEpoch}:R>)`,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCancel(interaction: ChatInputCommandInteraction) {
    const taskId = interaction.options.getString('task_id');

    let task;
    if (taskId) {
        // Cancel specific task by ID
        task = await dm_task_model.findById(taskId);
        
        if (!task) {
            await interaction.reply({
                content: `Task with ID \`${taskId}\` not found.`,
                ephemeral: true
            });
            return;
        }

        if (!task.is_active) {
            await interaction.reply({
                content: `Task \`${taskId}\` is already completed or cancelled.`,
                ephemeral: true
            });
            return;
        }
    } else {
        // Cancel the active task in this server
        task = await dm_task_model.findOne({
            guild_id: interaction.guildId!,
            is_active: true
        });

        if (!task) {
            await interaction.reply({
                content: 'No active DM tasks running in this server.',
                ephemeral: true
            });
            return;
        }
    }

    // Mark task as cancelled
    await dm_task_model.findByIdAndUpdate(task._id, {
        is_active: false,
        completed_at: new Date()
    });

    const progress = ((task.sent_count + task.failed_count) / task.total_members * 100).toFixed(1);

    await interaction.reply({
        content: `✅ Task \`${task._id}\` has been cancelled.\n**Progress at cancellation:** ${task.sent_count + task.failed_count}/${task.total_members} (${progress}%)\n**Sent:** ${task.sent_count} | **Failed:** ${task.failed_count}`,
        ephemeral: true
    });
}

async function handleStart(interaction: ChatInputCommandInteraction, client: Client) {
    const delayValue = interaction.options.getInteger('delay') || 22;
    const unit = interaction.options.getString('unit') || 'seconds';
    const attachment = interaction.options.getAttachment('embed_json', true);

    // Validate file type
    if (!attachment.name.endsWith('.json')) {
        await interaction.reply({
            content: '❌ Please upload a valid JSON file (.json extension required)',
            ephemeral: true
        });
        return;
    }

    // Validate file size (max 1MB)
    if (attachment.size > 1024 * 1024) {
        await interaction.reply({
            content: '❌ JSON file is too large. Maximum size is 1MB.',
            ephemeral: true
        });
        return;
    }

    // Defer reply since we need to download and process the file
    await interaction.deferReply({ ephemeral: true });

    try {
        // Download and parse the JSON file
        const jsonContent = await downloadAttachment(attachment.url);
        const messageData = parseEmbedJson(jsonContent);
        
        // Create embeds if they exist
        const embeds = messageData.embeds ? createEmbedsFromJson(messageData.embeds) : [];
        const content = messageData.content || undefined;

        // Convert delay to milliseconds
        const delayMs = unit === 'minutes' ? delayValue * 60 * 1000 : delayValue * 1000;

        // Check if the bot has permission to send direct messages
        if (!interaction.guild) {
            await interaction.editReply({ content: 'I need permission to send messages in this server!' });
            return;
        }

        // Check if there's already an active task
        const existingTask = await dm_task_model.findOne({
            guild_id: interaction.guildId!,
            is_active: true
        });

        if (existingTask) {
            await interaction.editReply({
                content: 'There is already an active DM task running in this server. Please cancel it first with `/dm_all cancel` or wait for it to complete.'
            });
            return;
        }

        // Get all members
        const members = await interaction.guild.members.fetch();
        const memberArray = Array.from(members.values());

        // Filter out bots
        const humanMembers = memberArray.filter(member => !member.user.bot);
        const memberIds = humanMembers.map(m => m.id);

        if (humanMembers.length === 0) {
            await interaction.editReply({
                content: 'No human members found in this server to send DMs to.'
            });
            return;
        }

        // Calculate estimated completion time
        const estimatedTimeMs = humanMembers.length * delayMs;
        const estimatedFinishTime = new Date(Date.now() + estimatedTimeMs);
        const estimatedFinishEpoch = Math.floor(estimatedFinishTime.getTime() / 1000);

        // Format delay display for confirmation
        let delayDisplay = '';
        if (unit === 'minutes') {
            delayDisplay = `${delayValue} minute${delayValue !== 1 ? 's' : ''}`;
        } else {
            delayDisplay = `${delayValue} second${delayValue !== 1 ? 's' : ''}`;
        }

        // Create confirmation buttons
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_dm_task')
            .setLabel('Confirm & Start')
            .setStyle(ButtonStyle.Success);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_dm_task')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(confirmButton, cancelButton);

        // Show preview with confirmation buttons
        const previewMessage: any = {
            content: `📋 **DM Task Preview**\n\n**Server:** ${interaction.guild.name}\n**Total recipients:** ${humanMembers.length} members\n**Delay:** ${delayDisplay}\n**Estimated finish:** <t:${estimatedFinishEpoch}:F> (<t:${estimatedFinishEpoch}:R>)\n\n**Message preview:**${content ? '\n' + content : ''}`,
            components: [row]
        };
        
        if (embeds.length > 0) {
            previewMessage.embeds = embeds;
        }
        
        await interaction.editReply(previewMessage);

        // Wait for button interaction
        const filter = (i: any) => i.user.id === interaction.user.id;
        
        try {
            const buttonInteraction = await interaction.channel?.awaitMessageComponent({
                filter,
                componentType: ComponentType.Button,
                time: 60000 // 1 minute timeout
            });

            if (!buttonInteraction) {
                return;
            }

            if (buttonInteraction.customId === 'cancel_dm_task') {
                await buttonInteraction.update({
                    content: '❌ DM task cancelled.',
                    embeds: [],
                    components: []
                });
                return;
            }

            // User confirmed, create the task
            await buttonInteraction.deferUpdate();

            // Store the message data in the database
            const task = await dm_task_model.create({
                guild_id: interaction.guildId!,
                message: JSON.stringify(messageData), // Store the full message data
                delay: delayMs,
                total_members: humanMembers.length,
                sent_count: 0,
                failed_count: 0,
                current_index: 0,
                member_ids: memberIds,
                is_active: true,
                started_by: interaction.user.id,
                started_at: new Date(),
                last_processed_at: new Date(),
                completed_at: null
            });

            // Update the message to show task started
            await interaction.editReply({
                content: `✅ DM task started!\n\n**Server:** ${interaction.guild.name}\n**Total recipients:** ${humanMembers.length} members\n**Delay:** ${delayDisplay}\n**Task ID:** \`${task._id}\`\n**Estimated finish:** <t:${estimatedFinishEpoch}:F> (<t:${estimatedFinishEpoch}:R>)\n\nThis task will persist across bot restarts.\nUse \`/dm_all cancel\` to stop this task.`,
                embeds: [],
                components: []
            });

            // Start processing the task
            processDmTask(client, task._id.toString());

        } catch (error) {
            // Timeout or other error
            await interaction.editReply({
                content: '⏱️ Confirmation timed out. Please run the command again.',
                embeds: [],
                components: []
            });
        }

    } catch (error) {
        console.error('Error processing embed JSON:', error);
        await interaction.editReply({
            content: `❌ Error processing JSON file: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease ensure your JSON is valid and follows the Discord embed format.`
        });
    }
}

// Helper function to wrap a promise with a timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
        )
    ]);
}

// Function to process DM tasks (can be called on bot startup to resume tasks)
export async function processDmTask(client: Client, taskId: string) {
    const task = await dm_task_model.findById(taskId);

    if (!task || !task.is_active) {
        return;
    }

    // Parse the message data from the stored message
    let messageData: { content?: string; embeds?: any[]; attachments?: any[] };
    try {
        messageData = JSON.parse(task.message);
    } catch (error) {
        console.error(`Failed to parse message data for task ${taskId}:`, error);
        await dm_task_model.findByIdAndUpdate(taskId, {
            is_active: false,
            completed_at: new Date()
        });
        return;
    }

    // Build the message to send
    const messageToSend: any = {};
    
    if (messageData.content) {
        messageToSend.content = messageData.content;
    }
    
    if (messageData.embeds && messageData.embeds.length > 0) {
        messageToSend.embeds = createEmbedsFromJson(messageData.embeds);
    }

    const guild = await client.guilds.fetch(task.guild_id).catch(() => null);
    if (!guild) {
        // Guild not found, mark task as failed
        await dm_task_model.findByIdAndUpdate(taskId, {
            is_active: false,
            completed_at: new Date()
        });
        return;
    }

    // Timeout for fetching member and sending DM (30 seconds)
    const OPERATION_TIMEOUT = 30000;

    // Process members one at a time
    while (task.current_index < task.member_ids.length) {
        const memberId = task.member_ids[task.current_index];
        let skipped = false;

        try {
            // Fetch member with timeout
            const member = await withTimeout(
                guild.members.fetch(memberId),
                OPERATION_TIMEOUT
            ).catch(() => null);

            if (member) {
                try {
                    // Send DM with timeout
                    await withTimeout(
                        member.send(messageToSend),
                        OPERATION_TIMEOUT
                    );
                    task.sent_count++;
                } catch (error) {
                    task.failed_count++;
                    if (error instanceof Error && error.message === 'Operation timed out') {
                        console.error(`Timeout sending DM to ${member.user.tag}, skipping...`);
                        skipped = true;
                    } else {
                        console.error(`Failed to send DM to ${member.user.tag}:`, error);
                    }
                }
            } else {
                task.failed_count++;
                console.error(`Failed to fetch member ${memberId}, skipping...`);
            }
        } catch (error) {
            task.failed_count++;
            if (error instanceof Error && error.message === 'Operation timed out') {
                console.error(`Timeout fetching member ${memberId}, skipping...`);
                skipped = true;
            } else {
                console.error(`Error processing member ${memberId}:`, error);
            }
        }

        task.current_index++;
        task.last_processed_at = new Date();

        // Save progress to database
        await dm_task_model.findByIdAndUpdate(taskId, {
            sent_count: task.sent_count,
            failed_count: task.failed_count,
            current_index: task.current_index,
            last_processed_at: task.last_processed_at
        });

        // Add delay between messages
        if (task.current_index < task.member_ids.length) {
            await new Promise(resolve => setTimeout(resolve, task.delay));
        }

        // Refresh task data to check if it was cancelled
        const refreshedTask = await dm_task_model.findById(taskId);
        if (!refreshedTask || !refreshedTask.is_active) {
            console.log(`Task ${taskId} was cancelled`);
            return;
        }

        // Log if member was skipped due to timeout
        if (skipped) {
            console.log(`Skipped member ${memberId} due to timeout, continuing with next member...`);
        }
    }

    // Mark task as completed
    await dm_task_model.findByIdAndUpdate(taskId, {
        is_active: false,
        completed_at: new Date()
    });

    console.log(`DM task ${taskId} completed. Sent: ${task.sent_count}, Failed: ${task.failed_count}`);
}

// Function to resume all active tasks (call this when bot starts)
export async function resumeAllDmTasks(client: Client) {
    const activeTasks = await dm_task_model.find({ is_active: true });

    console.log(`Resuming ${activeTasks.length} active DM tasks...`);

    for (const task of activeTasks) {
        processDmTask(client, task._id.toString());
    }
}