// util/boostLogger.ts
import { Client, EmbedBuilder, TextChannel, Guild, GuildMember } from 'discord.js';
import { boost_log_config_model } from '../models/boostLogConfig';
import { boost_model } from '../models/boosts';
import { UserNumberAssignmentModel } from '../models/nab';
import { pool_model } from '../models/pools';

export interface BoostLogData {
    userId: string;
    guildId: string;
    type: 'boost_start' | 'boost_end';
    timestamp: Date;
    nickname?: string;
    poolInfo?: {
        poolId: string;
        poolName: string;
        isAuxiliary: boolean;
        originalGuildId?: string;
    };
}

export class BoostLogger {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Log a boost event (start or end)
     */
    async logBoostEvent(data: BoostLogData): Promise<void> {
        try {
            // Get logging config for this guild
            const config = await boost_log_config_model.findOne({
                guild_id: data.guildId,
                enabled: true
            });

            if (!config) {
                return; // Logging not configured or disabled
            }

            // Get the log channel
            const logChannel = await this.client.channels.fetch(config.log_channel_id).catch(() => null);
            if (!logChannel || !(logChannel instanceof TextChannel)) {
                console.error(`Boost log channel ${config.log_channel_id} not found or not a text channel`);
                return;
            }

            // Get guild and member info
            const guild = this.client.guilds.cache.get(data.guildId);
            if (!guild) return;

            const member = await guild.members.fetch(data.userId).catch(() => null);
            if (!member) return;

            // Create appropriate embed based on event type
            const embed = data.type === 'boost_start'
                ? await this.createBoostStartEmbed(member, data, guild)
                : await this.createBoostEndEmbed(member, data, guild);

            await logChannel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error logging boost event:', error);
        }
    }

    /**
     * Create embed for boost start event
     */
    private async createBoostStartEmbed(member: GuildMember, data: BoostLogData, guild: Guild): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setTitle('Boost Started')
            .setColor(0x00FF00)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp(data.timestamp);

        const fields: string[] = [
            `**User:** ${member.user.tag} (${member})`,
            `**Nickname:** ${data.nickname || member.user.username}`
        ];

        // Add pool information if applicable
        if (data.poolInfo) {
            if (data.poolInfo.isAuxiliary && data.poolInfo.originalGuildId) {
                const originalGuild = this.client.guilds.cache.get(data.poolInfo.originalGuildId);
                fields.push(`**Type:** Auxiliary Boost (from ${originalGuild?.name || 'another server'})`);
            } else {
                fields.push(`**Type:** Direct Boost`);
            }
            fields.push(`**Pool:** ${data.poolInfo.poolName}`);
        }

        embed.setDescription(fields.join('\n'));

        return embed;
    }

    /**
     * Create embed for boost end event
     */
    private async createBoostEndEmbed(member: GuildMember, data: BoostLogData, guild: Guild): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setTitle('Boost Ended')
            .setColor(0xFF0000)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp(data.timestamp);

        const fields: string[] = [
            `**User:** ${member.user.tag} (${member})`,
            `**Nickname:** ${data.nickname || member.user.username}`
        ];

        // Check if user has a NAB number that may need reverting
        const nabAssignment = await UserNumberAssignmentModel.findOne({
            guildId: guild.id,
            userId: data.userId
        });

        if (nabAssignment) {
            fields.push(`\n**⚠️ Action Required**`);
            fields.push(`User has NAB number **${nabAssignment.number}** assigned`);

            // Check if it was pinned (likely a boost reward)
            if (nabAssignment.isPinned) {
                fields.push(`Number is pinned - may have been a boost reward`);
                fields.push(`Use \`/boosters revert-nab @${member.user.username}\` if this should be reverted`);
            }
        }

        // Add pool information if applicable
        if (data.poolInfo) {
            if (data.poolInfo.isAuxiliary && data.poolInfo.originalGuildId) {
                const originalGuild = this.client.guilds.cache.get(data.poolInfo.originalGuildId);
                fields.push(`\n**Type:** Auxiliary Boost (from ${originalGuild?.name || 'another server'})`);
            } else {
                fields.push(`\n**Type:** Direct Boost`);
            }
            fields.push(`**Pool:** ${data.poolInfo.poolName}`);
        }

        // Get boost duration
        const activeBoost = await boost_model.findOne({
            user_id: data.userId,
            is_active: false
        }).sort({ boost_end: -1 });

        if (activeBoost && activeBoost.boost_start) {
            const duration = data.timestamp.getTime() - activeBoost.boost_start.getTime();
            const days = Math.floor(duration / (1000 * 60 * 60 * 24));
            const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

            fields.push(`\n**Duration:** ${days > 0 ? `${days}d ` : ''}${hours}h`);
        }

        embed.setDescription(fields.join('\n'));

        return embed;
    }

    /**
     * Log a boost status discrepancy found by the checker
     */
    async logDiscrepancy(guildId: string, userId: string, issue: string, action: string): Promise<void> {
        try {
            const config = await boost_log_config_model.findOne({
                guild_id: guildId,
                enabled: true
            });

            if (!config) return;

            const logChannel = await this.client.channels.fetch(config.log_channel_id).catch(() => null);
            if (!logChannel || !(logChannel instanceof TextChannel)) return;

            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) return;

            const member = await guild.members.fetch(userId).catch(() => null);
            const userDisplay = member ? `${member.user.tag} (${member})` : `<@${userId}>`;

            const embed = new EmbedBuilder()
                .setTitle('Boost Status Discrepancy Detected')
                .setDescription([
                    `**User:** ${userDisplay}`,
                    `**Issue:** ${issue}`,
                    `**Action Taken:** ${action}`
                ].join('\n'))
                .setColor(0xFFFF00)
                .setTimestamp()
                .setFooter({ text: 'Detected by scheduled checker' });

            await logChannel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error logging discrepancy:', error);
        }
    }

    /**
     * Log multiple discrepancies in a summary
     */
    async logCheckerSummary(guildId: string, summary: {
        fixedBoosts: number;
        fixedUnboosts: number;
        errors: number;
        timestamp: Date;
    }): Promise<void> {
        try {
            if (summary.fixedBoosts === 0 && summary.fixedUnboosts === 0 && summary.errors === 0) {
                return; // Don't log if nothing happened
            }

            const config = await boost_log_config_model.findOne({
                guild_id: guildId,
                enabled: true
            });

            if (!config) return;

            const logChannel = await this.client.channels.fetch(config.log_channel_id).catch(() => null);
            if (!logChannel || !(logChannel instanceof TextChannel)) return;

            const embed = new EmbedBuilder()
                .setTitle('Boost Status Check Complete')
                .setDescription([
                    `**Missing boosts detected:** ${summary.fixedBoosts}`,
                    `**Extra boosts detected:** ${summary.fixedUnboosts}`,
                    `**Errors:** ${summary.errors}`
                ].join('\n'))
                .setColor(summary.errors > 0 ? 0xFF9900 : 0x0099FF)
                .setTimestamp(summary.timestamp)
                .setFooter({ text: 'Scheduled boost status validation' });

            await logChannel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error logging checker summary:', error);
        }
    }
}

/**
 * Helper function to get a BoostLogger instance
 */
export function getBoostLogger(client: Client): BoostLogger {
    return new BoostLogger(client);
}
