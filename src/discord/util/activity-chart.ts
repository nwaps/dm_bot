// src/discord/util/activity-chart.ts

import { createCanvas, loadImage } from 'canvas';
import { user_activity_stats_model, member_join_leave_model } from '../models/activity';
import { Guild } from 'discord.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';

// Simple in-memory cache for channel names
const channelNameCache = new Map<string, string>();

interface ActivityChartData {
    user: {
        id: string;
        username: string;
        avatar?: string | null;
        joinDate: Date;
        createDate: Date;
        nickname?: string;
    };
    messageStats: {
        total: number;
        topChannels: Array<{ name: string; count: number }>;
        dailyActivity: Array<{ date: string; count: number }>;
    };
    voiceStats: {
        total: number;
        topChannels: Array<{ name: string; count: number }>;
        dailyActivity: Array<{ date: string; count: number }>;
    };
    serverRanks: {
        messageRank: number;
        voiceRank: number;
    };
}

interface ServerActivityData {
    guild: {
        name: string;
        memberCount: number;
        icon?: string | null;
    };
    globalStats: {
        totalMessages: number;
        totalVoiceHours: number;
        activeUsers: number;
        topMessageChannels: Array<{ name: string; count: number }>;
        topVoiceChannels: Array<{ name: string; count: number }>;
    };
    dailyActivity: {
        messages: Array<{ date: string; count: number }>;
        voice: Array<{ date: string; count: number }>;
        joins: Array<{ date: string; count: number }>;
        leaves: Array<{ date: string; count: number }>;
    };
    joinLeaveStats: {
        totalJoins: number;
        totalLeaves: number;
        netChange: number;
        days: number;
    };
    topUsers: {
        messages: Array<{ username: string; count: number }>;
        voice: Array<{ username: string; count: number }>;
    };
}

export async function generateActivityChart(
    userId: string, 
    guild: Guild,
    days: number = 14
): Promise<string> {
    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('User not found in guild');
    
    const stats = await user_activity_stats_model.findOne({
        user_id: userId,
        guild_id: guild.id
    });
    
    const chartData = await prepareChartData(userId, guild, stats, days);
    const imagePath = await createActivityImage(chartData);
    
    return imagePath;
}

export async function generateServerActivityChart(
    guild: Guild,
    days: number = 14
): Promise<string> {
    const chartData = await prepareServerChartData(guild, days);
    const imagePath = await createServerActivityImage(chartData, guild);
    
    return imagePath;
}

async function prepareChartData(
    userId: string,
    guild: Guild,
    stats: any,
    days: number
): Promise<ActivityChartData> {
    const member = await guild.members.fetch(userId);
    
    const defaultStats = {
        message_stats: {
            total_messages: 0,
            channels: new Map(),
            daily_activity: new Map()
        },
        voice_stats: {
            total_minutes: 0,
            channels: new Map(),
            daily_activity: new Map()
        }
    };
    
    const userStats = stats || defaultStats;
    
    const messageChannels = await getTopChannelsWithNames(guild, userStats.message_stats.channels, 3);
    const voiceChannels = await getTopChannelsWithNames(guild, userStats.voice_stats.channels, 3, true);
    
    const dailyMessages = getDailyActivity(userStats.message_stats.daily_activity, days);
    const dailyVoice = getDailyActivity(userStats.voice_stats.daily_activity, days, true);
    
    const ranks = stats ? await calculateServerRanks(userId, guild.id) : { messageRank: 0, voiceRank: 0 };
    
    return {
        user: {
            id: userId,
            username: member.user.username,
            avatar: member.user.avatar,
            joinDate: member.joinedAt || new Date(),
            createDate: member.user.createdAt,
            nickname: member.nickname || undefined
        },
        messageStats: {
            total: userStats.message_stats.total_messages,
            topChannels: messageChannels,
            dailyActivity: dailyMessages
        },
        voiceStats: {
            total: Math.round(userStats.voice_stats.total_minutes / 60),
            topChannels: voiceChannels,
            dailyActivity: dailyVoice
        },
        serverRanks: ranks
    };
}

