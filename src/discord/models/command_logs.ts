import mongoose, { Schema, Document } from 'mongoose';

export interface CommandLogEntry {
    command_name: string;
    user_id: string;
    username: string;
    guild_id?: string;
    interaction_type: string; // 'slash_command', 'button', 'modal', 'select_menu', 'context_menu'
    custom_id?: string; // For buttons, modals, select menus
    parameters?: any; // Command parameters/options
    permission_level: number;
    timestamp: Date;
    execution_time_ms?: number;
    success: boolean;
    status: 'executing' | 'completed' | 'failed' | 'permission_denied'; // Track command execution status
    error_message?: string;
    session_id: string; // To track which session/startup this command belongs to
}

export interface CrashLogEntry {
    timestamp: Date;
    last_command?: CommandLogEntry;
    error_message: string;
    stack_trace?: string;
    session_id: string;
    crash_reason?: string;
}

export interface CommandLogDocument extends CommandLogEntry, Document {}
export interface CrashLogDocument extends CrashLogEntry, Document {}

const CommandLogSchema = new Schema<CommandLogDocument>({
    command_name: { type: String, required: true },
    user_id: { type: String, required: true },
    username: { type: String, required: true },
    guild_id: { type: String },
    interaction_type: { 
        type: String, 
        required: true,
        enum: ['slash_command', 'button', 'modal', 'select_menu', 'context_menu', 'autocomplete']
    },
    custom_id: { type: String },
    parameters: { type: Schema.Types.Mixed },
    permission_level: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    execution_time_ms: { type: Number },
    success: { type: Boolean, required: true },
    status: { 
        type: String, 
        required: true,
        enum: ['executing', 'completed', 'failed', 'permission_denied'],
        default: 'executing'
    },
    error_message: { type: String },
    session_id: { type: String, required: true }
});

const CrashLogSchema = new Schema<CrashLogDocument>({
    timestamp: { type: Date, default: Date.now },
    last_command: { type: Schema.Types.Mixed },
    error_message: { type: String, required: true },
    stack_trace: { type: String },
    session_id: { type: String, required: true },
    crash_reason: { type: String }
});

// Add indexes for common queries
CommandLogSchema.index({ timestamp: -1 });
CommandLogSchema.index({ session_id: 1, timestamp: -1 });
CommandLogSchema.index({ user_id: 1, timestamp: -1 });
CommandLogSchema.index({ command_name: 1, timestamp: -1 });

CrashLogSchema.index({ timestamp: -1 });
CrashLogSchema.index({ session_id: 1 });

export const command_log_model = mongoose.model<CommandLogDocument>('CommandLog', CommandLogSchema);
export const crash_log_model = mongoose.model<CrashLogDocument>('CrashLog', CrashLogSchema);