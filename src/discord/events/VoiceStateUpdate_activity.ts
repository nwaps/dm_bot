// src/discord/events/VoiceStateUpdate_activity.ts

import { Client, Events, VoiceState } from 'discord.js';
import { trackVoiceActivity } from '../util/activity';

export default {
    name: Events.VoiceStateUpdate,
    async execute(client: Client, oldState: VoiceState, newState: VoiceState) {
        // Ignore bots
        if (newState.member?.user.bot) return;
        
        try {
            await trackVoiceActivity(oldState, newState);
        } catch (error) {
            console.error('Error tracking voice activity:', error);
        }
    },
};