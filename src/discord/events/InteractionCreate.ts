// src/discord/events/InteractionCreate.ts
import { Client, Events, MessageFlags } from 'discord.js';
import { check_level } from '../util/permissions';
import { Permissions } from '../models/permissions';
import { commandLogger } from '../util/command-logger';
import { commandRateLimiter } from '../util/command-rate-limiter';

export default {
    name: Events.InteractionCreate,
    async execute(client: Client, interaction: any) {
        const command = client.commands.get(interaction.commandName)

        // Check if the interaction is autocomplete
        if (interaction.isAutocomplete()) {
            if (!command) return
            
            const logId = await commandLogger.logCommand(
                interaction.commandName,
                interaction.user.id,
                interaction.user.username,
                'autocomplete',
                0, // autocomplete doesn't require permissions
                interaction.guild?.id,
                undefined,
                interaction.options?.data
            );
            
            const startTime = Date.now();
            try {
                const result = await command.autocomplete(client, interaction);
                await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
                return result;
            } catch (error) {
                console.log(error);
                await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, error instanceof Error ? error.message : String(error));
                throw error;
            }
        }

        // Handle chat input commands
        if (interaction.isChatInputCommand()) {
            if (!command) return console.error(`No command matching ${interaction.commandName} was found.`)

            const level = await check_level(interaction)
            interaction.level = level

            // Check rate limiting for slash commands
            const rateLimitCheck = await commandRateLimiter.checkRateLimit(
                interaction.user.id,
                interaction.guild?.id || 'dm',
                interaction.commandName,
                level
            );
            
            if (!rateLimitCheck.allowed) {
                if (rateLimitCheck.embed) {
                    try {
                        await interaction.reply({
                            embeds: [rateLimitCheck.embed],
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch (error) {
                        console.error('Failed to send rate limit message:', error);
                    }
                }
                return;
            }

            const logId = await commandLogger.logCommand(
                interaction.commandName,
                interaction.user.id,
                interaction.user.username,
                'slash_command',
                level,
                interaction.guild?.id,
                undefined,
                interaction.options?.data
            );

            if (level < command?.require_perm) {
                console.log(`${interaction.user.username} tried to run "${interaction.commandName}" with level ${level}. Requires ${command?.require_perm}`);
                try {
                    let error_message = "You don't have permission to use this command!"
                    if (command?.require_perm == Permissions.BOOSTER && level.valueOf() < Permissions.BOOSTER) {
                        error_message = "Boost the server to get access to this command!"
                    }
                    await commandLogger.updateCommandResult(logId, false, undefined, error_message, 'permission_denied');
                    return await interaction.reply({
                        content: error_message,
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (err) {
                    await commandLogger.updateCommandResult(logId, false, undefined, "Failed to send permission error response", 'permission_denied');
                    return
                }
            }
            
            console.log(`Slash command: running ${command.data.name} for ${interaction.user.username}`)
            
            // Record command usage for rate limiting
            await commandRateLimiter.recordCommandUsage(interaction.user.id, interaction.guild?.id || 'dm', interaction.commandName);
            
            const startTime = Date.now();
            try {
                await command?.execute(client, interaction);
                await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
            } catch (error) {
                console.error(`Error executing command ${interaction.commandName}:`, error);
                await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, error instanceof Error ? error.message : String(error));
                throw error;
            }
        }

        // Handling button interactions with restriction based on creator
        if (interaction.isButton()) {
            if (interaction.customId.includes('_page:')) return
            if (interaction.customId.startsWith('rape-')) return
            
            const level = await check_level(interaction);
            const logId = await commandLogger.logCommand(
                interaction.customId,
                interaction.user.id,
                interaction.user.username,
                'button',
                level,
                interaction.guild?.id,
                interaction.customId
            );

            const button = client.buttons.get(interaction.customId)

            // Check if the button interaction is tied to a creator
            const creatorId = interaction.customId.split(':')[1]; // Assuming creator ID is part of customId format 'action:userId'
            if (creatorId && interaction.user.id !== creatorId) {
                await commandLogger.updateCommandResult(logId, false, undefined, "Not the button creator");
                return await interaction.reply({
                    content: "This is not yours.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const startTime = Date.now();
            try {
                if (button) {
                    console.log(`Command: running ${button.data.name} for ${interaction.user.username}`)
                    const result = await button.execute(client, interaction);
                    await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
                    return result;
                }

                const [action, user_id, ...other] = interaction.customId.split(':');
                if (user_id) {
                    const actionButton = client.buttons.get(action)
                    interaction.button_var = user_id
                    interaction.passed = other
                    console.log(`Command: running ${actionButton?.data.name} for ${interaction.user.username}`)
                    const result = await actionButton?.execute(client, interaction);
                    await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
                    return result;
                }
                
                await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, "No button handler found");
            } catch (error) {
                console.error(`Error executing button ${interaction.customId}:`, error);
                await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, error instanceof Error ? error.message : String(error));
                throw error;
            }
        }

        if (interaction.isModalSubmit()) {
            // if (interaction.customId.startsWith('apply-')) return await handleApplyModal(interaction);
            const level = await check_level(interaction);
            const logId = await commandLogger.logCommand(
                interaction.customId,
                interaction.user.id,
                interaction.user.username,
                'modal',
                level,
                interaction.guild?.id,
                interaction.customId,
                interaction.fields?.fields
            );

            const modal = client.modals.get(interaction.customId)
            const creatorId = interaction.customId.split(':')[1]; // Assuming creator ID is part of customId format 'action:userId'
            if (creatorId && interaction.user.id !== creatorId) {
                await commandLogger.updateCommandResult(logId, false, undefined, "Not the modal creator");
                return await interaction.reply({
                    content: "This is not yours.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const startTime = Date.now();
            try {
                if (modal) {
                    console.log(`Command: submitting ${modal.data.name} for ${interaction.user.username}`)
                    const result = await modal.execute(client, interaction);
                    await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
                    return result;
                }

                const [action, user_id, ...other] = interaction.customId.split(':');
                if (user_id) {
                    const actionModal = client.modals.get(action)
                    interaction.owner_id = user_id
                    interaction.passed = other
                    console.log(`Command: submitting ${actionModal?.data.name} for ${interaction.user.username}`)
                    const result = await actionModal?.execute(client, interaction);
                    await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
                    return result;
                }
                
                await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, "No modal handler found");
            } catch (error) {
                console.error(`Error executing modal ${interaction.customId}:`, error);
                await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, error instanceof Error ? error.message : String(error));
                throw error;
            }
        }

        // Handling select menu interactions with restriction based on creator
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.includes('help_category:')) return

            const level = await check_level(interaction);
            const logId = await commandLogger.logCommand(
                interaction.customId,
                interaction.user.id,
                interaction.user.username,
                'select_menu',
                level,
                interaction.guild?.id,
                interaction.customId,
                { values: interaction.values }
            );

            const menu = client.menus.get(interaction.customId)

            // Check if the select menu interaction is tied to a creator
            const creatorId = interaction.customId.split(':')[1]; // Assuming creator ID is part of customId format
            if (creatorId && interaction.user.id !== creatorId) {
                await commandLogger.updateCommandResult(logId, false, undefined, "Not the menu creator");
                return await interaction.reply({
                    content: "This is not your interaction. Run the command yourself",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const startTime = Date.now();
            try {
                if (menu) {
                    console.log(`Command: running ${menu?.data.name} for ${interaction.user.username}`)
                    const result = await menu.execute(client, interaction);
                    await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
                    return result;
                }

                const [action, argument] = interaction.customId.split(':');
                if (argument) {
                    const string_select = client.menus.get(action)
                    interaction.argument = argument
                    console.log(`Command: running ${string_select?.data.name} for ${interaction.user.username}`)
                    const result = await string_select?.execute(client, interaction);
                    await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
                    return result;
                }
                
                await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, "No select menu handler found");
            } catch (error) {
                console.error(`Error executing select menu ${interaction.customId}:`, error);
                await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, error instanceof Error ? error.message : String(error));
                throw error;
            }
        }

        // Handling channel select menu interactions with restriction
        if (interaction.isChannelSelectMenu()) {
            const menu = client.menus.get(interaction.customId)

            // Check if the channel select menu interaction is tied to a creator
            const creatorId = interaction.customId.split(':')[1];
            if (creatorId && interaction.user.id !== creatorId) {
                return await interaction.reply({
                    content: "This is not your interaction. Run the command yourself",
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (menu) {
                console.log(`Command: running ${menu?.data.name} for ${interaction.user.username}`)
                return await menu.execute(client, interaction)
            }

            const [action, creator, argument] = interaction.customId.split(':');
            if (argument || creator) {
                const channel_select = client.menus.get(action)
                interaction.argument = argument
                console.log(`Command: running ${channel_select?.data.name} for ${interaction.user.username}`)
                return await channel_select?.execute(client, interaction)
            }
        }

        // Handling role select menu interactions with restriction
        if (interaction.isRoleSelectMenu()) {
            const menu = client.menus.get(interaction.customId)

            // Check if the role select menu interaction is tied to a creator
            const creatorId = interaction.customId.split(':')[1];
            if (creatorId && interaction.user.id !== creatorId) {
                return await interaction.reply({
                    content: "This is not your interaction. Run the command yourself",
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (menu) {
                console.log(`Command: running ${menu?.data.name} for ${interaction.user.username}`)
                return await menu.execute(client, interaction)
            }

            const [action, creator, argument] = interaction.customId.split(':');
            if (argument) {
                const role_select = client.menus.get(action)
                interaction.argument = argument
                console.log(`Command: running ${role_select?.data.name} for ${interaction.user.username}`)
                return await role_select?.execute(client, interaction)
            }
        }

        // Handling mentionable select menu interactions with restriction
        if (interaction.isMentionableSelectMenu()) {
            const menu = client.menus.get(interaction.customId)

            // Check if the mentionable select menu interaction is tied to a creator
            const creatorId = interaction.customId.split(':')[1];
            if (creatorId && interaction.user.id !== creatorId) {
                return await interaction.reply({
                    content: "This is not your interaction. Run the command yourself",
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (menu) {
                console.log(`Command: running ${menu?.data.name} for ${interaction.user.username}`)
                return await menu.execute(client, interaction)
            }

            const [action, author, argument] = interaction.customId.split(':');
            if (argument) {
                const member_select = client.menus.get(action)
                interaction.argument = argument
                console.log(`Command: running ${member_select?.data.name} for ${interaction.user.username}`)
                return await member_select?.execute(client, interaction)
            }
        }

        // Handling context menu commands
        if (interaction.isContextMenuCommand()) {
            const level = await check_level(interaction);
            const logId = await commandLogger.logCommand(
                interaction.commandName,
                interaction.user.id,
                interaction.user.username,
                'context_menu',
                level,
                interaction.guild?.id,
                undefined,
                { targetId: interaction.targetId, targetType: interaction.targetType }
            );

            const command = client.commands.get(interaction.commandName)
            if (command) {
                console.log(`Context app: running ${command?.data.name} for ${interaction.user.username}`)
                const startTime = Date.now();
                try {
                    const result = await command.execute(client, interaction);
                    await commandLogger.updateCommandResult(logId, true, Date.now() - startTime);
                    return result;
                } catch (error) {
                    console.error(`Error executing context menu ${interaction.commandName}:`, error);
                    await commandLogger.updateCommandResult(logId, false, Date.now() - startTime, error instanceof Error ? error.message : String(error));
                    throw error;
                }
            } else {
                await commandLogger.updateCommandResult(logId, false, undefined, "No context menu handler found");
            }
        }
    },
};
