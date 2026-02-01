// scripts/importDiscordLogs.ts
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { user_model, NicknameEntry } from '../models/users';
import { boost_model, BoostEvent } from '../models/boosts';

interface LogEntry {
    id: string;
    content: string;
    timestamp: string;
    author: { id: string };
    mentions: Array<{ id: string; username: string }>;
}

// Regex patterns to parse the content
const NICKNAME_CHANGE_REGEX = /@([^']+)'s \((\d+)\) nickname has been set from ([^ ]+) to ([^ ]+) by: @([^ ]+) \((\d+)\)/;
const BOOST_START_REGEX = /@([^ ]+) \((\d+)\) started boosting the server\./;
const BOOST_STOP_REGEX = /@([^ ]+) \((\d+)\) stopped boosting the server\./;

async function parseNicknameChange(entry: LogEntry) {
    const match = entry.content.match(NICKNAME_CHANGE_REGEX);
    if (!match) return null;
    
    const [_, username, userId, oldNickname, newNickname, changerName, changerId] = match;
    
    return {
        userId,
        oldNickname: oldNickname === 'NULL' ? null : oldNickname,
        newNickname,
        timestamp: new Date(entry.timestamp),
        changedBy: changerId,
        changerName: changerName
    };
}

async function parseBoostEvent(entry: LogEntry) {
    const startMatch = entry.content.match(BOOST_START_REGEX);
    const stopMatch = entry.content.match(BOOST_STOP_REGEX);
    
    if (startMatch) {
        const [_, username, userId] = startMatch;
        return {
            type: 'start' as const,
            userId,
            username: username === 'null' ? null : username,
            timestamp: new Date(entry.timestamp)
        };
    }
    
    if (stopMatch) {
        const [_, username, userId] = stopMatch;
        return {
            type: 'stop' as const,
            userId,
            username: username === 'null' ? null : username,
            timestamp: new Date(entry.timestamp)
        };
    }
    
    return null;
}

async function processBoostEvents(boostEvents: Array<NonNullable<Awaited<ReturnType<typeof parseBoostEvent>>>>) {
    // Group events by user
    const eventsByUser = new Map<string, typeof boostEvents>();
    
    boostEvents.forEach(event => {
        if (!eventsByUser.has(event.userId)) {
            eventsByUser.set(event.userId, []);
        }
        eventsByUser.get(event.userId)!.push(event);
    });
    
    // Process each user's events chronologically
    for (const [userId, userEvents] of eventsByUser) {
        // Sort events chronologically
        userEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        console.log(`\nProcessing boost events for user ${userId}:`);
        
        // Clear existing boost events for this user (if doing a fresh import)
        // await boost_model.deleteMany({ user_id: userId });
        
        let currentBoostStart: Date | null = null;
        
        for (const event of userEvents) {
            if (event.type === 'start') {
                if (currentBoostStart) {
                    // User started boosting again without stopping - close previous boost
                    console.log(`! User ${userId} started new boost without stopping previous one`);
                    
                    // Close the previous boost
                    await boost_model.create({
                        user_id: userId,
                        boost_start: currentBoostStart,
                        boost_end: new Date(event.timestamp.getTime() - 1000), // 1 second before new start
                        nickname_before_boost: null,
                        nickname_during_boost: null,
                        is_active: false
                    });
                }
                
                currentBoostStart = event.timestamp;
                console.log(`  - Started boosting at ${event.timestamp}`);
                
            } else if (event.type === 'stop') {
                if (currentBoostStart) {
                    // Normal flow: start followed by stop
                    await boost_model.create({
                        user_id: userId,
                        boost_start: currentBoostStart,
                        boost_end: event.timestamp,
                        nickname_before_boost: null,
                        nickname_during_boost: null,
                        is_active: false
                    });
                    
                    console.log(`  - Stopped boosting at ${event.timestamp}`);
                    currentBoostStart = null;
                } else {
                    // Stop without start - create placeholder
                    console.log(`  ! Stop without start at ${event.timestamp}`);
                    
                    await boost_model.create({
                        user_id: userId,
                        boost_start: new Date(event.timestamp.getTime() - 1000), // 1 second before stop
                        boost_end: event.timestamp,
                        nickname_before_boost: null,
                        nickname_during_boost: null,
                        is_active: false
                    });
                }
            }
        }
        
        // If there's a start without a stop at the end, create an active boost
        if (currentBoostStart) {
            const existingActive = await boost_model.findOne({
                user_id: userId,
                boost_start: currentBoostStart
            });
            
            if (!existingActive) {
                await boost_model.create({
                    user_id: userId,
                    boost_start: currentBoostStart,
                    boost_end: null,
                    nickname_before_boost: null,
                    nickname_during_boost: null,
                    is_active: true
                });
                
                console.log(`  - Currently boosting (started at ${currentBoostStart})`);
            }
        }
    }
}

async function updateBoostNicknames() {
    console.log('\nUpdating boost nicknames...');
    
    const allBoosts = await boost_model.find({}).sort({ boost_start: 1 });
    
    for (const boost of allBoosts) {
        const user = await user_model.findOne({ user_id: boost.user_id });
        if (!user) continue;
        
        // Find nickname before boost
        const nicknamesBeforeBoost = user.nicknames.filter(n => 
            n.updated_at < boost.boost_start
        );
        if (nicknamesBeforeBoost.length > 0) {
            boost.nickname_before_boost = nicknamesBeforeBoost[nicknamesBeforeBoost.length - 1].nickname;
        }
        
        // Find nicknames during boost
        if (boost.boost_end) {
            const nicknamesDuringBoost = user.nicknames.filter(n => 
                n.updated_at >= boost.boost_start && 
                n.updated_at <= boost.boost_end!
            );
            if (nicknamesDuringBoost.length > 0) {
                boost.nickname_during_boost = nicknamesDuringBoost[nicknamesDuringBoost.length - 1].nickname;
                
                // Mark these nicknames as boost-related
                nicknamesDuringBoost.forEach(nick => {
                    nick.is_boost_related = true;
                    nick.boost_event_id = boost._id.toString();
                });
                await user.save();
            }
        }
        
        await boost.save();
    }
}

function determineChangeReason(
    oldNickname: string | null, 
    newNickname: string, 
    changerId: string,
    botId?: string
): string {
    // If we have a bot ID and the changer is the bot
    if (botId && changerId === botId) {
        // Check if it's assigning a number from null/empty
        if ((!oldNickname || oldNickname.trim() === '') && newNickname.startsWith('No.')) {
            return 'assigned on join';
        }
        return 'bot action';
    }
    
    // If changed by another user
    return 'manually assigned';
}

async function main() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bunq');
        console.log('Connected to MongoDB');
        
        // Read the JSON file
        const filePath = process.argv[2];
        if (!filePath) {
            console.error('Please provide the path to the JSON file as an argument');
            process.exit(1);
        }
        
        const data = await fs.readFile(filePath, 'utf-8');
        const entries: LogEntry[] = JSON.parse(data);
        
        console.log(`Found ${entries.length} log entries to process`);
        
        // Sort entries by timestamp to process chronologically
        entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        const nicknameChanges: any[] = [];
        const boostEvents: any[] = [];
        
        // Parse all entries first
        for (const entry of entries) {
            // Try to parse as nickname change
            const nicknameChange = await parseNicknameChange(entry);
            if (nicknameChange) {
                nicknameChanges.push(nicknameChange);
                continue;
            }
            
            // Try to parse as boost event
            const boostEvent = await parseBoostEvent(entry);
            if (boostEvent) {
                boostEvents.push(boostEvent);
                continue;
            }
        }
        
        console.log(`\nParsed ${nicknameChanges.length} nickname changes and ${boostEvents.length} boost events`);
        
        // Process nickname changes
        console.log('\nProcessing nickname changes...');
        for (const change of nicknameChanges) {
            await importNicknameChange(change);
        }
        
        // Process boost events chronologically
        console.log('\nProcessing boost events...');
        await processBoostEvents(boostEvents);
        
        // Update boost nicknames after all events are processed
        await updateBoostNicknames();
        
        // Show summary
        const activeBoosts = await boost_model.countDocuments({ is_active: true });
        const totalBoosts = await boost_model.countDocuments({});
        const users = await user_model.countDocuments({});
        
        console.log('\n=== Import Summary ===');
        console.log(`Total users with nicknames: ${users}`);
        console.log(`Total boost events: ${totalBoosts}`);
        console.log(`Currently active boosters: ${activeBoosts}`);
        
        // Verify by listing current boosters
        const currentBoosters = await boost_model.find({ is_active: true });
        console.log('\nCurrent boosters:');
        for (const booster of currentBoosters) {
            console.log(`- User ${booster.user_id} (started ${booster.boost_start})`);
        }
        
    } catch (error) {
        console.error('Error during import:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

async function importNicknameChange(change: any) {
    try {
        let user = await user_model.findOne({ user_id: change.userId });
        
        const reason = determineChangeReason(
            change.oldNickname, 
            change.newNickname, 
            change.changedBy
        );
        
        if (!user) {
            const nicknames: NicknameEntry[] = [];
            
            if (change.oldNickname) {
                nicknames.push({
                    nickname: change.oldNickname,
                    updated_at: new Date(change.timestamp.getTime() - 1000),
                    is_boost_related: false,
                    changed_by: 'unknown', // We don't know who set the old nickname
                    reason: 'unknown'
                });
            }
            
            nicknames.push({
                nickname: change.newNickname,
                updated_at: change.timestamp,
                is_boost_related: false,
                changed_by: change.changedBy,
                reason: reason
            });
            
            user = await user_model.create({
                user_id: change.userId,
                nicknames
            });
        } else {
            const existingChange = user.nicknames.find(n => 
                n.nickname === change.newNickname && 
                Math.abs(n.updated_at.getTime() - change.timestamp.getTime()) < 1000
            );
            
            if (!existingChange) {
                user.nicknames.push({
                    nickname: change.newNickname,
                    updated_at: change.timestamp,
                    is_boost_related: false,
                    changed_by: change.changedBy,
                    reason: reason
                });
                
                user.nicknames.sort((a, b) => a.updated_at.getTime() - b.updated_at.getTime());
                await user.save();
            }
        }
    } catch (error) {
        console.error(`Error importing nickname change for user ${change.userId}:`, error);
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}