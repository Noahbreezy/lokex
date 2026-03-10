const { REST, Routes } = require('discord.js');
const { setGlobalDispatcher, Agent } = require('undici');
const { clientId } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;

// Prefer IPv4 to avoid hanging IPv6 routes on some VPS networks.
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});

console.log('Deploy cwd:', process.cwd());
console.log('Config clientId present:', Boolean(clientId));
console.log('Token present:', Boolean(token));

const commands = [];
// Grab all the command files from the commands directory you created earlier
const commandsDir = path.resolve(__dirname, './command-deployment/commands');
console.log('Commands dir:', commandsDir);
const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.on.js'));
console.log('Command files:', commandFiles.length);

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
    const fullPath = path.join(commandsDir, file);
    try {
        const command = require(fullPath);
        if (!command?.data?.toJSON) {
            console.warn('Skipping file without data.toJSON():', file);
            continue;
        }
        commands.push(command.data.toJSON());
    } catch (err) {
        console.error('Failed to load command file:', file, err);
    }
}
console.log('Commands loaded:', commands.length);

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

// and deploy your commands!
(async () => {
    try {
        if (!token) {
            console.error('Missing DISCORD_TOKEN. Aborting deploy.');
            process.exit(1);
        }
        if (!clientId) {
            console.error('Missing clientId in config.json. Aborting deploy.');
            process.exit(1);
        }

        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        const start = Date.now();
        const timeoutMs = 30000;
        const timeoutId = setTimeout(() => {
            const elapsed = Date.now() - start;
            console.error(`Deploy still running after ${elapsed}ms. Possible network hang.`);
        }, timeoutMs);

        // The put method is used to fully refresh all commands globally with the current set
        const data = await Promise.race([
            rest.put(Routes.applicationCommands(clientId), { body: commands }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`REST put timed out after ${timeoutMs}ms`)), timeoutMs)),
        ]);

        clearTimeout(timeoutId);

        const ms = Date.now() - start;
        console.log(`Successfully reloaded ${data.length} application (/) commands in ${ms}ms.`);
        process.exit(0);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error('Deploy error:', error);
        process.exit(1);
    }
})();