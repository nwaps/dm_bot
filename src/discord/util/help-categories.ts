export const HELP_CATEGORIES = {
    NUMBER_ASSIGNMENT: "Number Assignment (NAB)",
    VOICE_CHANNELS: "Voice Channels",
    SERVER_MANAGEMENT: "Server Management",
    BOOST_POOLS: "Boost Pools",
    BOOSTS_REWARDS: "Boosts & Rewards",
    MODERATION: "Moderation",
    TAGS_REWARDS: "Tags & Rewards",
    LOGGING_HISTORY: "Logging & History",
    SYSTEM_CONFIG: "System & Configuration",
    UTILITY: "Utility",
    MESSAGE_MANAGEMENT: "Message Management",
    HELP_META: "Help & Meta",
    APPLICATIONS: "Applications",
    UNCATEGORIZED: "Uncategorized"
} as const;

export type CategoryType = typeof HELP_CATEGORIES[keyof typeof HELP_CATEGORIES];

export const CATEGORY_ALL = "All";

// Helper to get available categories from a list of commands
export function getAvailableCategories(commands: { category?: string }[]): string[] {
    const categories = new Set<string>();
    commands.forEach(cmd => {
        categories.add(cmd.category || HELP_CATEGORIES.UNCATEGORIZED);
    });
    return [CATEGORY_ALL, ...Array.from(categories).sort()];
}
