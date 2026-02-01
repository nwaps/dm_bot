// discord.d.ts
import { Message, User } from 'discord.js';

declare module 'discord.js' {
    interface Message {
        level?: number; // Add 'level' as an optional property of type number
        args?: string[];
        user: User,
    }
}
