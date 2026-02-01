// src/discord/handlers/commandHandler.ts
import { Client, REST, Routes, Collection } from 'discord.js';
import path from 'path';
import fs from 'fs';
import config from '../../../config';
import os from 'os';

export async function loadCommands(client: Client) {
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    const commands = new Collection<string, any>();
    const commandArray: any[] = [];

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath).default;
        // console.log(command, filePath)
        if (command.data && command.execute) {
            if (command.aliases) command.aliases.forEach((alias: string) => client.aliases.set(alias, command));
            client.commands.set(command.data.name, command);
            commands.set(command.data.name, command);
            commandArray.push(command.data.toJSON());
        } else {
            console.warn(`The command file at ${filePath} is missing the "data" or "execute" property.`);
        }
    }
    // const sortedMap = new Map(
    //     [...commands.entries()].sort(([, a], [, b]) => {
    //         const nameA = a.data?.name || '';
    //         const nameB = b.data?.name || '';
    //         return nameA.localeCompare(nameB);
    //     })
    // );

    // for(const [c, d] of sortedMap) {
    //     console.log(d.data.name)
    // }

    const clientId = config.CLIENTID;
    const devGuild = config.HOMESERVER;
    const rest = new REST().setToken(config.DISCORD_TOKEN);
    try {
        console.log(`Started refreshing ${commandArray.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        // const data = await rest.put(Routes.applicationGuildCommands(config.clientId, "885480544417222657"), { body: commands });
        const route = os.hostname() === 'livechan'
            ? Routes.applicationGuildCommands(clientId, devGuild) // just dev guild
            : Routes.applicationCommands(clientId); // all servers
        try {
            const data: any = await rest.put(route, { body: commandArray });
            console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error:any) {
            const duplicateNames = findDuplicateNames(error.requestBody.json)
            console.log(duplicateNames)
            console.log("Failed to deploy commands")
        }

    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
}

function findDuplicateNames(json:any) {
    const nameCount = new Map();
    const duplicates:any = [];
    
    // Count occurrences of each name
    json.forEach((item:any, index:any) => {
        const name = item.name;
        if (nameCount.has(name)) {
            nameCount.set(name, nameCount.get(name) + 1);
        } else {
            nameCount.set(name, 1);
        }
    });
    
    // Find items with duplicate names
    json.forEach((item:any, index:any) => {
        if (nameCount.get(item.name) > 1) {
            duplicates.push({
                name: item.name,
                index: index,
                item: item
            });
        }
    });
    
    return duplicates;
}