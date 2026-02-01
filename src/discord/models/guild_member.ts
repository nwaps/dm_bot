// server/models/guild_member.ts
import { Schema, model } from "mongoose";

interface User {
    id: string;
    username: string;
    avatar: string;
    avatarURL: string;
    discriminator: string;
    public_flags: number;
    flags: number;
    banner: string | null;
    accent_color: number | null;
    global_name: string;
    avatar_decoration_data: string | null;
    banner_color: string | null;
    clan: string | null;
    primary_guild: string | null;
    mfa_enabled: boolean;
    locale: string;
    premium_type: number;
    email: string;
    verified: boolean;
}

// Login history interface for tracking IP addresses
interface LoginHistoryEntry {
    ip: string;
    timestamp: Date;
    userAgent: string;
    country?: string;    // Cloudflare country code
    cfRay?: string;      // Cloudflare ray ID
    isCloudflare: boolean;
}

// Login history schema (same as in WebUser)
const loginHistorySchema = new Schema({
    ip: { type: String, required: true },
    timestamp: { type: Date, required: true },
    userAgent: { type: String, required: true },
    country: { type: String },
    cfRay: { type: String },
    isCloudflare: { type: Boolean, default: false }
}, { _id: false });

export interface db_guild_member {
    userId: string;
    guildId: string;
    role: 'user' | 'mod' | 'admin'; // User's role in this specific guild
    joinedAt: Date;
    discord: User;
    
    // IP tracking fields
    lastLogin?: Date;
    lastIp?: string;
    ipHistory?: LoginHistoryEntry[];
}

export const userSchema = new Schema<User>(
    {
        id: { type: String, required: false },
        username: { type: String, required: false },
        avatar: { type: String, required: false },
        avatarURL: { type: String, required: false },
        discriminator: { type: String, required: false },
        public_flags: { type: Number, required: false },
        flags: { type: Number, required: false },
        banner: { type: String, default: null },
        accent_color: { type: Number, default: null },
        global_name: { type: String, required: false },
        avatar_decoration_data: { type: String, default: null },
        banner_color: { type: String, default: null },
        clan: { type: String, default: null },
        primary_guild: { type: String, default: null },
        mfa_enabled: { type: Boolean, required: false },
        locale: { type: String, required: false },
        premium_type: { type: Number, required: false },
        email: { type: String, required: false },
        verified: { type: Boolean, required: false },
    },
    { _id: false }  // prevent a separate _id for the subdoc
);

const guildMemberSchema = new Schema<db_guild_member>({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    role: {
        type: String,
        required: true,
        enum: ["user", "mod", "admin"],
        default: "user"
    },
    joinedAt: { type: Date, default: Date.now },
    discord: { type: userSchema, required: false },
    
    // IP tracking fields
    lastLogin: { type: Date },
    lastIp: { type: String },
    ipHistory: [loginHistorySchema]
});

// Create indexes for better performance
guildMemberSchema.index({ userId: 1, guildId: 1 }, { unique: true }); // One membership per user per guild
guildMemberSchema.index({ guildId: 1 });
guildMemberSchema.index({ userId: 1 });
guildMemberSchema.index({ role: 1 });
guildMemberSchema.index({ "ipHistory.ip": 1 }); // Index for IP search
guildMemberSchema.index({ lastLogin: -1 }); // Index for login time queries

export const GuildMember = model<db_guild_member>('GuildMembers', guildMemberSchema);