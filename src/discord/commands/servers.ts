import {
    SlashCommandBuilder,
    Client,
    ChatInputCommandInteraction,
    Message,
    AutocompleteInteraction,
    InteractionContextType,
    MessageFlags,
    EmbedBuilder,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    Guild
} from 'discord.js';
import { Permissions } from '../models/permissions';
import { HELP_CATEGORIES } from '../util/help-categories';
import { ManagedGuild } from '../models/managed_guild';
import { get_settings } from '../util/settings';
import { msg_logging_config_model } from '../models/msg_logging_config';
import { boost_log_config_model } from '../models/boostLogConfig';
import { msg_command_settings_model } from '../models/msg_command_settings';
import { AutoDeleteModel } from '../models/autodelete';
import vc_model from '../models/vc_channel';
import { UserNumberConfigModel } from '../models/nab';
import { pool_model } from '../models/pools';
import { command_log_model } from '../models/command_logs';

// Tab types for the server details view
export type ServerTab = 'info' | 'perms' | 'config' | 'usage';

// Fetch all server data needed for embeds
export async function fetchServerData(guildId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
        managedGuild,
        settings,
        msgLoggingConfig,
        boostLogConfig,
        msgCommandSettings,
        autoDeleteConfigs,
        vcConfig,
        nabConfig,
        poolConfig,
        mostUsedCommands,
        topUsers,
        mostFailedCommands
    ] = await Promise.all([
        ManagedGuild.findOne({ guildId }),
        get_settings(guildId),
        msg_logging_config_model.findOne({ guild_id: guildId }),
        boost_log_config_model.findOne({ guild_id: guildId }),
        msg_command_settings_model.findOne({ guild_id: guildId }),
        AutoDeleteModel.find({ guildId }),
        vc_model.findOne({ guildId }),
        UserNumberConfigModel.findOne({ guildId }),
        pool_model.findOne({ 'servers.guild_id': guildId }),
        command_log_model.aggregate([
            {
                $match: {
                    guild_id: guildId,
                    timestamp: { $gte: thirtyDaysAgo },
                    interaction_type: 'slash_command'
                }
            },
            { $group: { _id: '$command_name', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]),
        command_log_model.aggregate([
            {
                $match: {
                    guild_id: guildId,
                    timestamp: { $gte: thirtyDaysAgo },
                    interaction_type: 'slash_command'
                }
            },
            { $group: { _id: '$user_id', username: { $last: '$username' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]),
        command_log_model.aggregate([
            {
                $match: {
                    guild_id: guildId,
                    timestamp: { $gte: thirtyDaysAgo },
                    interaction_type: 'slash_command',
                    $or: [{ success: false }, { status: 'failed' }]
                }
            },
            { $group: { _id: '$command_name', count: { $sum: 1 }, lastError: { $last: '$error_message' } } },
            { $sort: { count: -1 } },
            { $limit: 3 }
        ])
    ]);

    return {
        managedGuild,
        settings,
        msgLoggingConfig,
        boostLogConfig,
        msgCommandSettings,
        autoDeleteConfigs,
        vcConfig,
        nabConfig,
        poolConfig,
        mostUsedCommands,
        topUsers,
        mostFailedCommands
    };
}

// Build Server Info embed
export async function buildServerInfoEmbed(guild: Guild, data: Awaited<ReturnType<typeof fetchServerData>>): Promise<EmbedBuilder> {
    const members = guild.members.cache;
    const userCount = members.filter(m => !m.user.bot).size;
    const botCount = members.filter(m => m.user.bot).size;
    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    let inviteUrl = '';
    if (guild.vanityURLCode) {
        inviteUrl = `discord.gg/${guild.vanityURLCode}`;
    } else {
        try {
            const botMember = guild.members.me;
            if (botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
                const invites = await guild.invites.fetch();
                const permanentInvite = invites.find(i => i.maxAge === 0);
                if (permanentInvite) {
                    inviteUrl = `discord.gg/${permanentInvite.code}`;
                }
            }
        } catch {
            // Ignore
        }
    }

    const lines = [
        `**Server ID:** ${guild.id}`,
        `**Created:** <t:${createdAt}:F>`,
        `**Members:** ${userCount} users, ${botCount} bots`,
        `**Boost Tier:** ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`,
        `**Owner:** <@${guild.ownerId}>`
    ];

    if (inviteUrl) lines.push(`**Invite:** ${inviteUrl}`);

    if (data.managedGuild) {
        lines.push('', '**Managed Status:**');
        lines.push(`  Onboarded: ${data.managedGuild.isOnboarded ? 'Yes' : 'No'}`);
        lines.push(`  Applications: ${data.managedGuild.applicationsEnabled ? 'Enabled' : 'Disabled'}`);
    }

    return new EmbedBuilder()
        .setTitle(guild.name)
        .setDescription(lines.join('\n'))
        .setColor(0x00FFFF)
        .setThumbnail(guild.iconURL({ size: 256 }));
}

// Build Bot Permissions embed
export function buildPermissionsEmbed(guild: Guild): EmbedBuilder {
    const botMember = guild.members.me;
    if (!botMember) {
        return new EmbedBuilder()
            .setTitle('Bot Permissions')
            .setDescription('Could not fetch bot member.')
            .setColor(0xFF0000);
    }

    const perms = botMember.permissions;
    const keyPerms = [
        { name: 'Administrator', flag: PermissionFlagsBits.Administrator },
        { name: 'Manage Server', flag: PermissionFlagsBits.ManageGuild },
        { name: 'Manage Roles', flag: PermissionFlagsBits.ManageRoles },
        { name: 'Manage Channels', flag: PermissionFlagsBits.ManageChannels },
        { name: 'Kick Members', flag: PermissionFlagsBits.KickMembers },
        { name: 'Ban Members', flag: PermissionFlagsBits.BanMembers },
        { name: 'Manage Messages', flag: PermissionFlagsBits.ManageMessages },
        { name: 'Manage Webhooks', flag: PermissionFlagsBits.ManageWebhooks },
        { name: 'View Audit Log', flag: PermissionFlagsBits.ViewAuditLog },
        { name: 'Create Invite', flag: PermissionFlagsBits.CreateInstantInvite }
    ];

    const permLines = keyPerms.map(p => `  ${p.name}: ${perms.has(p.flag) ? 'Yes' : 'No'}`);

    return new EmbedBuilder()
        .setTitle('Bot Permissions')
        .setDescription('**Key Permissions:**\n' + permLines.join('\n'))
        .setColor(0x0099FF);
}

// Build Bot Configuration embed
export function buildConfigEmbed(guildId: string, data: Awaited<ReturnType<typeof fetchServerData>>): EmbedBuilder {
    const lines: string[] = [];

    if (data.settings) {
        const roles = data.settings.roles as any;
        const rolesSummary: string[] = [];
        if (roles?.admin) rolesSummary.push(`Admin: ${Array.isArray(roles.admin) ? roles.admin.length : 1} role(s)`);
        if (roles?.member) rolesSummary.push(`Member: ${Array.isArray(roles.member) ? roles.member.length : 1} role(s)`);
        if (roles?.autorole) rolesSummary.push(`Autorole: ${Array.isArray(roles.autorole) ? roles.autorole.length : 1} role(s)`);
        if (roles?.mod) rolesSummary.push(`Mod: ${Array.isArray(roles.mod) ? roles.mod.length : 1} role(s)`);
        if (roles?.janny) rolesSummary.push(`Janny: ${Array.isArray(roles.janny) ? roles.janny.length : 1} role(s)`);

        if (rolesSummary.length > 0) {
            lines.push('**Roles Configured:**');
            rolesSummary.forEach(r => lines.push(`  ${r}`));
            lines.push('');
        }

        const channelsSummary: string[] = [];
        if (data.settings.channels?.janny_log) channelsSummary.push('Janny Log');
        if (data.settings.channels?.vc_home) channelsSummary.push('VC Home');
        if (data.settings.channels?.monoko) channelsSummary.push('Monoko');

        if (channelsSummary.length > 0) {
            lines.push('**Channels Configured:**');
            lines.push(`  ${channelsSummary.join(', ')}`);
            lines.push('');
        }

        lines.push('**Guild Settings:**');
        lines.push(`  Prefix: ${data.settings.guild?.prefix || 'Default'}`);
        lines.push(`  Lookback: ${data.settings.guild?.lookback || 60}`);
        lines.push('');
    }

    const features: string[] = [];
    if (data.msgLoggingConfig?.enabled) features.push('Msg Logging: Enabled');
    if (data.boostLogConfig?.enabled) features.push('Boost Logging: Enabled');
    if (data.msgCommandSettings?.command_enabled) features.push('Msg Commands: Enabled');

    if (data.autoDeleteConfigs && data.autoDeleteConfigs.length > 0) {
        const enabledCount = data.autoDeleteConfigs.filter(c => c.enabled).length;
        features.push(`AutoDelete: ${enabledCount}/${data.autoDeleteConfigs.length} channels`);
    }

    if (data.vcConfig && data.vcConfig.channels) {
        const channelCount = data.vcConfig.channels instanceof Map
            ? data.vcConfig.channels.size
            : Object.keys(data.vcConfig.channels).length;
        if (channelCount > 0) features.push(`VC Channels: ${channelCount} configured`);
    }

    if (data.nabConfig?.enabled) {
        features.push(`NAB: Enabled (${data.nabConfig.mode}, prefix: ${data.nabConfig.prefix})`);
    }

    if (data.poolConfig) {
        const serverInPool = data.poolConfig.servers.find((s: any) => s.guild_id === guildId);
        if (serverInPool) {
            features.push(`Boost Pool: ${data.poolConfig.pool_name} (${serverInPool.is_lead_server ? 'Lead' : 'Member'})`);
        }
    }

    if (features.length > 0) {
        lines.push('**Active Features:**');
        features.forEach(f => lines.push(`  ${f}`));
    } else {
        lines.push('**Active Features:** None configured');
    }

    return new EmbedBuilder()
        .setTitle('Bot Configuration')
        .setDescription(lines.join('\n') || 'No configuration data.')
        .setColor(0x0099FF);
}

// Build Command Usage embed
export function buildUsageEmbed(data: Awaited<ReturnType<typeof fetchServerData>>): EmbedBuilder {
    const lines: string[] = [];

    if (data.mostUsedCommands && data.mostUsedCommands.length > 0) {
        lines.push('**Most Used Commands:**');
        data.mostUsedCommands.forEach((cmd: any, i: number) => {
            lines.push(`  ${i + 1}. ${cmd._id} - ${cmd.count} uses`);
        });
        lines.push('');
    }

    if (data.topUsers && data.topUsers.length > 0) {
        lines.push('**Top Users:**');
        data.topUsers.forEach((user: any, i: number) => {
            lines.push(`  ${i + 1}. <@${user._id}> - ${user.count} commands`);
        });
        lines.push('');
    }

    if (data.mostFailedCommands && data.mostFailedCommands.length > 0) {
        lines.push('**Most Failed Commands:**');
        data.mostFailedCommands.forEach((cmd: any, i: number) => {
            const errorHint = cmd.lastError ? ` (${cmd.lastError.substring(0, 30)}...)` : '';
            lines.push(`  ${i + 1}. ${cmd._id} - ${cmd.count} failures${errorHint}`);
        });
    }

    return new EmbedBuilder()
        .setTitle('Command Usage (Last 30 Days)')
        .setDescription(lines.join('\n') || 'No command usage data.')
        .setColor(0x9966FF);
}

// Build tab buttons
export function buildTabButtons(userId: string, guildId: string, activeTab: ServerTab): ActionRowBuilder<ButtonBuilder> {
    const tabs: { id: ServerTab; label: string }[] = [
        { id: 'info', label: 'Server Info' },
        { id: 'perms', label: 'Permissions' },
        { id: 'config', label: 'Configuration' },
        { id: 'usage', label: 'Usage Stats' }
    ];

    const buttons = tabs.map(tab =>
        new ButtonBuilder()
            .setCustomId(`servers-tab:${userId}:${guildId}:${tab.id}`)
            .setLabel(tab.label)
            .setStyle(activeTab === tab.id ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeTab === tab.id)
    );

    return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

// Build action buttons (Create Invite, Leave Server)
export function buildActionButtons(userId: string, guildId: string): ActionRowBuilder<ButtonBuilder> {
    const inviteButton = new ButtonBuilder()
        .setCustomId(`servers-invite:${userId}:${guildId}`)
        .setLabel('Create Invite')
        .setStyle(ButtonStyle.Success);

    const leaveButton = new ButtonBuilder()
        .setCustomId(`servers-leave:${userId}:${guildId}`)
        .setLabel('Leave Server')
        .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(inviteButton, leaveButton);
}

// Build leave confirmation buttons
export function buildLeaveConfirmButtons(userId: string, guildId: string): ActionRowBuilder<ButtonBuilder> {
    const confirmButton = new ButtonBuilder()
        .setCustomId(`servers-leave-confirm:${userId}:${guildId}`)
        .setLabel('Yes, Leave Server')
        .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
        .setCustomId(`servers-leave-cancel:${userId}:${guildId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);
}

// Pagination constants
const SERVERS_PER_PAGE = 10;

// Build server list pagination buttons
export function buildServerListPagination(userId: string, currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
    const firstButton = new ButtonBuilder()
        .setCustomId(`servers-list-first:${userId}:0`)
        .setLabel('First')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0);

    const prevButton = new ButtonBuilder()
        .setCustomId(`servers-list-prev:${userId}:${Math.max(0, currentPage - 1)}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId(`servers-list-next:${userId}:${Math.min(totalPages - 1, currentPage + 1)}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages - 1);

    const lastButton = new ButtonBuilder()
        .setCustomId(`servers-list-last:${userId}:${totalPages - 1}`)
        .setLabel('Last')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(firstButton, prevButton, nextButton, lastButton);
}

// Build server list embed for a specific page
export function buildServerListEmbed(client: Client, page: number): { embed: EmbedBuilder; totalPages: number } {
    const guilds = Array.from(client.guilds.cache.values());
    const totalPages = Math.ceil(guilds.length / SERVERS_PER_PAGE);
    const safePage = Math.max(0, Math.min(page, totalPages - 1));

    let totalUsers = 0;
    let totalBots = 0;
    const serverLines: string[] = [];

    // Calculate totals for all servers
    for (const guild of guilds) {
        const members = guild.members.cache;
        const userCount = members.filter(m => !m.user.bot).size;
        const botCount = members.filter(m => m.user.bot).size;
        totalUsers += userCount;
        totalBots += botCount;
    }

    // Get servers for current page
    const startIndex = safePage * SERVERS_PER_PAGE;
    const pageGuilds = guilds.slice(startIndex, startIndex + SERVERS_PER_PAGE);

    for (const guild of pageGuilds) {
        const members = guild.members.cache;
        const userCount = members.filter(m => !m.user.bot).size;
        const botCount = members.filter(m => m.user.bot).size;

        const displayName = guild.name.length > 25
            ? guild.name.substring(0, 22) + '...'
            : guild.name;

        serverLines.push(
            `\`${guild.id}\` | **${displayName}**\n` +
            `  ${userCount} users, ${botCount} bots`
        );
    }

    const embed = new EmbedBuilder()
        .setTitle('Bot Server Overview')
        .setDescription(
            `**Total Servers:** ${guilds.length}\n` +
            `**Total Users:** ${totalUsers.toLocaleString()}\n` +
            `**Total Bots:** ${totalBots.toLocaleString()}\n\n` +
            `---\n\n` +
            serverLines.join('\n\n')
        )
        .setColor(0x00FFFF)
        .setFooter({ text: `Page ${safePage + 1}/${totalPages} | Use /servers server:<name or id> to view details` });

    return { embed, totalPages };
}

export default {
    require_perm: Permissions.BOT_OWNER,
    category: HELP_CATEGORIES.SYSTEM_CONFIG,
    help: 'View all servers the bot is in and their configurations',

    data: new SlashCommandBuilder()
        .setContexts(InteractionContextType.Guild)
        .setName('servers')
        .setDescription('View all servers the bot is in and their configurations')
        .addStringOption(option =>
            option.setName('server')
                .setDescription('Server name or ID to view details')
                .setRequired(false)
                .setAutocomplete(true)
        ),

    async autocomplete(client: Client, interaction: AutocompleteInteraction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const guilds = client.guilds.cache;

        const filtered = Array.from(guilds.values())
            .filter(g =>
                g.name.toLowerCase().includes(focused) ||
                g.id.includes(focused)
            )
            .map(g => ({
                name: `${g.name.substring(0, 80)} (${g.id})`.substring(0, 100),
                value: g.id
            }))
            .slice(0, 25);

        await interaction.respond(filtered);
    },

    async execute(client: Client, interaction: ChatInputCommandInteraction | Message) {
        if (interaction instanceof Message) return;

        const serverId = interaction.options.getString('server');

        if (!serverId) {
            return await showServerList(client, interaction);
        }

        return await showServerDetails(client, interaction, serverId);
    }
};

async function showServerList(client: Client, interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { embed, totalPages } = buildServerListEmbed(client, 0);
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    // Only show pagination if there's more than one page
    if (totalPages > 1) {
        components.push(buildServerListPagination(interaction.user.id, 0, totalPages));
    }

    await interaction.editReply({
        embeds: [embed],
        components
    });
}

async function showServerDetails(client: Client, interaction: ChatInputCommandInteraction, guildId: string) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        return await interaction.editReply({
            embeds: [{
                title: 'Error',
                description: 'Could not find the selected server. It may have been removed.',
                color: 0xFF0000
            }]
        });
    }

    const data = await fetchServerData(guildId);
    const embed = await buildServerInfoEmbed(guild, data);
    const tabButtons = buildTabButtons(interaction.user.id, guildId, 'info');
    const actionButtons = buildActionButtons(interaction.user.id, guildId);

    await interaction.editReply({
        embeds: [embed],
        components: [tabButtons, actionButtons]
    });
}
