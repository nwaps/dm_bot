import { get_settings } from "./settings";
import { perm_matrix } from '../models/permissions'

async function check_level(message: any): Promise<number> {
    let permlvl = 0;
    if (message.author) message.user = message.author;
    if (message.user) message.author = message.user;

    const permOrder = perm_matrix.levels.slice(0).sort((p, c) => (p.level < c.level ? 1 : -1));

    while (permOrder.length) {
        const currentLevel = permOrder.shift();
        if (!currentLevel) throw Error;

        // Skip if the permission level is guild-only and we're not in a guild
        if (!message.guild) continue;

        message.settings = await get_settings(message.guild.id);

        // Check the current permission level
        if (currentLevel.check(message)) {
            // Update highestPermLevel if the current level is higher
            if (currentLevel.level > permlvl) {
                permlvl = currentLevel.level;
            }
        }
    }

    return permlvl;
}

export { check_level };