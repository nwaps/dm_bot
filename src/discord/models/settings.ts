import { Schema, model } from 'mongoose';

interface simple_setting {
    // Define any simple settings here, e.g., strings, numbers, booleans
    [key: string]: string | number | boolean | string[] | object | null;
}

export interface complex_setting {
    // Define the structure of complex settings
    [key: string]: simple_setting | complex_setting;
}

export interface guild_setting {
    [key: string]: complex_setting;
}

// Create the model based on the schema
export interface settings extends Document {
    guildId: string;
    settings: guild_setting;
}

// Define the schema for the settings
const settings_schema = new Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
    },
    settings: {
        type: Schema.Types.Mixed, // Allows for a flexible structure
        required: true,
    },
});

const settings_model = model<settings>('Settings', settings_schema);

export default settings_model;
