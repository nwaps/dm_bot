import { Schema, model } from "mongoose";

export interface db_managed_guild {
    guildId: string;
    guildName: string;
    iconUrl?: string;
    bannerUrl?: string;
    description?: string;
    applicationsEnabled: boolean;
    isOnboarded: boolean;
    permissions: {
        user: {
            permissions: string[];
        };
        mod: {
            permissions: string[];
        };
        admin: {
            permissions: string[];
        };
    };
    createdAt: Date;
    updatedAt: Date;
}

const permissionSchema = new Schema({
    permissions: { type: [String], required: true, default: [] }
});

const rolePermissionsSchema = new Schema({
    user: { type: permissionSchema, required: true, default: () => ({}) },
    mod: { type: permissionSchema, required: true, default: () => ({}) },
    admin: { type: permissionSchema, required: true, default: () => ({}) }
});

const managedGuildSchema = new Schema<db_managed_guild>({
    guildId: { type: String, required: true, unique: true },
    guildName: { type: String, required: true },
    iconUrl: { type: String, required: false },
    bannerUrl: { type: String, required: false },
    description: { type: String, required: false },
    applicationsEnabled: { type: Boolean, required: true, default: false },
    isOnboarded: { type: Boolean, required: true, default: false },
    permissions: {
        type: rolePermissionsSchema, required: true, default: () => ({
            user: {
                permissions: ['edit-own-applications']
            },
            mod: {
                permissions: ['edit-own-applications', 'approve-deny-applications']
            },
            admin: {
                permissions: ['edit-own-applications', 'approve-deny-applications', 'edit-others-applications']
            }
        })
    },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
});

// Create indexes for better performance
// guildId index is already created above with unique: true
managedGuildSchema.index({ applicationsEnabled: 1 });
managedGuildSchema.index({ isOnboarded: 1 });

export const ManagedGuild = model<db_managed_guild>('ManagedGuilds', managedGuildSchema);