interface GuildMemberCacheData {
    guildId: string;
    lastBulkFetchTime: Date | null;
    lastBulkFetchCount: number;
    bulkFetchInProgress: boolean;
    bulkFetchTotal: number;
    cacheHits: number;
    cacheMisses: number;
    rateLimitBlocks: number;
}

interface CacheStats {
    guildId: string;
    lastBulkFetch: Date | null;
    timeSinceLastFetch: number | null;
    cacheValid: boolean;
    cachedMemberCount: number;
    bulkFetchTotal: number;
    cacheHits: number;
    cacheMisses: number;
    rateLimitBlocks: number;
    hitRate: number;
}

export class MemberCacheManager {
    private static instance: MemberCacheManager;
    private guildCacheData: Map<string, GuildMemberCacheData>;

    // Configuration
    private readonly BULK_FETCH_TTL = 10 * 60 * 1000; // 10 minutes
    private readonly MIN_BULK_FETCH_INTERVAL = 30 * 1000; // 30 seconds

    private constructor() {
        this.guildCacheData = new Map();
    }

    public static getInstance(): MemberCacheManager {
        if (!MemberCacheManager.instance) {
            MemberCacheManager.instance = new MemberCacheManager();
        }
        return MemberCacheManager.instance;
    }

    private getOrCreateGuildData(guildId: string): GuildMemberCacheData {
        if (!this.guildCacheData.has(guildId)) {
            this.guildCacheData.set(guildId, {
                guildId,
                lastBulkFetchTime: null,
                lastBulkFetchCount: 0,
                bulkFetchInProgress: false,
                bulkFetchTotal: 0,
                cacheHits: 0,
                cacheMisses: 0,
                rateLimitBlocks: 0
            });
        }
        return this.guildCacheData.get(guildId)!;
    }

    public shouldBulkFetch(guildId: string): boolean {
        const data = this.getOrCreateGuildData(guildId);

        if (!data.lastBulkFetchTime) {
            return true;
        }

        const timeSinceLastFetch = Date.now() - data.lastBulkFetchTime.getTime();
        return timeSinceLastFetch >= this.BULK_FETCH_TTL;
    }

    public canFetch(guildId: string): { allowed: boolean; reason?: string } {
        const data = this.getOrCreateGuildData(guildId);

        if (data.bulkFetchInProgress) {
            data.rateLimitBlocks++;
            return {
                allowed: false,
                reason: 'Bulk fetch already in progress'
            };
        }

        if (data.lastBulkFetchTime) {
            const timeSinceLastFetch = Date.now() - data.lastBulkFetchTime.getTime();

            if (timeSinceLastFetch < this.MIN_BULK_FETCH_INTERVAL) {
                data.rateLimitBlocks++;
                return {
                    allowed: false,
                    reason: `Must wait ${Math.ceil((this.MIN_BULK_FETCH_INTERVAL - timeSinceLastFetch) / 1000)}s before next fetch`
                };
            }
        }

        return { allowed: true };
    }

    public markBulkFetchStart(guildId: string): void {
        const data = this.getOrCreateGuildData(guildId);
        data.bulkFetchInProgress = true;
    }

    public recordBulkFetch(guildId: string, memberCount: number): void {
        const data = this.getOrCreateGuildData(guildId);
        data.lastBulkFetchTime = new Date();
        data.lastBulkFetchCount = memberCount;
        data.bulkFetchInProgress = false;
        data.bulkFetchTotal++;
    }

    public recordCacheHit(guildId: string): void {
        const data = this.getOrCreateGuildData(guildId);
        data.cacheHits++;
    }

    public recordCacheMiss(guildId: string): void {
        const data = this.getOrCreateGuildData(guildId);
        data.cacheMisses++;
    }

    public getStats(guildId: string, cachedMemberCount: number): CacheStats {
        const data = this.getOrCreateGuildData(guildId);

        const timeSinceLastFetch = data.lastBulkFetchTime
            ? Date.now() - data.lastBulkFetchTime.getTime()
            : null;

        const cacheValid = data.lastBulkFetchTime
            ? timeSinceLastFetch! < this.BULK_FETCH_TTL
            : false;

        const totalRequests = data.cacheHits + data.cacheMisses;
        const hitRate = totalRequests > 0
            ? (data.cacheHits / totalRequests) * 100
            : 0;

        return {
            guildId,
            lastBulkFetch: data.lastBulkFetchTime,
            timeSinceLastFetch,
            cacheValid,
            cachedMemberCount,
            bulkFetchTotal: data.bulkFetchTotal,
            cacheHits: data.cacheHits,
            cacheMisses: data.cacheMisses,
            rateLimitBlocks: data.rateLimitBlocks,
            hitRate: Math.round(hitRate * 100) / 100
        };
    }

    public clearGuildCache(guildId: string): void {
        this.guildCacheData.delete(guildId);
    }

    public getTTL(): number {
        return this.BULK_FETCH_TTL;
    }

    public getMinInterval(): number {
        return this.MIN_BULK_FETCH_INTERVAL;
    }

    public isFetchInProgress(guildId: string): boolean {
        const data = this.getOrCreateGuildData(guildId);
        return data.bulkFetchInProgress;
    }

    public getTimeSinceLastFetch(guildId: string): number | null {
        const data = this.getOrCreateGuildData(guildId);
        if (!data.lastBulkFetchTime) return null;
        return Date.now() - data.lastBulkFetchTime.getTime();
    }

    public getCacheStatus(guildId: string): {
        fetchInProgress: boolean;
        timeSinceLastFetch: number | null;
        cacheIsValid: boolean;
        lastFetchCount: number;
    } {
        const data = this.getOrCreateGuildData(guildId);
        const timeSinceLastFetch = data.lastBulkFetchTime
            ? Date.now() - data.lastBulkFetchTime.getTime()
            : null;

        return {
            fetchInProgress: data.bulkFetchInProgress,
            timeSinceLastFetch,
            cacheIsValid: timeSinceLastFetch !== null && timeSinceLastFetch < this.BULK_FETCH_TTL,
            lastFetchCount: data.lastBulkFetchCount
        };
    }

    public clearFetchInProgress(guildId: string): void {
        const data = this.getOrCreateGuildData(guildId);
        data.bulkFetchInProgress = false;
    }
}
