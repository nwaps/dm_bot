// src/discord/models/vc_channel.ts

import { Schema, model } from 'mongoose';

// Define the channel settings schema
export interface ChannelSettings {
    owner: string[];
    banned: string[];
    promoted: string[];
    banned_roles?: string[];      // New: Role IDs that are banned
    promoted_roles?: string[];    // New: Role IDs that are promoted
    autodelete_link: string;
}

// Define the structure of the VC settings
export interface VcSettings {
    channels: Map<string, ChannelSettings>;
}

// Define the VCS model interface (to represent each document in the collection)
export interface vcs extends Document {
    guildId: string;
    channels: {
        [channelId: string]: ChannelSettings;
    };
}

// Define the schema for the vcs
const vc_schema = new Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
    },
    channels: {
        type: Map,
        of: new Schema({
            owner: { type: [String], required: true },
            banned: { type: [String], default: [] },
            promoted: { type: [String], default: [] },
            banned_roles: { type: [String], default: [] },      // New field for banned roles
            promoted_roles: { type: [String], default: [] },    // New field for promoted roles
            autodelete_link: { type: String },
        }),
        required: true
        // global.VCS.guild_id.channels.channel_id.banned[]|promoted[]|owner|banned_roles[]|promoted_roles[]
    }
});

const vc_model = model<vcs>('vcs', vc_schema);

export default vc_model;