async function prepareServerChartData(
    guild: Guild,
    days: number
): Promise<ServerActivityData> {
    const allStats = await user_activity_stats_model.find({ guild_id: guild.id });
    
    const totalMessages = allStats.reduce((sum, user) => sum + user.message_stats.total_messages, 0);
    const totalVoiceMinutes = allStats.reduce((sum, user) => sum + user.voice_stats.total_minutes, 0);
    const totalVoiceHours = Math.round(totalVoiceMinutes / 60);
    const activeUsers = allStats.filter(user => 
        user.message_stats.total_messages > 0 || user.voice_stats.total_minutes > 0
    ).length;
    
    const messageChannelTotals = new Map<string, number>();
    const voiceChannelTotals = new Map<string, number>();
    const dailyMessageTotals = new Map<string, number>();
    const dailyVoiceTotals = new Map<string, number>();
    
    allStats.forEach(userStats => {
        userStats.message_stats.channels.forEach((count, channelId) => {
            messageChannelTotals.set(channelId, (messageChannelTotals.get(channelId) || 0) + count);
        });
        
        userStats.voice_stats.channels.forEach((count, channelId) => {
            voiceChannelTotals.set(channelId, (voiceChannelTotals.get(channelId) || 0) + count);
        });
        
        userStats.message_stats.daily_activity.forEach((count, date) => {
            dailyMessageTotals.set(date, (dailyMessageTotals.get(date) || 0) + count);
        });
        
        userStats.voice_stats.daily_activity.forEach((count, date) => {
            dailyVoiceTotals.set(date, (dailyVoiceTotals.get(date) || 0) + count);
        });
    });
    
    const topMessageChannels = await getTopChannelsWithNames(guild, messageChannelTotals, 5);
    const topVoiceChannels = await getTopChannelsWithNames(guild, voiceChannelTotals, 5, true);
    
    const dailyMessages = getDailyActivity(dailyMessageTotals, days);
    const dailyVoice = getDailyActivity(dailyVoiceTotals, days, true);
    
    const joinLeaveData = await getDailyJoinLeaveData(guild.id, days);
    const joinLeaveTotals = await getJoinLeaveTotals(guild.id, days);
    
    const topMessageUsers = await getTopUsers(guild, allStats, 'message', 5);
    const topVoiceUsers = await getTopUsers(guild, allStats, 'voice', 5);
    
    return {
        guild: {
            name: guild.name,
            memberCount: guild.memberCount,
            icon: guild.icon
        },
        globalStats: {
            totalMessages,
            totalVoiceHours,
            activeUsers,
            topMessageChannels,
            topVoiceChannels
        },
        dailyActivity: {
            messages: dailyMessages,
            voice: dailyVoice,
            joins: joinLeaveData.joins,
            leaves: joinLeaveData.leaves
        },
        joinLeaveStats: {
            totalJoins: joinLeaveTotals.totalJoins,
            totalLeaves: joinLeaveTotals.totalLeaves,
            netChange: joinLeaveTotals.netChange,
            days: days
        },
        topUsers: {
            messages: topMessageUsers,
            voice: topVoiceUsers
        }
    };
}

async function getTopUsers(
    guild: Guild,
    allStats: any[],
    type: 'message' | 'voice',
    limit: number
): Promise<Array<{ username: string; count: number }>> {
    const userTotals = allStats.map(userStats => ({
        userId: userStats.user_id,
        total: type === 'message' 
            ? userStats.message_stats.total_messages 
            : Math.round(userStats.voice_stats.total_minutes / 60)
    }))
    .filter(user => user.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
    
    const result = [];
    for (const user of userTotals) {
        try {
            const member = await guild.members.fetch(user.userId);
            result.push({
                username: member.user.username,
                count: user.total
            });
        } catch {
            result.push({
                username: `Unknown User (${user.userId})`,
                count: user.total
            });
        }
    }
    
    return result;
}

async function getTopChannelsWithNames(
    guild: Guild, 
    channelMap: Map<string, number>, 
    limit: number,
    convertToHours: boolean = false
): Promise<Array<{ name: string; count: number }>> {
    const channels = Array.from(channelMap.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, limit);
    
    const result = [];
    for (const [channelId, rawCount] of channels) {
        const count = convertToHours ? Math.round(rawCount / 60) : rawCount;
        let channelName: string;
        
        try {
            const channel = await guild.channels.fetch(channelId);
            if (channel?.name) {
                channelName = channel.name;
                // Cache the channel name for future use
                channelNameCache.set(channelId, channelName);
            } else {
                channelName = 'Unknown Channel';
            }
        } catch {
            // Channel fetch failed - check cache first
            const cachedName = channelNameCache.get(channelId);
            if (cachedName) {
                channelName = cachedName; // Use the cached name
            } else {
                // No cached name available - use a descriptive fallback
                const shortId = channelId.slice(-4);
                channelName = `#deleted-${shortId}`;
            }
        }
        
        result.push({
            name: channelName,
            count
        });
    }
    
    return result;
}

function getDailyActivity(
    dailyMap: Map<string, number>, 
    days: number,
    convertToHours: boolean = false
): Array<{ date: string; count: number }> {
    const result = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const rawValue = dailyMap.get(dateStr) || 0;
        const count = convertToHours ? Math.round(rawValue / 60) : rawValue;
        result.push({
            date: dateStr,
            count
        });
    }
    
    return result;
}

