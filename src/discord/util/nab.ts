// src/discord/util/nab.ts

import { Client, Guild, GuildMember } from 'discord.js';
import {
    UserNumberConfig,
    UserNumberAssignment,
    AssignmentMode,
    FillStrategy,
    userNumberConfigs,
    getRepository
} from '../models/nab';
import { updateUserNickname } from './nicknames';
import { memberBulkFetch } from './member-fetch-wrapper';

/**
 * Initialize the User Number system
 */
export async function initializeUserNumbering(client: Client): Promise<void> {
    console.log('Initializing User Number Assignment system...');

    try {
        // Initialize the database repository
        await import('../models/nab').then(({ initDatabase }) => initDatabase());

        console.log('User Number Assignment system initialized successfully.');

    } catch (error) {
        console.error('Failed to initialize User Number Assignment system:', error);
        throw error;
    }
}

/**
 * Extract number from nickname using the configured prefix
 */
export function extractNumberFromNickname(nickname: string, prefix: string): number | null {
    if (!nickname || !nickname.startsWith(prefix)) {
        return null;
    }

    // Remove prefix and extract the number part
    const withoutPrefix = nickname.substring(prefix.length);
    const match = withoutPrefix.match(/^(\d+)/);

    if (match) {
        return parseInt(match[1], 10);
    }

    return null;
}

/**
 * Get all members with a specific number in their nickname
 */
export async function getMembersWithNumber(guild: Guild, number: number): Promise<GuildMember[]> {
    const config = await getOrCreateConfig(guild.id);
    const members: GuildMember[] = [];

    // Fetch all members to ensure we have current data
    await memberBulkFetch(guild);

    for (const [, member] of guild.members.cache) {
        const memberNumber = extractNumberFromNickname(member.nickname || '', config.prefix);
        if (memberNumber === number) {
            members.push(member);
        }
    }

    return members;
}

/**
 * Get current number from member's nickname
 */
export async function getMemberCurrentNumber(member: GuildMember): Promise<number | null> {
    const config = await getOrCreateConfig(member.guild.id);
    return extractNumberFromNickname(member.nickname || '', config.prefix);
}

/**
 * Get all taken numbers by scanning current nicknames
 */
export async function getAllTakenNumbers(guild: Guild): Promise<Set<number>> {
    const config = await getOrCreateConfig(guild.id);
    const takenNumbers = new Set<number>();

    // Fetch all members to ensure we have current data
    await memberBulkFetch(guild);

    for (const [, member] of guild.members.cache) {
        const number = extractNumberFromNickname(member.nickname || '', config.prefix);
        if (number !== null) {
            takenNumbers.add(number);
        }
    }

    return takenNumbers;
}

/**
 * Get all pinned numbers for a guild as a Map from number -> userId
 */
export async function getAllPinnedNumberMap(guildId: string): Promise<Map<number, string>> {
    const pinnedNumbers = await getRepository().getAllPinnedNumbers(guildId);
    const map = new Map<number, string>();
    for (const pin of pinnedNumbers) {
        map.set(pin.number, pin.userId);
    }
    return map;
}

/**
 * Get all numbers that are unavailable for assignment.
 * Combines currently taken numbers (from nicknames) with pinned numbers (from DB).
 * If forUserId is provided, that user's own pinned number is excluded
 * (so it remains "available" for them).
 */
export async function getAllUnavailableNumbers(
    guild: Guild,
    forUserId?: string
): Promise<Set<number>> {
    const takenNumbers = await getAllTakenNumbers(guild);
    const pinnedMap = await getAllPinnedNumberMap(guild.id);

    const unavailable = new Set(takenNumbers);

    for (const [number, userId] of pinnedMap) {
        if (forUserId && userId === forUserId) continue;
        unavailable.add(number);
    }

    return unavailable;
}

/**
 * Get or create configuration for a guild
 */
export async function getOrCreateConfig(guildId: string): Promise<UserNumberConfig> {
    let config = userNumberConfigs.get(guildId);

    if (!config) {
        // Create default configuration
        config = {
            guildId,
            mode: AssignmentMode.ASCENDING,
            prefix: 'No.',
            startPosition: 1,
            nextNumber: 1,
            fillStrategy: FillStrategy.SEQUENTIAL,
            enabled: false,
            botSuffix: 'X',
            compactImmuneRoles: []
        };

        await getRepository().saveConfig(config);
    }

    return config;
}

