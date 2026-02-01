import { Schema, model } from 'mongoose';

interface simple_blacklist {
    // Define any simple settings here, e.g., strings, numbers, booleans
    [key: string]: string | number | boolean | string[] | object | null;
}

export interface complex_blacklist {
    // Define the structure of complex settings
    [key: string]: simple_blacklist | complex_blacklist;
}

export interface blacklist_setting {
    [key: string]: complex_blacklist;
}

// Create the model based on the schema
export interface blacklists extends Document {
    blacklists: blacklist_setting; // user define blacklists to be applied on vc creation or post creation
}


// Define the schema for the vcs
const blacklist_schema = new Schema({
    blacklists: {
        type: Map,
        of: new Schema({
            name: { type: String }, // The blacklist name
            users: { type: [String] }, // Array of blacklisted user IDs or names
        }),
    }
});

const blacklist_model = model<blacklists>('blacklists', blacklist_schema);

export default blacklist_model;
