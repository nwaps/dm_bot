// utils/boostInference.ts
import { boost_model } from '../models/boosts';
import { user_model, NicknameEntry } from '../models/users';

export async function inferBoostNicknames(userId: string) {
    const user = await user_model.findOne({ user_id: userId });
    const boostEvents = await boost_model.find({ user_id: userId }).sort({ boost_start: 1 });
    
    if (!user || !boostEvents.length) return;
    
    // Create timeline of events
    const timeline: Array<{
        type: 'nickname_change' | 'boost_start' | 'boost_end';
        date: Date;
        data: any;
    }> = [];
    
    // Add nickname changes
    user.nicknames.forEach((nick, index) => {
        timeline.push({
            type: 'nickname_change',
            date: nick.updated_at,
            data: { nickname: nick, index }
        });
    });
    
    // Add boost events
    boostEvents.forEach(boost => {
        timeline.push({
            type: 'boost_start',
            date: boost.boost_start,
            data: boost
        });
        if (boost.boost_end) {
            timeline.push({
                type: 'boost_end',
                date: boost.boost_end,
                data: boost
            });
        }
    });
    
    // Sort by date
    timeline.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Analyze timeline to infer boost-related changes
    let currentBoostEvent: any = null;
    const inferences: Array<{
        nicknameIndex: number;
        boostEventId: string;
        confidence: 'high' | 'medium' | 'low';
        reason: string;
    }> = [];
    
    for (let i = 0; i < timeline.length; i++) {
        const event = timeline[i];
        
        if (event.type === 'boost_start') {
            currentBoostEvent = event.data;
        } else if (event.type === 'boost_end') {
            currentBoostEvent = null;
        } else if (event.type === 'nickname_change' && currentBoostEvent) {
            const nickData = event.data;
            const timeSinceBoostStart = event.date.getTime() - currentBoostEvent.boost_start.getTime();
            
            // Inference rules
            let confidence: 'high' | 'medium' | 'low' = 'low';
            let reason = '';
            
            // High confidence if:
            // 1. Nickname changed within 1 hour of boost start
            // 2. No is_boost_related flag already set
            if (timeSinceBoostStart < 60 * 60 * 1000 && !nickData.nickname.is_boost_related) {
                confidence = 'high';
                reason = 'Changed within 1 hour of boost start';
            }
            // Medium confidence if:
            // 1. Changed within 24 hours of boost start
            else if (timeSinceBoostStart < 24 * 60 * 60 * 1000) {
                confidence = 'medium';
                reason = 'Changed within 24 hours of boost start';
            }
            // Low confidence otherwise
            else {
                confidence = 'low';
                reason = 'Changed during boost period';
            }
            
            inferences.push({
                nicknameIndex: nickData.index,
                boostEventId: currentBoostEvent._id.toString(),
                confidence,
                reason
            });
        }
    }
    
    return inferences;
}

// Function to apply inferences
export async function applyBoostInferences(userId: string, minConfidence: 'high' | 'medium' | 'low' = 'high') {
    const inferences = await inferBoostNicknames(userId);
    if (!inferences) return;
    
    const user = await user_model.findOne({ user_id: userId });
    if (!user) return;
    
    const confidenceLevels = { high: 3, medium: 2, low: 1 };
    const minLevel = confidenceLevels[minConfidence];
    
    let updated = false;
    inferences.forEach(inference => {
        if (confidenceLevels[inference.confidence] >= minLevel) {
            const nickname = user.nicknames[inference.nicknameIndex];
            if (!nickname.is_boost_related) {
                nickname.is_boost_related = true;
                nickname.boost_event_id = inference.boostEventId;
                updated = true;
            }
        }
    });
    
    if (updated) {
        await user.save();
    }
    
    return inferences;
}