/**
 * Assign a number to a user
 */
export async function assignNumber(
    guild: Guild,
    member: GuildMember,
    forceNumber?: number,
    changedBy?: string, // Add changer tracking
    customReason?: string // Add custom reason parameter
): Promise<{ assignment: UserNumberAssignment | null, isDuplicate: boolean, pinnedConflict?: { userId: string; number: number } | null }> {
    const config = await getOrCreateConfig(guild.id);

    if (!config.enabled) {
        return { assignment: null, isDuplicate: false };
    }

    // Check if user already has a number in their nickname
    const currentNumber = await getMemberCurrentNumber(member);
    const oldNickname = member.nickname;

    // Only skip assignment if it's automatic (no forceNumber) and user already has a number
    if (currentNumber !== null && forceNumber === undefined) {
        // User already has a number and this is automatic assignment, create assignment record for historical tracking
        const assignment: UserNumberAssignment = {
            guildId: guild.id,
            userId: member.id,
            number: currentNumber,
            assignedAt: new Date(),
            isBot: member.user.bot,
            displayName: member.displayName || member.user.username
        };

        await getRepository().saveAssignment(assignment);
        return { assignment, isDuplicate: false };
    }

    let assignedNumber: number;
    let isDuplicate = false;
    let pinnedConflict: { userId: string; number: number } | null = null;

    // Check if user has a pinned number (only for automatic assignment)
    const pinnedNumber = await getRepository().getPinnedNumber(guild.id, member.id);
    if (pinnedNumber && forceNumber === undefined) {
        // Check if their pinned number is currently taken by someone else
        const currentUser = await getMembersWithNumber(guild, pinnedNumber.number);
        if (currentUser.length === 0) {
            // Pinned number is available, assign it
            assignedNumber = pinnedNumber.number;
            console.log(`Assigning pinned number ${assignedNumber} to returning user ${member.user.username}`);
        } else {
            // Pinned number is taken, log conflict and assign normally
            console.log(`Pinned number ${pinnedNumber.number} for ${member.user.username} is currently taken by ${currentUser[0].user.username}, assigning new number`);
            assignedNumber = await getNextAvailableNumber(guild, config, member.id);
        }
    } else if (forceNumber !== undefined) {
        // Manual assignment - check if number is pinned to someone else
        const pinConflict = await getRepository().isPinnedToOther(guild.id, forceNumber, member.id);
        if (pinConflict) {
            pinnedConflict = { userId: pinConflict.userId, number: pinConflict.number };
            console.log(`Warning: Number ${forceNumber} is pinned to user ${pinConflict.userId}, but force-assigning to ${member.user.username}`);
        }

        // Check if number is taken by someone else
        const membersWithNumber = await getMembersWithNumber(guild, forceNumber);
        const otherMembersWithNumber = membersWithNumber.filter(m => m.id !== member.id);
        if (otherMembersWithNumber.length > 0) {
            // Instead of throwing an error, mark as duplicate and proceed
            isDuplicate = true;
            console.log(`Warning: Number ${forceNumber} is already assigned to ${otherMembersWithNumber[0].displayName}, but proceeding with assignment`);
        }
        assignedNumber = forceNumber;
    } else {
        // Automatic assignment based on mode
        assignedNumber = await getNextAvailableNumber(guild, config, member.id);
    }

    // Create assignment record for historical tracking
    const assignment: UserNumberAssignment = {
        guildId: guild.id,
        userId: member.id,
        number: assignedNumber,
        assignedAt: new Date(),
        isBot: member.user.bot,
        displayName: member.displayName || member.user.username,
        isPinned: pinnedNumber !== null && assignedNumber === pinnedNumber.number
    };

    await getRepository().saveAssignment(assignment);

    // Update next number if using ascending mode and this was automatic assignment
    if (forceNumber === undefined && !pinnedNumber && config.mode === AssignmentMode.ASCENDING) {
        config.nextNumber = Math.max(config.nextNumber, assignedNumber + 1);
        await getRepository().saveConfig(config);
    }

    // Always try to update member nickname when manually assigning or when automatic assignment
    try {
        const suffix = assignment.isBot ? config.botSuffix : assignment.number.toString();
        const newNickname = `${config.prefix}${suffix}`;

        await member.setNickname(newNickname, 'User number assignment');

        // Determine reason based on context
        let reason: string;
        if (customReason) {
            reason = customReason; // Use provided custom reason
        } else if (changedBy) {
            reason = forceNumber !== undefined ? 'set command' : 'assigned on join';
        } else {
            reason = (!oldNickname || oldNickname.trim() === '') ? 'assigned on join' : 'bot action';
        }

        // Update nickname history with tracking
        await updateUserNickname(
            member.id,
            newNickname,
            false, // not boost related
            undefined, // no boost event ID
            changedBy || member.guild.members.me?.id, // bot ID if no changer specified
            reason
        );
    } catch (error) {
        console.log(`Could not update nickname for ${member.user.username}: Permission denied or higher role`);
        // Don't throw error, just log it
    }

    return { assignment, isDuplicate, pinnedConflict };
}

