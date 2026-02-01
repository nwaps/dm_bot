// src/util/nicknames.ts
import { user_model, NicknameEntry } from '../models/users';

/**
 * Update user nickname with tracking information
 */
export async function updateUserNickname(
    userId: string, 
    nickname: string, 
    isBoostRelated: boolean = false, 
    boostEventId?: string,
    changedBy?: string,
    reason?: string
): Promise<void> {
    try {
        let user = await user_model.findOne({ user_id: userId });
        
        if (!user) {
            // Create new user with initial nickname
            const initialEntry: NicknameEntry = {
                nickname,
                updated_at: new Date(),
                is_boost_related: isBoostRelated,
                boost_event_id: boostEventId,
                changed_by: changedBy,
                reason: reason
            };
            
            user = await user_model.create({
                user_id: userId,
                nicknames: [initialEntry],
                in_server: true
            });
        } else {
            // Check if this is actually a change
            const currentEntry = user.nicknames[user.nicknames.length - 1];
            if (currentEntry && currentEntry.nickname === nickname) {
                // No change in nickname, don't add duplicate entry
                return;
            }
            
            // Add new nickname entry
            const newEntry: NicknameEntry = {
                nickname,
                updated_at: new Date(),
                is_boost_related: isBoostRelated,
                boost_event_id: boostEventId,
                changed_by: changedBy,
                reason: reason
            };
            
            user.nicknames.push(newEntry);
            
            // Keep nicknames sorted by date
            user.nicknames.sort((a, b) => a.updated_at.getTime() - b.updated_at.getTime());
            await user.save();
        }
    } catch (error) {
        console.error(`Error updating nickname for user ${userId}:`, error);
        throw error;
    }
}

/**
 * Determine the reason based on context
 */
export function determineNicknameReason(
    oldNickname: string | null,
    newNickname: string,
    changedBy: string | null,
    botId: string
): string {
    // If bot is changing the nickname
    if (changedBy === botId) {
        // Check if it's a number assignment (from null/empty to No.X pattern)
        if ((!oldNickname || oldNickname.trim() === '') && newNickname.startsWith('No.')) {
            return 'assigned on join';
        }
        return 'bot action';
    }
    
    // If changed by another user
    if (changedBy && changedBy !== botId) {
        return 'manually assigned';
    }
    
    // Unknown changer
    return 'unknown';
}