import { client } from '../bot'
import config from '../../../config';

enum Permissions {
    USER = 0,
    BOOSTER = 1,
    JANNY = 2,
    MOD = 3,
    ADMIN = 4,
    BOT_ADMIN = 5,
    SERVER_OWNER = 8,
    BOT_OWNER = 10
}

const perm_matrix = {
    levels: [
        {
            level: Permissions.USER,
            name: "User",
            check: () => true,
        },
        {
            level: Permissions.BOOSTER,
            name: "Booster",
            check: (message: any) => {
                try {
                    if (!message.guild.roles.premiumSubscriberRole) return false;
                    const booster_role = message.guild.roles.cache.find((r: any) => message.guild.roles.premiumSubscriberRole.id === r.id);
                    if (booster_role && message.member.roles.cache.has(booster_role.id)) return true;
                } catch (e) {
                    return false;
                }
            },
        },
        {
            level: Permissions.JANNY,
            name: "Janny",
            check: (message: any) => {
                try {
                    const admin_roles = message.settings.roles.janny;
                    if (!admin_roles) return false;

                    const role_ids = Array.isArray(admin_roles) ? admin_roles : [admin_roles];
                    return role_ids.some((roleId) => message.member.roles.cache.has(roleId));

                } catch (e) {
                    return false;
                }
            },
        },
        {
            level: Permissions.MOD,
            name: "Moderator",
            check: (message: any) => {
                try {
                    const mod_roles = message.settings.roles.mod;
                    if (!mod_roles) return false;

                    const role_ids = Array.isArray(mod_roles) ? mod_roles : [mod_roles];
                    return role_ids.some((roleId) => message.member.roles.cache.has(roleId));

                } catch (e) {
                    return false;
                }
            },
        },
        {
            level: Permissions.ADMIN,
            name: "Administrator",
            check: (message: any) => {
                try {
                    const admin_roles = message.settings.roles.admin;
                    if (!admin_roles) return false;

                    const role_ids = Array.isArray(admin_roles) ? admin_roles : [admin_roles];
                    return role_ids.some((roleId) => message.member.roles.cache.has(roleId));

                } catch (e) {
                    return false;
                }
            }
        },
        {
            level: Permissions.BOT_ADMIN,
            name: "Bot Admin",
            check: (message: any) => ("917405827076358164" === message.user.id),
        },
        {
            level: Permissions.SERVER_OWNER,
            name: "Server Owner",
            check: (message: any) => (message.guild.ownerId === message.user.id ? true : false),
        },
        {
            level: Permissions.BOT_OWNER,
            name: "Bot Owner",
            check: (message: any) => (
                client.owner ? 
                client.owner.id === message.user.id || 
                config.OWNER_ID === message.user.id 
                : false
            ),
        },
    ]
}


export { perm_matrix, Permissions };