// src/discord/handlers/componentHandler.ts
import { Client } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path'

export async function loadComponents(client: Client) {
    const root_folder = path.join(__dirname, "../components")
    const components_folder = readdirSync(root_folder);
    for (const folder of components_folder) {
        const component_files = readdirSync(`${root_folder}/${folder}`).filter((file) => file.endsWith('.js'));

        const { buttons, modals, menus } = client;

        switch (folder) {
            case 'buttons':
                for (const file of component_files) {
                    const data = require([root_folder, folder, file].join('/'))
                    buttons.set(data.data.name, data)
                }
                break;
            case 'modals':
                for (const file of component_files) {
                    const data = require([root_folder, folder, file].join('/'))
                    modals.set(data.data.name, data)
                }
                break;
            case 'menus':
                for (const file of component_files) {
                    const data = require([root_folder, folder, file].join('/'))
                    menus.set(data.data.name, data)
                }
                break;
            default:
                break;
        }
    }
}