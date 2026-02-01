import { command_log_model, crash_log_model, CommandLogEntry, CrashLogEntry } from '../models/command_logs';
import { randomUUID } from 'crypto';

class CommandLogger {
    private sessionId: string;
    private lastCommand: CommandLogEntry | null = null;

    constructor() {
        this.sessionId = randomUUID();
        this.setupCrashHandlers();
        console.log(`CommandLogger initialized with session ID: ${this.sessionId}`);
    }

    private setupCrashHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            await this.logCrash(error, 'uncaught_exception');
            // Small delay to ensure database write completes
            // setTimeout(() => process.exit(1), 500);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            await this.logCrash(error, 'unhandled_rejection');
            // Don't exit for unhandled rejections, just log them
        });

        // Handle SIGTERM and SIGINT gracefully
        process.on('SIGTERM', async () => {
            await this.logCrash(new Error('Process terminated'), 'sigterm');
            setTimeout(() => process.exit(0), 500);
        });

        process.on('SIGINT', async () => {
            await this.logCrash(new Error('Process interrupted'), 'sigint');
            setTimeout(() => process.exit(0), 500);
        });
    }

    async logCommand(
        commandName: string,
        userId: string,
        username: string,
        interactionType: string,
        permissionLevel: number,
        guildId?: string,
        customId?: string,
        parameters?: any
    ): Promise<string> {
        const logEntry: CommandLogEntry = {
            command_name: commandName,
            user_id: userId,
            username: username,
            guild_id: guildId,
            interaction_type: interactionType,
            custom_id: customId,
            parameters: this.sanitizeParameters(parameters),
            permission_level: permissionLevel,
            timestamp: new Date(),
            success: false, // Will be updated when command completes
            status: 'executing', // Initial status
            session_id: this.sessionId
        };

        try {
            const saved = await command_log_model.create(logEntry);
            this.lastCommand = logEntry;
            return saved._id?.toString() || '';
        } catch (error) {
            console.error('Failed to log command:', error);
            return '';
        }
    }

    async updateCommandResult(logId: string, success: boolean, executionTimeMs?: number, errorMessage?: string, customStatus?: 'permission_denied') {
        if (!logId) return;

        const status = customStatus || (success ? 'completed' : 'failed');

        try {
            await command_log_model.findByIdAndUpdate(logId, {
                success,
                status,
                execution_time_ms: executionTimeMs,
                error_message: errorMessage
            });

            // Update lastCommand if this was the most recent
            if (this.lastCommand) {
                this.lastCommand.success = success;
                this.lastCommand.status = status;
                this.lastCommand.execution_time_ms = executionTimeMs;
                this.lastCommand.error_message = errorMessage;
            }
        } catch (error) {
            console.error('Failed to update command result:', error);
        }
    }

    private async logCrash(error: Error, reason: string) {
        try {
            const crashEntry: CrashLogEntry = {
                timestamp: new Date(),
                last_command: this.lastCommand || undefined,
                error_message: error.message,
                stack_trace: error.stack,
                session_id: this.sessionId,
                crash_reason: reason
            };

            await crash_log_model.create(crashEntry);
            console.error(`Crash logged: ${reason} - ${error.message}`);
            
            if (this.lastCommand) {
                console.error(`Last command executed: ${this.lastCommand.command_name} by ${this.lastCommand.username}`);
                console.error(`Command parameters:`, this.lastCommand.parameters);
            }
        } catch (logError) {
            console.error('Failed to log crash:', logError);
        }
    }

    private sanitizeParameters(params: any): any {
        if (!params) return params;
        
        // Create a deep copy and remove sensitive information
        const sanitized = JSON.parse(JSON.stringify(params));
        
        // Remove common sensitive fields
        const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
        
        const removeSensitive = (obj: any): any => {
            if (typeof obj !== 'object' || obj === null) return obj;
            
            if (Array.isArray(obj)) {
                return obj.map(removeSensitive);
            }
            
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                    result[key] = '[REDACTED]';
                } else {
                    result[key] = removeSensitive(value);
                }
            }
            return result;
        };

        return removeSensitive(sanitized);
    }

    getSessionId(): string {
        return this.sessionId;
    }

    getLastCommand(): CommandLogEntry | null {
        return this.lastCommand;
    }

    // Statistics methods
    async getCommandStats(timeRangeHours: number = 24): Promise<any> {
        const since = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
        
        const [totalCommands, successfulCommands, failedCommands, executingCommands, permissionDeniedCommands, topCommands, topUsers] = await Promise.all([
            command_log_model.countDocuments({ timestamp: { $gte: since } }),
            command_log_model.countDocuments({ timestamp: { $gte: since }, status: 'completed' }),
            command_log_model.countDocuments({ timestamp: { $gte: since }, status: 'failed' }),
            command_log_model.countDocuments({ timestamp: { $gte: since }, status: 'executing' }),
            command_log_model.countDocuments({ timestamp: { $gte: since }, status: 'permission_denied' }),
            command_log_model.aggregate([
                { $match: { timestamp: { $gte: since } } },
                { $group: { _id: '$command_name', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            command_log_model.aggregate([
                { $match: { timestamp: { $gte: since } } },
                { $group: { _id: { user_id: '$user_id', username: '$username' }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);

        return {
            timeRange: `${timeRangeHours} hours`,
            totalCommands,
            successfulCommands,
            failedCommands,
            executingCommands,
            permissionDeniedCommands,
            successRate: totalCommands > 0 ? (successfulCommands / totalCommands * 100).toFixed(2) + '%' : '0%',
            topCommands,
            topUsers
        };
    }

    async getCrashLogs(limit: number = 10): Promise<CrashLogEntry[]> {
        return await crash_log_model.find().sort({ timestamp: -1 }).limit(limit);
    }
}

// Export singleton instance
export const commandLogger = new CommandLogger();