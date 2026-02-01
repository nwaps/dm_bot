/*                              CONFIG.TS
  Acts as a local configuration file, providing an object which contains the
  various configuration variables used throughout the backend server. FOR
  CHANGES IN THIS FILE TO TAKE EFFECT, THE SERVER MUST BE RESTARTED.
*/
import * as dotenv from 'dotenv';

dotenv.config()

export default {
  PORT: 3000,
  DB_HOST: 'localhost',
  DB_ADDR: 'bunq', // database name
  // Cooldown between posts (in milliseconds)
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "", // bot duh
  USER_TOKEN: process.env.USER_TOKEN || "", // naughty
  OWNER_ID: process.env.OWNER_ID || null,
  CLIENTID: "", // client id for command pushing
  HOMESERVER: "", // dev server for commands
  PGDB_HOST: process.env.PGDB_HOST || "localhost",
  PGDB_PASSWORD: process.env.PGDB_PASSWORD, // if postgres is needed

  // Dashboard configuration
  DASHBOARD_CONFIG: {
    ENABLED: process.env.DASHBOARD_ENABLED !== 'false', // Default ON
    UPDATE_INTERVAL_SECONDS: parseInt(process.env.DASHBOARD_INTERVAL || '30'),
    SUMMARY_INTERVAL_MINUTES: parseInt(process.env.SUMMARY_INTERVAL || '10'),
    MAX_RECENT_FAILURES: 10,
    CLEAR_SCREEN: false, // Clear terminal before each dashboard render
  },
};