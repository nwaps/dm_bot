//src/discord/bot.ts
import { Client, Collection, GatewayIntentBits, Partials, Interaction, SlashCommandBuilder, AutocompleteInteraction, Message } from 'discord.js';
import config from '../../config';
import { loadCommands } from './handlers/commandHandler';
import { loadEvents } from './handlers/eventHandler';
import { loadComponents } from './handlers/componentHandler';


export interface Command {
    require_perm: number;
    data: SlashCommandBuilder;
    alias: string[];
    category?: string;
    help?: { description: string, embed_data: { title: string, description: string, colour: number } }
    execute(client: Client, interaction: Interaction | Message): void;
    autocomplete(client: Client, interaction: AutocompleteInteraction): void;
}

// export interface Message {
//     level: string;
// }

declare module 'discord.js' {
    interface Client {
        events: Collection<string, Function>;
        commands: Collection<string, Command>;
        aliases: Collection<string, Command>;
        settings: any;
        buttons: Collection<string, Command>;
        menus: Collection<string, Command>;
        modals: Collection<string, Command>;
        owner: User | Team;
    }

    interface ButtonInteraction {
        button_var?: string;
        passed?: string[];
    }
}

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildExpressions,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
    ],
    partials: [Partials.Channel, Partials.Reaction, Partials.Message],
    allowedMentions: {
        parse: ['users'],
        repliedUser: true,
    },
});

// const big_int = BigInt(281474976710656)
// const position = Math.log2(Number(big_int));
// console.log(`(1 << ${position})`);

client.events = new Collection<string, Function>();
client.commands = new Collection<string, Command>();
client.aliases = new Collection<string, Command>();
client.buttons = new Collection<string, Command>();
client.menus = new Collection<string, Command>();
client.modals = new Collection<string, Command>();


loadCommands(client);
loadEvents(client);
loadComponents(client);

// Login to Discord
client.login(config.DISCORD_TOKEN);


export { client };




