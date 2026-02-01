import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { getRepository } from '../../models/nab';
import { getOrCreateConfig } from '../../util/nab';

module.exports = {
    data: { name: "export-pinned" },
    async execute(client: Client, interaction: any) {
        if (!interaction.guild) {
            return interaction.reply({ 
                content: 'This feature can only be used in a server.', 
                ephemeral: true 
            });
        }
    
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
   
        try {
            const config = await getOrCreateConfig(interaction.guild.id);
            
            if (!config.enabled) {
                return interaction.editReply({ 
                    content: 'Number assignment system is disabled for this server.' 
                });
            }
    
            // Get all pinned numbers for this guild
            const pinnedNumbers = await getRepository().getAllPinnedNumbers(interaction.guild.id);
    
            if (pinnedNumbers.length === 0) {
                return interaction.editReply({ 
                    content: 'No pinned numbers found to export.' 
                });
            }
    
            // Generate CSV data
            const csvHeader = 'User ID,Username,Number,Pinned By ID,Pinned By Username,Pinned Date,Reason\n';
            
            const csvRows = await Promise.all(pinnedNumbers.map(async (pin) => {
                let username = 'Unknown User';
                let pinnedByUsername = 'Unknown User';
                
                try {
                    const user = await client.users.fetch(pin.userId);
                    username = user.username;
                } catch {
                    // Keep default value
                }
                
                try {
                    const pinnedByUser = await client.users.fetch(pin.pinnedBy);
                    pinnedByUsername = pinnedByUser.username;
                } catch {
                    // Keep default value
                }
    
                const pinnedDate = pin.pinnedAt.toISOString().split('T')[0]; // YYYY-MM-DD format
                const reason = pin.reason ? `"${pin.reason.replace(/"/g, '""')}"` : ''; // Escape quotes in CSV
                
                return `${pin.userId},"${username}",${pin.number},${pin.pinnedBy},"${pinnedByUsername}",${pinnedDate},${reason}`;
            }));
    
            const csvContent = csvHeader + csvRows.join('\n');
            const csvBuffer = Buffer.from(csvContent, 'utf-8');
            
            // Create attachment
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `pinned_numbers_${interaction.guild.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.csv`;
            
            const attachment = new AttachmentBuilder(csvBuffer, { name: filename });
    
            await interaction.editReply({
                content: `**CSV Export Complete**\n\nExported ${pinnedNumbers.length} pinned number${pinnedNumbers.length === 1 ? '' : 's'} from **${interaction.guild.name}**.`,
                files: [attachment]
            });
    
        } catch (error: any) {
            console.error('Error exporting CSV:', error);
            await interaction.editReply({
                content: `Error exporting CSV: ${error.message}`
            });
        }
    },
};

