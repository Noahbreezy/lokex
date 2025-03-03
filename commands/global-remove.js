const { REST, Routes } = require('discord.js');
const { clientId, token } = require('./config.json');

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Started removing all global application (/) commands.`);

        // Fetch all global commands
        const commands = await rest.get(Routes.applicationCommands(clientId));
        console.log(`Found ${commands.length} global commands to remove.`);

        // Remove each command individually, logging its name and id
        for (const command of commands) {
            console.log(`Removing command: ${command.name} (ID: ${command.id}).`);
            await rest.delete(Routes.applicationCommand(clientId, command.id));
            console.log(`Successfully removed command: ${command.name} (ID: ${command.id}).`);
        }
    } catch (error) {
        console.error(error);
    }
})();