/**
 * Swap numbers between two users
 */
export async function swapNumbers(
    guild: Guild,
    member1: GuildMember,
    member2: GuildMember,
    executorId?: string // Add executor tracking
): Promise<{ assignment1: UserNumberAssignment, assignment2: UserNumberAssignment, pinUpdates: Array<{ userId: string; oldNumber: number; newNumber: number }> } | null> {
    const config = await getOrCreateConfig(guild.id);

    if (!config.enabled) {
        return null;
    }

    const number1 = await getMemberCurrentNumber(member1);
    const number2 = await getMemberCurrentNumber(member2);

    if (number1 === null || number2 === null) {
        throw new Error('Both users must have numbers in their nicknames to swap');
    }

    // Create assignment records for both users with swapped numbers
    const assignment1: UserNumberAssignment = {
        guildId: guild.id,
        userId: member1.id,
        number: number2, // member1 gets member2's number
        assignedAt: new Date(),
        isBot: member1.user.bot,
        displayName: member1.displayName || member1.user.username
    };

    const assignment2: UserNumberAssignment = {
        guildId: guild.id,
        userId: member2.id,
        number: number1, // member2 gets member1's number
        assignedAt: new Date(),
        isBot: member2.user.bot,
        displayName: member2.displayName || member2.user.username
    };

    // Handle the swap in the database carefully to avoid unique constraint violations
    // We need to temporarily remove the existing assignments and then add the new ones
    const repository = getRepository();

    // Delete existing assignments first
    await repository.deleteAssignment(guild.id, member1.id);
    await repository.deleteAssignment(guild.id, member2.id);

    // Now save the new swapped assignments
    await repository.saveAssignment(assignment1);
    await repository.saveAssignment(assignment2);

    // Check and update pin records so pins follow users
    const pinUpdates: Array<{ userId: string; oldNumber: number; newNumber: number }> = [];
    const pin1 = await repository.getPinnedNumber(guild.id, member1.id);
    const pin2 = await repository.getPinnedNumber(guild.id, member2.id);

    if (pin1 && pin2) {
        // Both pinned — delete both first to avoid unique constraint on (guildId, number)
        await repository.unpinNumber(guild.id, member1.id);
        await repository.unpinNumber(guild.id, member2.id);

        await repository.pinNumber({
            ...pin1,
            number: number2!, // member1 now has number2
        });
        await repository.pinNumber({
            ...pin2,
            number: number1!, // member2 now has number1
        });

        pinUpdates.push({ userId: member1.id, oldNumber: number1!, newNumber: number2! });
        pinUpdates.push({ userId: member2.id, oldNumber: number2!, newNumber: number1! });
    } else if (pin1) {
        await repository.updatePinNumber(guild.id, member1.id, number2!);
        pinUpdates.push({ userId: member1.id, oldNumber: number1!, newNumber: number2! });
    } else if (pin2) {
        await repository.updatePinNumber(guild.id, member2.id, number1!);
        pinUpdates.push({ userId: member2.id, oldNumber: number2!, newNumber: number1! });
    }

    // Update nicknames for both users
    try {
        const suffix1 = member1.user.bot ? config.botSuffix : number2.toString();
        const newNickname1 = `${config.prefix}${suffix1}`;
        await member1.setNickname(newNickname1);

        // Update nickname history with tracking
        await updateUserNickname(
            member1.id,
            newNickname1,
            false, // not boost related
            undefined, // no boost event ID
            executorId, // who executed the swap
            'swap command' // reason
        );
    } catch (error) {
        console.error(`Could not update nickname for ${member1.user.username}:`, error);
    }

    try {
        const suffix2 = member2.user.bot ? config.botSuffix : number1.toString();
        const newNickname2 = `${config.prefix}${suffix2}`;
        await member2.setNickname(newNickname2);

        // Update nickname history with tracking
        await updateUserNickname(
            member2.id,
            newNickname2,
            false, // not boost related
            undefined, // no boost event ID
            executorId, // who executed the swap
            'swap command' // reason
        );
    } catch (error) {
        console.error(`Could not update nickname for ${member2.user.username}:`, error);
    }

    return { assignment1, assignment2, pinUpdates };
}

