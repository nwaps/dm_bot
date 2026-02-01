export interface LoggedMessage {
    userId: string;
    content: string;
    stickers?: string[];
    embeds?: string[];
    attachments?: { name: string; url: string }[];
    messageId: string;
}