async function getDailyJoinLeaveData(
    guildId: string,
    days: number
): Promise<{ joins: Array<{ date: string; count: number }>, leaves: Array<{ date: string; count: number }> }> {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    
    const joinLeaveData = await member_join_leave_model.find({
        guild_id: guildId,
        timestamp: { $gte: startDate }
    });
    
    const joinCounts = new Map<string, number>();
    const leaveCounts = new Map<string, number>();
    
    joinLeaveData.forEach(record => {
        const dateStr = record.timestamp.toISOString().split('T')[0];
        if (record.action === 'join') {
            joinCounts.set(dateStr, (joinCounts.get(dateStr) || 0) + 1);
        } else {
            leaveCounts.set(dateStr, (leaveCounts.get(dateStr) || 0) + 1);
        }
    });
    
    const joins = getDailyActivity(joinCounts, days);
    const leaves = getDailyActivity(leaveCounts, days);
    
    return { joins, leaves };
}

async function getJoinLeaveTotals(
    guildId: string,
    days: number
): Promise<{ totalJoins: number, totalLeaves: number, netChange: number }> {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    
    const joinLeaveData = await member_join_leave_model.find({
        guild_id: guildId,
        timestamp: { $gte: startDate }
    });
    
    let totalJoins = 0;
    let totalLeaves = 0;
    
    joinLeaveData.forEach(record => {
        if (record.action === 'join') {
            totalJoins++;
        } else {
            totalLeaves++;
        }
    });
    
    const netChange = totalJoins - totalLeaves;
    
    return { totalJoins, totalLeaves, netChange };
}

async function calculateServerRanks(userId: string, guildId: string): Promise<{ messageRank: number; voiceRank: number }> {
    const messageRanking = await user_activity_stats_model.find({ guild_id: guildId })
        .sort({ 'message_stats.total_messages': -1 });
    
    const voiceRanking = await user_activity_stats_model.find({ guild_id: guildId })
        .sort({ 'voice_stats.total_minutes': -1 });
    
    const messageRank = messageRanking.findIndex(user => user.user_id === userId) + 1;
    const voiceRank = voiceRanking.findIndex(user => user.user_id === userId) + 1;
    
    return { messageRank, voiceRank };
}

async function downloadAvatar(avatarUrl: string): Promise<string | null> {
    try {
        const response = await axios.get(avatarUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Discord Bot)'
            }
        });

        const tempDir = path.join('src', 'discord', 'resources', 'activity', 'temp');
        await fs.mkdir(tempDir, { recursive: true });
        
        const avatarPath = path.join(tempDir, `avatar_${Date.now()}.png`);
        await fs.writeFile(avatarPath, response.data);
        
        return avatarPath;
    } catch (error) {
        console.warn('Failed to download avatar:', error);
        return null;
    }
}

async function createActivityImage(data: ActivityChartData): Promise<string> {
    const width = 1200;
    const height = 580;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#36393f';
    ctx.fillRect(0, 0, width, height);

    await drawAvatar(ctx, data.user, width - 90, 10);
    await drawHeader(ctx, data, width);
    drawStatsSection(ctx, data, width, height);
    await drawActivityChart(ctx, data, width, height);
    
    const filename = `activity_${data.user.id}_${Date.now()}.png`;
    const outputPath = path.join('src', 'discord', 'resources', 'activity', filename);
    
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(outputPath, buffer);
    
    return outputPath;
}