/**
 * Get the next available number based on the current mode.
 * Excludes both taken numbers (current nicknames) and pinned numbers (reserved for absent users).
 * If forUserId is provided, that user's own pinned number is not excluded.
 */
export async function getNextAvailableNumber(guild: Guild, config: UserNumberConfig, forUserId?: string): Promise<number> {
    const unavailableNumbers = await getAllUnavailableNumbers(guild, forUserId);

    if (config.mode === AssignmentMode.ASCENDING) {
        // Find next number starting from nextNumber
        let candidate = config.nextNumber;
        while (unavailableNumbers.has(candidate)) {
            candidate++;
        }
        return candidate;
    } else if (config.mode === AssignmentMode.FILL) {
        return await getNextFillModeNumber(guild, config, unavailableNumbers);
    }

    return config.nextNumber;
}

/**
 * Get the next number in fill mode
 */
async function getNextFillModeNumber(guild: Guild, config: UserNumberConfig, unavailableNumbers: Set<number>): Promise<number> {
    const searchStart = config.fillStartPosition || config.startPosition;

    // Find the highest unavailable number
    const highestTaken = Math.max(...Array.from(unavailableNumbers), 0);
    const searchEnd = Math.max(highestTaken, config.nextNumber);

    // Get available numbers from start position to highest
    const availableNumbers: number[] = [];
    for (let i = searchStart; i <= searchEnd; i++) {
        if (!unavailableNumbers.has(i)) {
            availableNumbers.push(i);
        }
    }

    if (availableNumbers.length > 0) {
        if (config.fillStrategy === FillStrategy.RANDOM) {
            const randomIndex = Math.floor(Math.random() * availableNumbers.length);
            return availableNumbers[randomIndex];
        } else {
            // Sequential - return the lowest available
            return availableNumbers[0];
        }
    }

    // No gaps found, return next number after highest
    return Math.max(highestTaken + 1, config.nextNumber);
}

/**
 * Handle member leaving - clean up historical record
 */
export async function handleMemberLeave(guildId: string, userId: string): Promise<void> {
    try {
        await getRepository().deleteAssignment(guildId, userId);
        // console.log(`Cleaned up assignment record for user ${userId} in guild ${guildId}`);
    } catch (error) {
        console.error(`Error cleaning up assignment for ${userId}:`, error);
    }
}

/**
 * Get available numbers below the next number for catchup
 */
