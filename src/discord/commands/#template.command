import { ChatInputCommandInteraction, Client, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { Permissions } from '../models/permissions';
import { HELP_CATEGORIES } from '../util/help-categories';

export default {
    require_perm: Permissions.BOOSTER,
    help: ``,
    data: new SlashCommandBuilder()
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setName('')
        .setDescription('')
        .addStringOption(option =>
            option.setName('')
                .setDescription(``)
                .setRequired(true)
        )
        .setContexts(InteractionContextType.Guild)
        ,
    async execute(client: Client, interaction: ChatInputCommandInteraction) {
        if (!interaction.guild) return interaction.reply({ content: 'Run this in a guild', flags: MessageFlags.Ephemeral })
        const option = interaction.options.getString('', true)
      
    },
};