async function createServerActivityImage(data: ServerActivityData, guild: Guild): Promise<string> {
    const width = 1200;
    const height = 580;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#36393f';
    ctx.fillRect(0, 0, width, height);
    
    if (data.guild.icon) {
        const iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${data.guild.icon}.png?size=128`;
        await drawServerIcon(ctx, iconUrl, width - 90, 10);
    }
    
    await drawServerHeader(ctx, data, width);
    drawServerStatsSection(ctx, data, width, height);
    await drawServerActivityChart(ctx, data, width, height);
    
    const filename = `server_activity_${Date.now()}.png`;
    const outputPath = path.join('src', 'discord', 'resources', 'activity', filename);
    
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(outputPath, buffer);
    
    return outputPath;
}

async function drawAvatar(ctx: any, user: any, x: number, y: number): Promise<void> {
    if (!user.avatar) return;
    
    const avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
    const avatarPath = await downloadAvatar(avatarUrl);
    
    if (avatarPath) {
        try {
            const avatarImage = await loadImage(avatarPath);
            const size = 60;
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatarImage, x, y, size, size);
            ctx.restore();
            
            await fs.unlink(avatarPath);
        } catch (error) {
            console.warn('Failed to draw avatar:', error);
        }
    }
}

async function drawServerIcon(ctx: any, iconUrl: string, x: number, y: number): Promise<void> {
    const iconPath = await downloadAvatar(iconUrl);
    
    if (iconPath) {
        try {
            const iconImage = await loadImage(iconPath);
            const size = 60;
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(iconImage, x, y, size, size);
            ctx.restore();
            
            await fs.unlink(iconPath);
        } catch (error) {
            console.warn('Failed to draw server icon:', error);
        }
    }
}

async function drawHeader(ctx: any, data: ActivityChartData, width: number): Promise<void> {
    if (data.user.nickname) {
        // small username below big nickname
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`${data.user.nickname}`, 20, 40);

        ctx.fillStyle = '#99aab5';
        ctx.font = '14px Arial';
        ctx.fillText(`${data.user.username}`, 20, 60);
    } else {
        // big username no nickname
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`${data.user.username}`, 20, 40);
    }

    ctx.fillStyle = '#99aab5';
    ctx.font = '14px Arial';
    
    const joinDate = data.user.joinDate.toLocaleDateString();
    const createDate = data.user.createDate.toLocaleDateString();
    
    ctx.fillText('Created On', width - 300, 30);
    ctx.fillText(createDate, width - 300, 50);

    ctx.fillText('Joined On', width - 180, 30);
    ctx.fillText(joinDate, width - 180, 50);
}

async function drawServerHeader(ctx: any, data: ServerActivityData, width: number): Promise<void> {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`Server Overview - ${data.guild.name}`, 20, 40);

    ctx.fillStyle = '#99aab5';
    ctx.font = '14px Arial';
    ctx.fillText(`${data.guild.memberCount} members`, 20, 60);
}

function drawStatsSection(ctx: any, data: ActivityChartData, width: number, height: number): void {
    const sectionY = 80;
    const sectionHeight = 150;
    
    const rankDisplay = data.serverRanks.messageRank > 0 ? `#${data.serverRanks.messageRank}` : 'Unranked';
    drawStatCard(ctx, 20, sectionY, 280, sectionHeight, 'Server Ranks', [
        { label: 'Message', value: rankDisplay, color: '#ffffff' },
        { label: 'Voice', value: 'No Data', color: '#99aab5' }
    ]);
    
    drawStatCard(ctx, 320, sectionY, 280, sectionHeight, 'Messages', [
        { label: '1d', value: getRecentActivity(data.messageStats.dailyActivity, 1), color: '#ffffff' },
        { label: '7d', value: getRecentActivity(data.messageStats.dailyActivity, 7), color: '#ffffff' },
        { label: '14d', value: `${data.messageStats.total} messages`, color: '#ffffff' }
    ]);
    
    drawStatCard(ctx, 620, sectionY, 280, sectionHeight, 'Voice Activity', [
        { label: '1d', value: getRecentActivity(data.voiceStats.dailyActivity, 1, true), color: '#ffffff' },
        { label: '7d', value: getRecentActivity(data.voiceStats.dailyActivity, 7, true), color: '#ffffff' },
        { label: '14d', value: `${data.voiceStats.total} hours`, color: '#ffffff' }
    ]);
    
    drawTopChannels(ctx, 920, sectionY, 260, sectionHeight, data);
}

function drawServerStatsSection(ctx: any, data: ServerActivityData, width: number, height: number): void {
    const sectionY = 80;
    const chartY = 250;
    const sectionHeight = chartY - sectionY - 10;
    
    drawServerOverviewSplit(ctx, 20, sectionY, 280, sectionHeight, data);
    
    drawServerTopChannels(ctx, 320, sectionY, 280, sectionHeight, 'Top Message Channels', data.globalStats.topMessageChannels, 'messages');
    drawServerTopChannels(ctx, 620, sectionY, 280, sectionHeight, 'Top Voice Channels', data.globalStats.topVoiceChannels, 'hours');
    drawServerTopUsers(ctx, 920, sectionY, 260, sectionHeight, data);
}

function drawStatCard(ctx: any, x: number, y: number, w: number, h: number, title: string, stats: Array<{label: string, value: string, color: string}>): void {
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(x, y, w, h);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(title, x + 12, y + 20);
    
    ctx.font = '14px Arial';
    stats.forEach((stat, index) => {
        const statY = y + 40 + (index * 25);
        
        // Label (left-aligned)
        ctx.fillStyle = '#99aab5';
        ctx.fillText(stat.label, x + 12, statY);
        
        // Value (right-aligned)
        ctx.fillStyle = stat.color;
        const textWidth = ctx.measureText(stat.value).width;
        ctx.fillText(stat.value, x + w - 12 - textWidth, statY);
    });
}

function drawStatCardRightAligned(ctx: any, x: number, y: number, w: number, h: number, title: string, stats: Array<{label: string, value: string, color: string}>): void {
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(x, y, w, h);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(title, x + 12, y + 20);
    
    ctx.font = '14px Arial';
    stats.forEach((stat, index) => {
        const statY = y + 40 + (index * 25);
        
        ctx.fillStyle = '#99aab5';
        ctx.fillText(stat.label, x + 12, statY);
        
        ctx.fillStyle = stat.color;
        const textWidth = ctx.measureText(stat.value).width;
        ctx.fillText(stat.value, x + w - 12 - textWidth, statY);
    });
}

function drawTopChannels(ctx: any, x: number, y: number, w: number, h: number, data: ActivityChartData): void {
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(x, y, w, h);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Top Channels', x + 15, y + 25);
    
    ctx.font = '12px Arial';
    
    if (data.messageStats.topChannels.length === 0) {
        ctx.fillStyle = '#99aab5';
        ctx.fillText('No activity yet', x + 15, y + 60);
        return;
    }
    
    data.messageStats.topChannels.forEach((channel, index) => {
        const channelY = y + 50 + (index * 20);
        
        // Channel name (left-aligned)
        ctx.fillStyle = '#99aab5';
        ctx.fillText('#', x + 15, channelY);
        ctx.fillText(channel.name, x + 30, channelY);
        
        // Count (right-aligned)
        ctx.fillStyle = '#ffffff';
        const countText = `${channel.count}`;
        const textWidth = ctx.measureText(countText).width;
        ctx.fillText(countText, x + w - 15 - textWidth, channelY);
    });
}

function drawServerTopChannels(ctx: any, x: number, y: number, w: number, h: number, title: string, channels: Array<{name: string, count: number}>, unit: string): void {
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(x, y, w, h);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(title, x + 12, y + 20);
    
    ctx.font = '12px Arial';
    
    if (channels.length === 0) {
        ctx.fillStyle = '#99aab5';
        ctx.fillText('No activity yet', x + 12, y + 45);
        return;
    }
    
    channels.slice(0, 3).forEach((channel, index) => {
        const channelY = y + 40 + (index * 22);
        
        // Channel name (left-aligned)
        ctx.fillStyle = '#99aab5';
        ctx.fillText('#', x + 12, channelY);
        ctx.fillText(channel.name, x + 25, channelY);
        
        // Count with unit (right-aligned)
        ctx.fillStyle = '#ffffff';
        const countText = `${channel.count} ${unit}`;
        const textWidth = ctx.measureText(countText).width;
        ctx.fillText(countText, x + w - 12 - textWidth, channelY);
    });
}

function drawServerOverviewSplit(ctx: any, x: number, y: number, w: number, h: number, data: ServerActivityData): void {
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(x, y, w, h);
    
    const overviewWidth = (w * 3) / 5;
    const dividerX = x + overviewWidth;
    
    // Draw vertical divider
    ctx.strokeStyle = '#99aab5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX, y + 10);
    ctx.lineTo(dividerX, y + h - 10);
    ctx.stroke();
    
    // Left side - Server Overview
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Server Overview', x + 12, y + 20);
    
    ctx.font = '12px Arial';
    
    const serverStats = [
        { label: 'Total Messages', value: `${data.globalStats.totalMessages.toLocaleString()}`, color: '#ffffff' },
        { label: 'Voice Hours', value: `${data.globalStats.totalVoiceHours.toLocaleString()}`, color: '#ffffff' },
        { label: 'Active Users', value: `${data.globalStats.activeUsers.toLocaleString()}`, color: '#ffffff' }
    ];
    
    serverStats.forEach((stat, index) => {
        const statY = y + 40 + (index * 25);
        
        ctx.fillStyle = '#99aab5';
        ctx.fillText(stat.label, x + 12, statY);
        
        ctx.fillStyle = stat.color;
        const textWidth = ctx.measureText(stat.value).width;
        ctx.fillText(stat.value, x + overviewWidth - 12 - textWidth, statY);
    });
    
    // Right side - Join/Leave Stats
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Join/Leave', dividerX + 12, y + 20);
    
    ctx.font = '12px Arial';
    
    // Joins
    ctx.fillStyle = '#43b581';
    ctx.fillText('Joins', dividerX + 12, y + 40);
    ctx.fillStyle = '#ffffff';
    const joinsText = data.joinLeaveStats.totalJoins.toString();
    const joinsWidth = ctx.measureText(joinsText).width;
    ctx.fillText(joinsText, x + w - 12 - joinsWidth, y + 40);
    
    // Leaves
    ctx.fillStyle = '#ed4245';
    ctx.fillText('Leaves', dividerX + 12, y + 65);
    ctx.fillStyle = '#ffffff';
    const leavesText = data.joinLeaveStats.totalLeaves.toString();
    const leavesWidth = ctx.measureText(leavesText).width;
    ctx.fillText(leavesText, x + w - 12 - leavesWidth, y + 65);
    
    // Net change
    const netChange = data.joinLeaveStats.netChange;
    ctx.fillStyle = netChange >= 0 ? '#43b581' : '#ed4245';
    ctx.fillText('Net', dividerX + 12, y + 90);
    ctx.fillStyle = netChange >= 0 ? '#43b581' : '#ed4245';
    const netText = (netChange >= 0 ? '+' : '') + netChange.toString();
    const netWidth = ctx.measureText(netText).width;
    ctx.fillText(netText, x + w - 12 - netWidth, y + 90);
}

function drawServerTopUsers(ctx: any, x: number, y: number, w: number, h: number, data: ServerActivityData): void {
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(x, y, w, h);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Top Users', x + 12, y + 20);
    
    ctx.font = '11px Arial';
    
    if (data.topUsers.messages.length === 0 && data.topUsers.voice.length === 0) {
        ctx.fillStyle = '#99aab5';
        ctx.fillText('No activity yet', x + 12, y + 45);
        return;
    }
    
    let currentY = y + 40;
    
    // Messages section
    if (data.topUsers.messages.length > 0) {
        ctx.fillStyle = '#7289da';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Messages', x + 12, currentY);
        currentY += 18;
        
        ctx.font = '11px Arial';
        data.topUsers.messages.slice(0, 3).forEach((user, index) => {
            ctx.fillStyle = '#7289da';
            ctx.fillText(`${user.username}`, x + 12, currentY);
            
            const countText = `${user.count}`;
            const textWidth = ctx.measureText(countText).width;
            ctx.fillText(countText, x + w - 12 - textWidth, currentY);
            currentY += 12;
        });
        
        currentY += 3;
    }
    
    // Voice section
    if (data.topUsers.voice.length > 0) {
        ctx.fillStyle = '#f04747';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Voice (hours)', x + 12, currentY + 7);
        currentY += 25;
        
        ctx.font = '11px Arial';
        data.topUsers.voice.slice(0, 3).forEach((user, index) => {
            ctx.fillStyle = '#f04747';
            ctx.fillText(`${user.username}`, x + 12, currentY);
            
            const countText = `${user.count}`;
            const textWidth = ctx.measureText(countText).width;
            ctx.fillText(countText, x + w - 12 - textWidth, currentY);
            currentY += 12;
        });
    }
}

async function drawActivityChart(ctx: any, data: ActivityChartData, width: number, height: number): Promise<void> {
    const chartY = 250;
    const chartHeight = 300;
    const chartWidth = width - 40;
    
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(20, chartY, chartWidth, chartHeight);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Activity Chart', 40, chartY + 25);
    
    ctx.fillStyle = '#7289da';
    ctx.fillRect(width - 200, chartY + 10, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.fillText('Messages (left)', width - 180, chartY + 20);
    
    ctx.fillStyle = '#f04747';
    ctx.fillRect(width - 80, chartY + 10, 12, 12);
    ctx.fillText('Voice hrs (right)', width - 60, chartY + 20);
    
    // Draw dual-axis chart for user activity
    drawDualAxisLineChart(
        ctx, 
        data.messageStats.dailyActivity, 
        data.voiceStats.dailyActivity, 
        70, 
        chartY + 50, 
        chartWidth - 100, 
        chartHeight - 80, 
        '#7289da', 
        '#f04747',
        'Messages',
        'Voice Hours'
    );
}

async function drawServerActivityChart(ctx: any, data: ServerActivityData, width: number, height: number): Promise<void> {
    const chartY = 250;
    const chartHeight = 300;
    const chartWidth = width - 40;
    
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(20, chartY, chartWidth, chartHeight);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Server Activity Charts', 40, chartY + 25);
    
    // Legend for activity lines
    ctx.fillStyle = '#7289da';
    ctx.fillRect(width - 200, chartY + 10, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.fillText('Messages', width - 180, chartY + 20);
    
    ctx.fillStyle = '#f04747';
    ctx.fillRect(width - 120, chartY + 10, 12, 12);
    ctx.fillText('Voice', width - 100, chartY + 20);
    
    // Legend for join/leave bars
    ctx.fillStyle = '#43b581';
    ctx.fillRect(width - 285, chartY + 10, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Joins', width - 270, chartY + 20);
    
    ctx.fillStyle = '#ed4245';
    ctx.fillRect(width - 350, chartY + 10, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Leaves', width - 330, chartY + 20);
    
    // Draw bar charts for joins/leaves first (background) - overlay on bottom of line chart
    const barChartHeight = 80; // Smaller height so it doesn't overwhelm line chart
    const lineChartHeight = chartHeight - 80; // Leave space for bars at bottom
    const lineChartY = chartY + 50;
    const barChartY = lineChartY + lineChartHeight - barChartHeight; // Position bars at bottom of line chart area
    
    drawDualBarChart(
        ctx,
        data.dailyActivity.joins,
        data.dailyActivity.leaves,
        70,
        barChartY,
        chartWidth - 100,
        barChartHeight,
        '#43b581',
        '#ed4245'
    );
    
    // Draw line charts for messages/voice on top
    drawDualAxisLineChart(
        ctx, 
        data.dailyActivity.messages, 
        data.dailyActivity.voice, 
        70, 
        lineChartY, 
        chartWidth - 100, 
        lineChartHeight, 
        '#7289da', 
        '#f04747',
        'Messages',
        'Voice Hours'
    );
}

function drawLineChart(ctx: any, data: Array<{date: string, count: number}>, x: number, y: number, w: number, h: number, color: string, isSecondary: boolean = false): void {
    if (data.length === 0) return;
    
    const maxValue = Math.max(...data.map(d => d.count), 1);
    const stepX = w / (data.length - 1);
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    data.forEach((point, index) => {
        const pointX = x + (index * stepX);
        const pointY = y + h - ((point.count / maxValue) * h);
        
        if (index === 0) {
            ctx.moveTo(pointX, pointY);
        } else {
            ctx.lineTo(pointX, pointY);
        }
    });
    
    ctx.stroke();
    
    if (!isSecondary) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}

function drawHorizontalGridLines(ctx: any, x: number, y: number, w: number, h: number, tickCount: number = 5): void {
    ctx.strokeStyle = '#555555'; // More visible gray
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6; // More opaque but still subtle
    
    ctx.beginPath();
    for (let i = 0; i <= tickCount; i++) {
        const lineY = y + (i * (h / tickCount));
        ctx.moveTo(x, lineY);
        ctx.lineTo(x + w, lineY);
    }
    ctx.stroke();
    
    ctx.globalAlpha = 1.0; // Reset transparency
}

function drawYAxisScale(ctx: any, x: number, y: number, h: number, maxValue: number, isLeftSide: boolean = true, label: string = ''): void {
    const tickCount = 5;
    const step = maxValue / tickCount;
    
    ctx.strokeStyle = '#99aab5';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#99aab5';
    ctx.font = '10px Arial';
    
    // Draw axis line
    ctx.beginPath();
    if (isLeftSide) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
    } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
    }
    ctx.stroke();
    
    // Draw ticks and labels
    for (let i = 0; i <= tickCount; i++) {
        const value = Math.round(maxValue - (i * step));
        const tickY = y + (i * (h / tickCount));
        
        // Draw tick mark
        ctx.beginPath();
        if (isLeftSide) {
            ctx.moveTo(x - 5, tickY);
            ctx.lineTo(x, tickY);
        } else {
            ctx.moveTo(x, tickY);
            ctx.lineTo(x + 5, tickY);
        }
        ctx.stroke();
        
        // Draw label
        const valueText = value.toString();
        if (isLeftSide) {
            const textWidth = ctx.measureText(valueText).width;
            ctx.fillText(valueText, x - textWidth - 8, tickY + 3);
        } else {
            ctx.fillText(valueText, x + 8, tickY + 3);
        }
    }
    
    // Draw axis label
    if (label) {
        ctx.save();
        ctx.translate(isLeftSide ? x - 40 : x + 40, y + h / 2);
        ctx.rotate(isLeftSide ? -Math.PI / 2 : Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        const labelWidth = ctx.measureText(label).width;
        ctx.fillText(label, -labelWidth / 2, 0);
        ctx.restore();
    }
}

function drawBarChart(ctx: any, data: Array<{date: string, count: number}>, x: number, y: number, w: number, h: number, color: string, isOverlay: boolean = false): void {
    if (data.length === 0) return;
    
    const maxValue = Math.max(...data.map(d => d.count), 1);
    const barWidth = w / data.length;
    
    ctx.fillStyle = color;
    ctx.globalAlpha = isOverlay ? 0.7 : 0.8;
    
    data.forEach((point, index) => {
        const barHeight = (point.count / maxValue) * h;
        const barX = x + (index * barWidth);
        const barY = y + h - barHeight;
        
        ctx.fillRect(barX, barY, barWidth * 0.8, barHeight);
    });
    
    ctx.globalAlpha = 1.0;
}

function drawDualBarChart(
    ctx: any,
    joinsData: Array<{date: string, count: number}>,
    leavesData: Array<{date: string, count: number}>,
    x: number,
    y: number,
    w: number,
    h: number,
    joinsColor: string,
    leavesColor: string
): void {
    if (joinsData.length === 0 && leavesData.length === 0) return;
    
    // Get maximum values, ensuring we treat all as positive
    const joinsMax = Math.max(...joinsData.map(d => Math.abs(d.count)), 1);
    const leavesMax = Math.max(...leavesData.map(d => Math.abs(d.count)), 1);
    const overallMax = Math.max(joinsMax, leavesMax);
    
    const dataLength = Math.max(joinsData.length, leavesData.length);
    const barWidth = w / dataLength;
    const individualBarWidth = barWidth * 0.35; // Narrower bars so they fit side by side
    
    // Bottom baseline for all bars - at the bottom of the bar chart area (which is overlaid on line chart)
    const baseline = y + h; // Bottom of bar chart area - where "0" would be on a scale
    const availableHeight = h; // Use full available height
    
    // Draw joins and leaves bars side by side for each day
    for (let i = 0; i < dataLength; i++) {
        const baseX = x + (i * barWidth);
        
        // Draw joins bar (left side of each day)
        if (i < joinsData.length && joinsData[i].count > 0) {
            ctx.fillStyle = joinsColor;
            ctx.globalAlpha = 0.8;
            
            const joinsCount = Math.abs(joinsData[i].count); // Ensure positive
            const joinsHeight = (joinsCount / overallMax) * availableHeight;
            const joinsX = baseX + (barWidth * 0.1);
            const joinsY = baseline - joinsHeight; // Start from baseline, go up
            
            ctx.fillRect(joinsX, joinsY, individualBarWidth, joinsHeight);
            
            // Add number on top of joins bar
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            const joinsText = joinsCount.toString();
            const joinsTextWidth = ctx.measureText(joinsText).width;
            ctx.fillText(joinsText, joinsX + (individualBarWidth / 2) - (joinsTextWidth / 2), joinsY - 3);
        }
        
        // Draw leaves bar (right side of each day)
        if (i < leavesData.length && leavesData[i].count > 0) {
            ctx.fillStyle = leavesColor;
            ctx.globalAlpha = 0.8;
            
            const leavesCount = Math.abs(leavesData[i].count); // Ensure positive
            const leavesHeight = (leavesCount / overallMax) * availableHeight;
            const leavesX = baseX + (barWidth * 0.55);
            const leavesY = baseline - leavesHeight; // Start from baseline, go up
            
            ctx.fillRect(leavesX, leavesY, individualBarWidth, leavesHeight);
            
            // Add number on top of leaves bar
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            const leavesText = leavesCount.toString();
            const leavesTextWidth = ctx.measureText(leavesText).width;
            ctx.fillText(leavesText, leavesX + (individualBarWidth / 2) - (leavesTextWidth / 2), leavesY - 3);
        }
    }
    
    ctx.globalAlpha = 1.0;
}

function drawDualAxisLineChart(
    ctx: any, 
    primaryData: Array<{date: string, count: number}>, 
    secondaryData: Array<{date: string, count: number}>, 
    x: number, 
    y: number, 
    w: number, 
    h: number, 
    primaryColor: string, 
    secondaryColor: string,
    primaryLabel: string = '',
    secondaryLabel: string = ''
): void {
    if (primaryData.length === 0 && secondaryData.length === 0) return;
    
    const primaryMax = Math.max(...primaryData.map(d => d.count), 1);
    const secondaryMax = Math.max(...secondaryData.map(d => d.count), 1);
    const stepX = w / (Math.max(primaryData.length, secondaryData.length) - 1);
    
    // Draw horizontal grid lines first (behind everything)
    drawHorizontalGridLines(ctx, x, y, w, h);
    
    // Draw y-axis scales
    drawYAxisScale(ctx, x, y, h, primaryMax, true, primaryLabel);
    drawYAxisScale(ctx, x + w, y, h, secondaryMax, false, secondaryLabel);
    
    // Draw primary data (left axis)
    if (primaryData.length > 0) {
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        primaryData.forEach((point, index) => {
            const pointX = x + (index * stepX);
            const pointY = y + h - ((point.count / primaryMax) * h);
            
            if (index === 0) {
                ctx.moveTo(pointX, pointY);
            } else {
                ctx.lineTo(pointX, pointY);
            }
        });
        
        ctx.stroke();
    }
    
    // Draw secondary data (right axis)
    if (secondaryData.length > 0) {
        ctx.strokeStyle = secondaryColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        secondaryData.forEach((point, index) => {
            const pointX = x + (index * stepX);
            const pointY = y + h - ((point.count / secondaryMax) * h);
            
            if (index === 0) {
                ctx.moveTo(pointX, pointY);
            } else {
                ctx.lineTo(pointX, pointY);
            }
        });
        
        ctx.stroke();
    }
}

function getRecentActivity(dailyActivity: Array<{date: string, count: number}>, days: number, isVoice: boolean = false): string {
    const recent = dailyActivity.slice(-days);
    const total = recent.reduce((sum, day) => sum + day.count, 0);
    return isVoice ? `${total} hours` : `${total} messages`;
}