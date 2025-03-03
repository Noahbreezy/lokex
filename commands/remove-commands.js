const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        // Fetch all guild commands
        const commands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        console.log(`Found ${commands.length} local commands to remove.`);

        // Remove each command individually, logging its name and id
        for (const command of commands) {
            console.log(`Removing command: ${command.name} (ID: ${command.id}).`);
            await rest.delete(Routes.applicationGuildCommand(clientId, guildId, command.id));
            console.log(`Successfully removed command: ${command.name} (ID: ${command.id}).`);
        }
    } catch (error) {
        console.error(error);
    }
})();