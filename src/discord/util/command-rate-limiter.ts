import { EmbedBuilder } from 'discord.js';
import { commandLogger } from './command-logger';
import { command_rate_limit_model, CommandRateLimitRecord } from '../models/command_rate_limit';


const TIMEOUT_DURATIONS = [
    30 * 1000,      // 30 seconds
    2 * 60 * 1000,     // 2 minutes
    5 * 60 * 1000,     // 5 minutes
    1 * 60 * 60 * 1000, // 1 hours
    2 * 60 * 60 * 1000 // 2 hours
    // 6th+ infraction = permanent ban
];

const RATE_LIMITS = {
    GLOBAL: { count: 5, window: 6 * 1000 },        // 5 commands per 6 seconds
    PER_COMMAND: { count: 3, window: 8 * 1000 },   // 3 same commands per 8 seconds
    BURST: { count: 15, window: 60 * 1000 }        // 15 commands per minute max
};

class CommandRateLimiter {
    private async getOrCreateUsage(userId: string, guildId: string): Promise<CommandRateLimitRecord> {
        let record = await command_rate_limit_model.findOne({ user_id: userId, guild_id: guildId });
        
        if (!record) {
            record = new command_rate_limit_model({
                user_id: userId,
                guild_id: guildId,
                command_timestamps: [],
                infractions: 0,
                is_permanently_banned: false,
                total_commands_used: 0
            });
        }
        
        return record;
    }

    private cleanOldTimestamps(timestamps: Date[], windowMs: number): Date[] {
        const cutoff = new Date(Date.now() - windowMs);
        return timestamps.filter(timestamp => timestamp > cutoff);
    }

    private async applyPunishment(record: CommandRateLimitRecord, reason: string): Promise<void> {
        record.infractions += 1;
        record.last_infraction_date = new Date();
        
        if (!record.first_infraction_date) {
            record.first_infraction_date = new Date();
        }

        if (record.infractions >= 6) {
            record.is_permanently_banned = true;
            record.ban_reason = reason;
            record.current_timeout_until = undefined;
        } else {
            const timeoutDuration = TIMEOUT_DURATIONS[record.infractions - 1];
            record.current_timeout_until = new Date(Date.now() + timeoutDuration);
        }

        await record.save();
    }

    async checkRateLimit(
        userId: string, 
        guildId: string, 
        commandName: string,
        userPermissionLevel?: number
    ): Promise<{ allowed: boolean; embed?: EmbedBuilder }> {
        try {
            const record = await this.getOrCreateUsage(userId, guildId);
            const now = new Date();

            // Override for users with permission level > 3 (above JANNY)
            if (userPermissionLevel !== undefined && userPermissionLevel > 3) {
                return { allowed: true };
            }

            // Check if permanently banned
            if (record.is_permanently_banned) {
                const banReason = record.ban_reason || 'Repeated command spam violations';
                return {
                    allowed: false,
                    embed: new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('Permanently Banned from Commands')
                        .setDescription('You are permanently banned from using bot commands.')
                        .addFields(
                            {
                                name: 'Reason',
                                value: banReason,
                                inline: false
                            },
                            {
                                name: 'Appeal',
                                value: 'Contact a moderator if you believe this was a mistake.',
                                inline: false
                            }
                        )
                        .setTimestamp()
                };
            }

            // Check if currently timed out
            if (record.current_timeout_until && record.current_timeout_until > now) {
                const timeLeft = Math.ceil((record.current_timeout_until.getTime() - Date.now()) / 1000 / 60);
                return {
                    allowed: false,
                    embed: new EmbedBuilder()
                        .setColor(0xFF8C00)
                        .setTitle('Command Timeout Active')
                        .setDescription('You are temporarily banned from using bot commands due to spam.')
                        .addFields(
                            {
                                name: 'Time Remaining',
                                value: timeLeft > 60 ? `${Math.ceil(timeLeft / 60)} hours` : `${timeLeft} minutes`,
                                inline: true
                            },
                            {
                                name: 'Infractions',
                                value: `${record.infractions}/5 (Permanent ban at 6)`,
                                inline: true
                            }
                        )
                        .setTimestamp()
                };
            }

            // Clean old timestamps
            record.command_timestamps = this.cleanOldTimestamps(record.command_timestamps, RATE_LIMITS.BURST.window);

            // Check global rate limit (5 commands per 5 seconds)
            const recentGlobal = this.cleanOldTimestamps(record.command_timestamps, RATE_LIMITS.GLOBAL.window);
            if (recentGlobal.length >= RATE_LIMITS.GLOBAL.count) {
                await this.applyPunishment(record, 'Exceeded global command rate limit (5 commands per 5 seconds)');
                return this.generateTimeoutEmbed(record, 'Global Rate Limit Exceeded');
            }

            // Check burst limit (10 commands per minute)
            if (record.command_timestamps.length >= RATE_LIMITS.BURST.count) {
                await this.applyPunishment(record, 'Exceeded burst command limit (10 commands per minute)');
                return this.generateTimeoutEmbed(record, 'Burst Limit Exceeded');
            }

            // Check per-command rate limit (3 same commands per 10 seconds)
            const commandSpecificTimestamps = record.command_timestamps.filter(timestamp => {
                // This is a simplified check - in a real implementation you'd store command names with timestamps
                return timestamp > new Date(Date.now() - RATE_LIMITS.PER_COMMAND.window);
            });
            
            // For simplicity, we'll assume recent commands are the same type if they're within the window
            if (commandSpecificTimestamps.length >= RATE_LIMITS.PER_COMMAND.count) {
                await this.applyPunishment(record, `Exceeded per-command rate limit (3 ${commandName} commands per 10 seconds)`);
                return this.generateTimeoutEmbed(record, 'Command Spam Detected');
            }

            return { allowed: true };

        } catch (error) {
            console.error('Error checking command rate limit:', error);
            return { allowed: true };
        }
    }

