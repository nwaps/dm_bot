import { SlashCommandBuilder, Message, Client, ChatInputCommandInteraction } from 'discord.js';
import { HELP_CATEGORIES } from '../util/help-categories';
import { Permissions } from '../models/permissions'

export default {
    require_perm: Permissions.USER,
    category: HELP_CATEGORIES.UTILITY,
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Dong!'),
    async execute(client: Client, interaction: ChatInputCommandInteraction | Message) {
        if (interaction instanceof Message) return
        else await interaction.reply('Pong!');
    },
};
