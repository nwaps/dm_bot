// src/discord/events/GuildMemberAdd.ts
// Orchestrator: single entry point for all GuildMemberAdd handling.
// Runs sub-handlers sequentially per member and queues joins per guild
// to avoid Discord API rate-limit races.

import { Client, Events, GuildMember } from 'discord.js';

import unlock from './GuildMemberAdd_unlock';
import vc from './GuildMemberAdd_vc';
import nab from './GuildMemberAdd_nab';
import role from './GuildMemberAdd_role';
import nickname from './GuildMemberAdd_nickname';

// Per-guild queue: ensures joins to the same guild are processed one at a time.
// Different guilds can still process in parallel.
const guildQueues = new Map<string, Promise<void>>();

function enqueue(guildId: string, task: () => Promise<void>): void {
    const current = guildQueues.get(guildId) ?? Promise.resolve();
    const next = current.then(task).catch(() => {}).finally(() => {
        // Clean up the map entry once this is the last queued task
        if (guildQueues.get(guildId) === next) {
            guildQueues.delete(guildId);
        }
    });
    guildQueues.set(guildId, next);
}

const handlers = [
    { name: 'unlock', execute: unlock.execute },
    { name: 'vc', execute: vc.execute },
    { name: 'nab', execute: nab.execute },
    { name: 'role', execute: role.execute },
    { name: 'nickname', execute: nickname.execute },
];

export default {
    name: Events.GuildMemberAdd,
    async execute(client: Client, member: GuildMember) {
        enqueue(member.guild.id, async () => {
            for (const handler of handlers) {
                try {
                    await handler.execute(client, member);
                } catch (error) {
                    console.error(`[GuildMemberAdd] ${handler.name} failed for ${member.user.username}:`, error);
                }
            }
        });
    },
};
