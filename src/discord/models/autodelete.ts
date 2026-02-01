import mongoose, { Schema, Document } from 'mongoose';

// Time unit enum
export enum TimeUnit {
    MINUTES = 'Minutes',
    HOURS = 'Hours',
    DAYS = 'Days'
}

// Interface for AutoDelete configuration
export interface AutoDeleteConfig {
    channelId: string;
    guildId: string;
    maxMessages: number;
    maxAge: number;
    timeUnit: TimeUnit;
    enabled: boolean;
    lastProcessed?: Date;
    keepMessages: Set<string>;
    isDonor?: boolean;
}

// Interface for the Mongoose document (extends our base config)
export interface AutoDeleteDocument extends Document, Omit<AutoDeleteConfig, 'keepMessages'> {
    keepMessages: string[]; // For MongoDB storage as array
}

// Create the Mongoose schema
const AutoDeleteSchema = new Schema<AutoDeleteDocument>({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    maxMessages: { type: Number, required: true },
    maxAge: { type: Number, required: true },
    timeUnit: { 
        type: String, 
        required: true, 
        enum: Object.values(TimeUnit) 
    },
    enabled: { type: Boolean, required: true, default: false },
    lastProcessed: { type: Date },
    keepMessages: { type: [String], default: [] },
    isDonor: { type: Boolean, default: false }
}, { 
    timestamps: true 
});

// Create indexes for better query performance
// AutoDeleteSchema.index({ channelId: 1 });
AutoDeleteSchema.index({ guildId: 1 });
AutoDeleteSchema.index({ enabled: 1 });

// Create and export the model
export const AutoDeleteModel = mongoose.model<AutoDeleteDocument>('autodelete', AutoDeleteSchema);

// In-memory cache of configurations
export const autoDeleteConfigs = new Map<string, AutoDeleteConfig>();

// Database repository singleton
let repository: AutoDeleteRepository | null = null;

// Database repository for AutoDelete configurations
export class AutoDeleteRepository {
    // Map from database document to application model
    private static documentToConfig(doc: AutoDeleteDocument): AutoDeleteConfig {
        return {
            channelId: doc.channelId,
            guildId: doc.guildId,
            maxMessages: doc.maxMessages,
            maxAge: doc.maxAge,
            timeUnit: doc.timeUnit as TimeUnit,
            enabled: doc.enabled,
            lastProcessed: doc.lastProcessed,
            keepMessages: new Set(doc.keepMessages),
            isDonor: doc.isDonor
        };
    }

    // Save a configuration to database and update cache
    async saveConfig(config: AutoDeleteConfig): Promise<void> {
        try {
            await AutoDeleteModel.updateOne(
                { channelId: config.channelId },
                { 
                    guildId: config.guildId,
                    maxMessages: config.maxMessages,
                    maxAge: config.maxAge,
                    timeUnit: config.timeUnit,
                    enabled: config.enabled,
                    lastProcessed: config.lastProcessed,
                    keepMessages: Array.from(config.keepMessages),
                    isDonor: config.isDonor
                },
                { upsert: true }
            );
            
            // Update cache
            autoDeleteConfigs.set(config.channelId, config);
        } catch (error) {
            console.error(`Error saving autodelete config for ${config.channelId}:`, error);
            throw error;
        }
    }

    // Get a configuration by channel ID
    async getConfig(channelId: string): Promise<AutoDeleteConfig | null> {
        // Try cache first
        if (autoDeleteConfigs.has(channelId)) {
            return autoDeleteConfigs.get(channelId) || null;
        }

        try {
            const doc = await AutoDeleteModel.findOne({ channelId });
            
            if (!doc) {
                return null;
            }
            
            const config = AutoDeleteRepository.documentToConfig(doc);
            autoDeleteConfigs.set(channelId, config);
            return config;
        } catch (error) {
            console.error(`Error getting autodelete config for ${channelId}:`, error);
            throw error;
        }
    }