async function getAvailableNumbersForCatchup(guild: Guild, count: number): Promise<number[]> {
    const config = await getOrCreateConfig(guild.id);
    const unavailableNumbers = await getAllUnavailableNumbers(guild);
    const availableNumbers: number[] = [];

    console.log(`[CATCHUP] ${config.nextNumber}\n${config}`)
    // Start from next number and work backwards to find available slots
    let candidate = config.nextNumber - 1;

    while (availableNumbers.length < count && candidate >= config.startPosition) {
        if (!unavailableNumbers.has(candidate)) {
            availableNumbers.push(candidate);
        }
        candidate--;
    }

    // If we still need more numbers and haven't found enough below nextNumber,
    // continue from nextNumber onwards
    if (availableNumbers.length < count) {
        candidate = config.nextNumber;
        while (availableNumbers.length < count) {
            if (!unavailableNumbers.has(candidate)) {
                availableNumbers.push(candidate);
            }
            candidate++;
        }
    }

    // Sort in ascending order so earliest join dates get lower numbers
    return availableNumbers.sort((a, b) => a - b);
}

/**
 * Assign a specific number to a user during catchup
 */
async function assignSpecificNumber(
    guild: Guild,
    member: GuildMember,
    number: number
): Promise<UserNumberAssignment | null> {
    const config = await getOrCreateConfig(guild.id);

    if (!config.enabled) {
        return null;
    }

    // Check if number is already taken
    const membersWithNumber = await getMembersWithNumber(guild, number);
    if (membersWithNumber.length > 0) {
        throw new Error(`Number ${number} is already assigned to ${membersWithNumber[0].displayName}`);
    }

    // Check if number is pinned to someone else
    const pinConflict = await getRepository().isPinnedToOther(guild.id, number, member.id);
    if (pinConflict) {
        throw new Error(`Number ${number} is pinned to user ${pinConflict.userId}`);
    }

    // Create assignment record for historical tracking
    const assignment: UserNumberAssignment = {
        guildId: guild.id,
        userId: member.id,
        number: number,
        assignedAt: new Date(),
        isBot: member.user.bot,
        displayName: member.displayName || member.user.username
    };

    await getRepository().saveAssignment(assignment);

    // Try to update member nickname (don't throw error if it fails)
    try {
        const suffix = assignment.isBot ? config.botSuffix : assignment.number.toString();
        const newNickname = `${config.prefix}${suffix}`;

        await member.setNickname(newNickname, 'User number assignment');

        // Update nickname history with tracking
        await updateUserNickname(
            member.id,
            newNickname,
            false, // not boost related
            undefined, // no boost event ID
            member.guild.members.me?.id, // bot ID
            'assigned on join' // reason
        );
    } catch (error) {
        // console.log(`Could not update nickname for ${member.user.username}: Permission denied or higher role`);
        // Don't throw error, just log it
    }

    return assignment;
}

/**
 * Sync existing members and assign numbers to those without them
 */
