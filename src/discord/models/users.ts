// /src/models/users.ts
import { Schema, model } from "mongoose";

export interface NicknameEntry {
    nickname: string;
    updated_at: Date;
    is_boost_related?: boolean;
    boost_event_id?: string;
    changed_by?: string; // User ID of who changed the nickname
    reason?: string; // Reason for the change
}

export interface db_user {
    user_id: string;
    nicknames: NicknameEntry[];
    in_server: boolean;
}

const nicknameEntrySchema = new Schema<NicknameEntry>({
    nickname: { type: String, required: true },
    updated_at: { type: Date, required: true },
    is_boost_related: { type: Boolean, default: false },
    boost_event_id: { type: String, default: null },
    changed_by: { type: String, default: null }, // User ID of who changed it
    reason: { type: String, default: null } // Reason for the change
}, { _id: false });

const userSchema = new Schema<db_user>({
    user_id: { type: String, required: true, unique: true },
    nicknames: { type: [nicknameEntrySchema], required: true },
    in_server: { type: Boolean, default: true }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual property for current nickname
userSchema.virtual('current_nickname').get(function() {
    return this.nicknames[this.nicknames.length - 1]?.nickname || null;
});

// Virtual property for current nickname date
userSchema.virtual('current_nickname_date').get(function() {
    return this.nicknames[this.nicknames.length - 1]?.updated_at || null;
});

// Virtual property for nickname history (excludes current)
userSchema.virtual('nickname_history').get(function() {
    return this.nicknames.slice(0, -1);
});

// Instance method to get all nicknames in reverse chronological order
userSchema.methods.getNicknamesRecentFirst = function() {
    return [...this.nicknames].reverse();
};

// Static method to get user with specific projections
userSchema.statics.getCurrentNickname = async function(user_id: string) {
    const user = await this.findOne({ user_id }, { nicknames: { $slice: -1 } });
    return user?.nicknames[0]?.nickname || null;
};

userSchema.index({ 'nicknames.updated_at': 1 });
userSchema.index({ 'in_server': 1 });

export const user_model = model<db_user>('Users', userSchema);