    // Get all configurations
    async getAllConfigs(): Promise<AutoDeleteConfig[]> {
        try {
            const docs = await AutoDeleteModel.find({});
            const configs = docs.map(doc => AutoDeleteRepository.documentToConfig(doc));
            
            // Update cache
            configs.forEach(config => autoDeleteConfigs.set(config.channelId, config));
            
            return configs;
        } catch (error) {
            console.error('Error getting all autodelete configs:', error);
            throw error;
        }
    }

    // Get all enabled configurations
    async getEnabledConfigs(): Promise<AutoDeleteConfig[]> {
        try {
            const docs = await AutoDeleteModel.find({ enabled: true });
            return docs.map(doc => AutoDeleteRepository.documentToConfig(doc));
        } catch (error) {
            console.error('Error getting enabled autodelete configs:', error);
            throw error;
        }
    }

    // Delete a configuration
    async deleteConfig(channelId: string): Promise<void> {
        try {
            await AutoDeleteModel.deleteOne({ channelId });
            autoDeleteConfigs.delete(channelId);
        } catch (error) {
            console.error(`Error deleting autodelete config for ${channelId}:`, error);
            throw error;
        }
    }

    // Update last processed time
    async updateLastProcessed(channelId: string, lastProcessed: Date): Promise<void> {
        try {
            await AutoDeleteModel.updateOne(
                { channelId },
                { $set: { lastProcessed } }
            );
            
            // Update cache
            const config = autoDeleteConfigs.get(channelId);
            if (config) {
                config.lastProcessed = lastProcessed;
            }
        } catch (error) {
            console.error(`Error updating last processed time for ${channelId}:`, error);
            throw error;
        }
    }
    
    // Get configurations by guild ID
    async getConfigsByGuild(guildId: string): Promise<AutoDeleteConfig[]> {
        try {
            const docs = await AutoDeleteModel.find({ guildId });
            return docs.map(doc => AutoDeleteRepository.documentToConfig(doc));
        } catch (error) {
            console.error(`Error getting autodelete configs for guild ${guildId}:`, error);
            throw error;
        }
    }
}

/**
 * Initialize the repository for the AutoDelete system
 * Assumes Mongoose is already connected to the database
 * @returns The AutoDeleteRepository instance
 */
export async function initDatabase(): Promise<AutoDeleteRepository> {
    try {
        // Check if Mongoose is connected
        if (mongoose.connection.readyState !== 1) {
            console.warn('Warning: Mongoose does not appear to be connected. The AutoDelete system may not work properly.');
        }
        
        // Create repository instance if it doesn't exist
        if (!repository) {
            repository = new AutoDeleteRepository();
        }
        
        // Load configurations from database
        await loadConfigs();
        
        // console.log('AutoDelete system initialized with existing database connection');
        
        return repository;
    } catch (error) {
        console.error('Failed to initialize AutoDelete repository:', error);
        throw error;
    }
}

/**
 * Load configurations from the database into memory cache
 */
async function loadConfigs(): Promise<void> {
    if (!repository) {
        throw new Error('Repository not initialized. Call initDatabase first.');
    }
    
    try {
        // Clear the existing cache
        autoDeleteConfigs.clear();
        
        // Load all configs into cache
        const configs = await repository.getAllConfigs();
        // console.log(`Loaded ${configs.length} AutoDelete configurations from database`);
    } catch (error) {
        console.error('Error loading AutoDelete configurations:', error);
        throw error;
    }
}

/**
 * Get the repository instance
 */
export function getRepository(): AutoDeleteRepository {
    if (!repository) {
        throw new Error('Repository not initialized. Call initDatabase first.');
    }
    
    return repository;
}

/**
 * Close the database connection - this is a no-op since we're using an existing connection
 * Keep this method for API compatibility
 */
export async function closeDatabase(): Promise<void> {
    // Don't close the connection since it's managed elsewhere
    console.log('Note: Not closing MongoDB connection as it was established externally');
}