export async function syncExistingMembers(guild: Guild): Promise<{
    assigned: number;
    errors: number;
    skipped: number;
    assignments: Array<{ username: string, userId: string, number: number }>;
}> {
    const config = await getOrCreateConfig(guild.id);

    if (!config.enabled) {
        return { assigned: 0, errors: 0, skipped: 0, assignments: [] };
    }

    // Get all members - REQUIRED for NAB operations
    await memberBulkFetch(guild, { required: true });
    const members = Array.from(guild.members.cache.values());

    let assigned = 0;
    let errors = 0;
    let skipped = 0;
    const assignments: Array<{ username: string, userId: string, number: number }> = [];

    // Filter to ONLY users who have NO nickname AND no number in their nickname
    const usersWithoutAnyNumber: GuildMember[] = [];

    for (const member of members) {
        const currentNumber = await getMemberCurrentNumber(member);

        // Skip if user already has a number in their nickname
        if (currentNumber !== null) {
            skipped++;
            continue;
        }

        // Skip if user has ANY nickname (even if it doesn't contain a number)
        if (member.nickname && member.nickname.trim() !== '') {
            skipped++;
            continue;
        }

        // Only process users with NO nickname
        usersWithoutAnyNumber.push(member);
    }

    // console.log(`Catchup: Found ${usersWithoutAnyNumber.length} users with no nicknames`);
    // console.log(`Catchup: Skipped ${skipped} users who already have nicknames`);

    if (usersWithoutAnyNumber.length === 0) {
        return { assigned, errors, skipped, assignments };
    }

    // Sort by join date for consistent assignment (earliest gets lowest available number)
    usersWithoutAnyNumber.sort((a, b) => a.joinedTimestamp! - b.joinedTimestamp!);

    // Get available numbers below next number (and above if needed)
    const availableNumbers = await getAvailableNumbersForCatchup(guild, usersWithoutAnyNumber.length);

    // console.log(`Catchup: Available numbers for assignment: ${availableNumbers.join(', ')}`);

    // Assign specific numbers to users in join date order
    // Use separate index for available numbers so pinned assignments don't waste slots
    let availableIndex = 0;
    for (let i = 0; i < usersWithoutAnyNumber.length; i++) {
        const member = usersWithoutAnyNumber[i];

        try {
            // Check if this user has a pinned number they should get
            const pinnedNumber = await getRepository().getPinnedNumber(guild.id, member.id);
            if (pinnedNumber) {
                const pinnedNumberTaken = await getMembersWithNumber(guild, pinnedNumber.number);
                if (pinnedNumberTaken.length === 0) {
                    const assignment = await assignSpecificNumber(guild, member, pinnedNumber.number);
                    if (assignment) {
                        assigned++;
                        assignments.push({ username: member.user.username, userId: member.user.id, number: pinnedNumber.number });
                        continue; // Don't consume from availableNumbers pool
                    }
                }
            }

            // Use next available number from pool
            if (availableIndex >= availableNumbers.length) break;
            const numberToAssign = availableNumbers[availableIndex];
            availableIndex++;

            const assignment = await assignSpecificNumber(guild, member, numberToAssign);
            if (assignment) {
                assigned++;
                assignments.push({ username: member.user.username, userId: member.user.id, number: numberToAssign });
            }
        } catch (error) {
            console.error(`Error assigning number to ${member.user.username}:`, error);
            errors++;
        }
    }

    return { assigned, errors, skipped, assignments };
}

/**
 * Get available number ranges based on current Discord state
 */
export async function getAvailableRanges(guild: Guild, minNumber?: number, maxNumber?: number): Promise<string[]> {
    const config = await getOrCreateConfig(guild.id);
    const takenNumbers = await getAllUnavailableNumbers(guild);

    const highestTaken = Math.max(...Array.from(takenNumbers), 0);

    // Determine search range
    let searchStart: number;
    let searchEnd: number;

    if (minNumber !== undefined && maxNumber !== undefined) {
        // Custom range provided
        searchStart = minNumber;
        searchEnd = maxNumber;
    } else if (maxNumber !== undefined) {
        // Only max provided, start from 1 or config start position (whichever is lower)
        searchStart = Math.min(1, config.startPosition);
        searchEnd = maxNumber;
    } else if (minNumber !== undefined) {
        // Only min provided, end at highest taken + buffer or reasonable default
        searchStart = minNumber;
        searchEnd = Math.max(highestTaken + 100, config.startPosition + 1000);
    } else {
        // No range specified, use default behavior
        searchStart = config.startPosition;
        searchEnd = Math.max(highestTaken + 100, config.startPosition + 1000);
    }

    const availableNumbers: number[] = [];
    for (let i = searchStart; i <= searchEnd; i++) {
        if (!takenNumbers.has(i)) {
            availableNumbers.push(i);
        }
    }

    if (availableNumbers.length === 0) {
        return ['No available numbers in range'];
    }

    // Group consecutive numbers into ranges
    const ranges: string[] = [];
    let rangeStart = availableNumbers[0];
    let rangeEnd = availableNumbers[0];

    for (let i = 1; i < availableNumbers.length; i++) {
        if (availableNumbers[i] === rangeEnd + 1) {
            rangeEnd = availableNumbers[i];
        } else {
            // End of consecutive range
            if (rangeStart === rangeEnd) {
                ranges.push(rangeStart.toString());
            } else {
                ranges.push(`${rangeStart}-${rangeEnd}`);
            }
            rangeStart = availableNumbers[i];
            rangeEnd = availableNumbers[i];
        }
    }

    // Add the last range
    if (rangeStart === rangeEnd) {
        ranges.push(rangeStart.toString());
    } else {
        ranges.push(`${rangeStart}-${rangeEnd}`);
    }

    return ranges;
}