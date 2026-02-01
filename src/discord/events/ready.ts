import { Client, Events } from 'discord.js';
import { initializeRealtimeAutoDelete } from '../util/autodelete-init';
import { initDatabase } from '../models/nab';
import { startMemberValidationScheduler } from '../util/tag';
import { initBoostStatusChecker } from '../util/boostStatusChecker';

export default {
    name: Events.ClientReady,
    async execute(client: Client) {
        console.log(`Logged in as ${client.user?.tag}!`);
        client.application?.fetch().then((app) => { if (app && app.owner) client.owner = app?.owner })

        // testQuery()
        await initDatabase()
        await initializeRealtimeAutoDelete(client)
        await startMemberValidationScheduler()
        initBoostStatusChecker(client, 1440);
    },
};