const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, Events, GatewayIntentBits } = require("discord.js");
const sqlFunctions = require("../database/sql.js");
const Api = require("../general/api.js");
require("dotenv").config();
const token = process.env.DISCORD_TOKEN;

const client = new Client({
  intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
  ],
});
const sql = new sqlFunctions();
const api = new Api(sql);

client.commands = new Collection();
const commandsPath = path.join(__dirname, "command-deployment/commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".on.js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  command.api = api; // Pass the api instance to the command
  command.sql = sql; // Pass the db instance to the command
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, () => {
  console.log("Ready!");
});

client.on(Events.InteractionCreate, async (interaction) => {
  const { commandName, customId, options, guild, user } = interaction;
  const guildName = guild ? guild.name : 'DM';
  const userName = user.username;
  const subcommand = options?.getSubcommand(false);
  console.log(`Command: ${commandName ? commandName : customId}, Subcommand: ${subcommand ? subcommand : 'None'}, Guild: ${guildName}, User: ${userName}`);

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        flags: 64,
      });
    }
  } else if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(error);
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === 'verify' || interaction.customId === 'add_kingdom') {
      const command = client.commands.get('verify');
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'There was an error starting the verification process!',
          flags: 64,
        });
      }
    } else if (interaction.customId.startsWith('alchemist_') ||
               interaction.customId.startsWith('architect_') ||
               interaction.customId.startsWith('freetitle_')) {
      const command = client.commands.get('title');
      if (!command) return;
      try {
        await command.handleButtonInteraction(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'There was an error while executing this action!',
          flags: 64,
        });
      }
    } else if (interaction.customId.startsWith("playerinfo_")) {
      const command = client.commands.get("playerinfo");
      if (!command) return;
      try {
        await command.buttons(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while executing this command!",
          flags: 64,
        });
      }
    } else if (interaction.customId.startsWith("pay_")) {
      const command = client.commands.get("subscription");
      if (!command) return;
      try {
        await command.button(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while processing your payment request!",
          flags: 64,
        });
      }
    } else if (interaction.customId === "drago_list") {
      const command = client.commands.get("dragolookup");
      if (!command) return;
      try {
        await command.handleButtonInteraction(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while processing the Drago lookup button!",
          flags: 64,
        });
      }
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'wallet_modal') {
      const command = client.commands.get('verify');
      if (!command) return;
      try {
        await command.handleModalSubmit(interaction, sql);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'There was an error processing your modal submission!',
          flags: 64,
        });
      }
    } else if (interaction.customId.startsWith("playerinfo_")) {
      const command = client.commands.get("playerinfo");
      if (!command) return;
      try {
        await command.modals(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while executing this command!",
          flags: 64,
        });
      }
    } else if (interaction.customId.startsWith("blacklist_")) {
      const command = client.commands.get("blacklist");
      if (!command) return;
      try {
        await command.modals(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while executing this command!",
          flags: 64,
        });
      }
    } else if (interaction.customId === "payment_submission") {
      const command = client.commands.get("subscription");
      if (!command) return;
      try {
        await command.modal(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while processing your payment submission!",
          flags: 64,
        });
      }
    } else if (interaction.customId === "dragolist") {
      const command = client.commands.get("dragolookup");
      if (!command) return;
      try {
        await command.handleModalSubmit(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while processing the Drago lookup modal!",
          flags: 64,
        });
      }
    } else if (interaction.customId === "whitelist_bulkadd_modal") {
      const command = client.commands.get("whitelist");
      if (!command) return;
      try {
        await command.modalSubmit(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while processing your whitelist bulk add.",
          flags: 64,
        });
      }
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith("playerinfo_")) {
      const command = client.commands.get("playerinfo");
      if (!command) return;
      try {
        await command.stringselect(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while executing this command!",
          flags: 64,
        });
      }
    } else if (interaction.customId.startsWith("subscription_select")) {
      const command = client.commands.get("subscription");
      if (!command) return;
      try {
        await command.stringselect(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: "There was an error while handling your subscription selection.",
          flags: 64,
        });
      }
    }
  }
});

client.login(token);

process.on('exit', () => {
  sql.closeConnection();
});

process.on('SIGINT', () => {
  process.exit();
});

process.on('SIGTERM', () => {
  process.exit();
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});