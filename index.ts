/*                             INDEX.TS
  Entry point into the backend server application. Responsible for spinning off
  the express app which will carry out the handling of incoming http requests.
*/

// Required configuration so runtime errors refer to typescript files,
// not the output javascript files
import 'source-map-support/register.js';

// Import local config file
import config from './config.js';

// Import misc packages/functions
import path from 'path';
import mongoose from 'mongoose';

// run the discord bot on startup
import './src/discord/bot.js';
import vc_model from './src/discord/models/vc_channel.js';
import { VcSettings, ChannelSettings } from './src/discord/models/vc_channel.js';
import settings_model, { guild_setting } from './src/discord/models/settings.js';
import { LoggedMessage } from './src/discord/models/message_history.js';
import { pool_model } from './src/discord/models/pools.js';
import { MemberCacheManager } from './src/discord/util/member-cache-manager.js';

import './src/discord/events/MessageCreate_activity.js';
import './src/discord/events/VoiceStateUpdate_activity.js';
import './src/discord/events/MessageCreate_mentions.js';

// Configure global context to save the root of the project
declare global {
    var ROOT: string
    var VCS: Map<string, VcSettings>;
    var SETTINGS: {
        [key: string]: guild_setting
    };
    var MESSAGES: Record<string, LoggedMessage[]>;
    var BAD_THOUGHTS: string[];
    var ALLOWED_THOUGHTS: string[];
    var POOLS: Map<string, any>;
    var MEMBER_CACHE_MANAGER: MemberCacheManager;
}
const root = path.join(__dirname, '..');
global.ROOT = root;
mongoose.connect(`mongodb://${config.DB_HOST}/${config.DB_ADDR}`);

global.BAD_THOUGHTS = [
    'boogaloo',
    'adolf',
    'hitler',
    'faggot',
    'fag',
    'child porn',
    'beta',
    'dead',
    'rape',
    'cunny',
    'nigger',
    'nigga',
    'niggas',
    'peter scully',
    'niggers',
    'tranny'
]

global.ALLOWED_THOUGHTS = [
    'cookie',
    'candy',
    'soda',
    'yummy',
    'woman',
    'hungry'
]


// global messages
global.MESSAGES = {};

// global settings
global.SETTINGS = {};
settings_model.find({}).then(all_settings => {
    all_settings.map(setting => {
        global.SETTINGS[setting.guildId] = setting.settings
    })
});

// vc settings
const guildsMap: Map<string, VcSettings> = new Map();
vc_model.find({}).lean().then(allVCS => {

    allVCS.forEach((vc) => {
        const guildId = vc.guildId;
        const channelsMap: Map<string, ChannelSettings> = new Map();

        Object.keys(vc.channels).forEach((channelId) => {
            // Populate the channels Map for the guild
            channelsMap.set(channelId, vc.channels[channelId]);
        });
        guildsMap.set(guildId, { channels: channelsMap });
    });

    global.VCS = guildsMap;
    // console.log(global.VCS)
});

// Initialize pool system cache
global.POOLS = new Map();
pool_model.find({ is_active: true }).then(activePools => {
    activePools.forEach(pool => {
        global.POOLS.set(pool.pool_id, {
            ...pool.toObject(),
            lastUpdated: new Date()
        });
    });
    console.log(`Loaded ${activePools.length} active boost pools into cache`);
}).catch(error => {
    console.error('Error loading pools into cache:', error);
});

// Initialize member cache manager
global.MEMBER_CACHE_MANAGER = MemberCacheManager.getInstance();
console.log('Member cache manager initialized with 10-minute TTL');


// Initialize Database
mongoose.connect(`mongodb://${config.DB_HOST}/${config.DB_ADDR}`);
// import postgres from './src/db/postgres.js';