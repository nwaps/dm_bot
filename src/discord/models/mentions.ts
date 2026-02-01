import mongoose from 'mongoose';

export interface IMention {
    guildId: string;
    channelId: string;
    messageId: string;
    mentionedUserId: string;
    mentionedByUserId: string;
    mentionedByUsername: string;
    mentionContent: string;
    timestamp: Date;
    messageContent: string;
    isRead?: boolean;
}

const MentionSchema = new mongoose.Schema<IMention>({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    mentionedUserId: { type: String, required: true },
    mentionedByUserId: { type: String, required: true },
    mentionedByUsername: { type: String, required: true },
    mentionContent: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    messageContent: { type: String, required: true },
    isRead: { type: Boolean, default: false }
});

MentionSchema.index({ mentionedUserId: 1, timestamp: -1 });
MentionSchema.index({ guildId: 1, timestamp: -1 });

export default mongoose.model<IMention>('Mention', MentionSchema);