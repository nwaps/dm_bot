// src/discord/handlers/eventHandler.ts
import { Client } from 'discord.js';
import path from 'path';
import fs from 'fs';

export function loadEvents(client: Client) {
    const eventsPath = path.join(__dirname, '../events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath).default;

        if (event.name && event.execute) {
            client.events.set(event.name, event.execute);

            // Register event listeners
            client.on(event.name, (...args: any[]) => event.execute(client, ...args));
        } else {
            console.warn(`The event file at ${filePath} is missing the "name" or "execute" property.`);
        }
    }
}