    private generateTimeoutEmbed(record: CommandRateLimitRecord, title: string): { allowed: boolean; embed: EmbedBuilder } {
        if (record.is_permanently_banned) {
            const banReason = record.ban_reason || 'Repeated command spam violations';
            return {
                allowed: false,
                embed: new EmbedBuilder()
                    .setColor(0x8B0000)
                    .setTitle('Permanently Banned from Commands!')
                    .setDescription('You have been permanently banned from using bot commands.')
                    .addFields(
                        {
                            name: 'Reason',
                            value: banReason,
                            inline: false
                        },
                        {
                            name: 'Total Infractions',
                            value: `${record.infractions}`,
                            inline: true
                        },
                        {
                            name: 'Appeal',
                            value: 'Contact a moderator if you believe this was a mistake.',
                            inline: false
                        }
                    )
                    .setTimestamp()
            };
        } else {
            const timeoutMinutes = Math.ceil((record.current_timeout_until!.getTime() - Date.now()) / 1000 / 60);
            const timeoutDisplay = timeoutMinutes > 60 ? `${Math.ceil(timeoutMinutes / 60)} hours` : `${timeoutMinutes} minutes`;
            
            return {
                allowed: false,
                embed: new EmbedBuilder()
                    .setColor(0xFF4500)
                    .setTitle(`${title} - Timeout Applied!`)
                    .setDescription('You have been temporarily banned from using bot commands for spam.')
                    .addFields(
                        {
                            name: 'Reason',
                            value: record.ban_reason || 'Command rate limit exceeded',
                            inline: false
                        },
                        {
                            name: 'Timeout Duration',
                            value: timeoutDisplay,
                            inline: true
                        },
                        {
                            name: 'Infractions',
                            value: `${record.infractions}/5 (Permanent ban at 6)`,
                            inline: true
                        },
                        {
                            name: 'Warning',
                            value: 'Repeated violations will result in longer timeouts and eventually a permanent ban.',
                            inline: false
                        }
                    )
                    .setTimestamp()
            };
        }
    }

    async recordCommandUsage(userId: string, guildId: string, commandName: string): Promise<void> {
        try {
            const record = await this.getOrCreateUsage(userId, guildId);
            record.command_timestamps.push(new Date());
            record.total_commands_used += 1;

            // Keep only recent timestamps to prevent memory leaks
            record.command_timestamps = this.cleanOldTimestamps(record.command_timestamps, RATE_LIMITS.BURST.window);
            
            await record.save();
        } catch (error) {
            console.error('Error recording command usage:', error);
        }
    }

    // Clean up old entries periodically to prevent memory leaks
    async cleanup(): Promise<void> {
        try {
            const cutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours
            
            // Clean old timestamps for all records
            await command_rate_limit_model.updateMany(
                {},
                {
                    $pull: {
                        command_timestamps: { $lt: cutoff }
                    }
                }
            );
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

export const commandRateLimiter = new CommandRateLimiter();

// Clean up every 30 minutes
setInterval(async () => {
    await commandRateLimiter.cleanup();
}, 30 * 60 * 1000);