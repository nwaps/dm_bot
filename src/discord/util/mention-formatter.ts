import { IMention } from '../models/mentions.js';

export interface FormattedMention {
    mentionedByUserId: string;
    mentionedByUsername: string;
    count: number;
    timestamp: Date;
    messageContent: string;
}

export function collapseSpamMentions(mentions: IMention[]): FormattedMention[] {
    const mentionMap = new Map<string, FormattedMention>();

    mentions.forEach(mention => {
        // Create a unique key based on user ID AND message content
        const key = `${mention.mentionedByUserId}:${mention.messageContent}`;
        
        if (mentionMap.has(key)) {
            const existing = mentionMap.get(key)!;
            existing.count++;
            // Keep the latest timestamp for identical messages
            if (mention.timestamp > existing.timestamp) {
                existing.timestamp = mention.timestamp;
            }
        } else {
            mentionMap.set(key, {
                mentionedByUserId: mention.mentionedByUserId,
                mentionedByUsername: mention.mentionedByUsername,
                count: 1,
                timestamp: mention.timestamp,
                messageContent: mention.messageContent
            });
        }
    });

    // Sort by timestamp (newest first)
    return Array.from(mentionMap.values()).sort((a, b) => 
        b.timestamp.getTime() - a.timestamp.getTime()
    );
}

export function formatMentionText(mention: FormattedMention): string {
    const timestamp = Math.floor(mention.timestamp.getTime() / 1000);
    const discordTimestamp = `<t:${timestamp}:R>`;
    const countText = mention.count > 1 ? ` x${mention.count}` : '';
    
    // Show full message content without truncation
    return `${discordTimestamp} | <@${mention.mentionedByUserId}>${countText}: ${mention.messageContent}`;
}

function formatTimestamp(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ago`;
    } else if (minutes > 0) {
        return `${minutes}m ago`;
    } else {
        return 'now';
    }
}