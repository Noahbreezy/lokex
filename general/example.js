const { SlashCommandBuilder, Events, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sqlFunctions = require('../../database/sql.js');
const sql = new sqlFunctions();
const Evm = require('../../detectContractBalance/evm.js');
const evm = new Evm();

async function getNetworkValues() {
    const networks = await sql.getEnumValuesForNetwork();
    // console.log(networks);
    return networks;
}

async function handleNetworkAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const networks = await sql.getEnumValuesForNetwork();
    const filtered = networks.filter(network => network.toLowerCase().includes(focusedValue.toLowerCase()));
    await interaction.respond(
        filtered.map(network => ({ name: network, value: network }))
    );
}

async function handleTokenAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const tokenNames = await sql.getTokenNames();
    const filtered = tokenNames.filter(token => token.tokenname.toLowerCase().includes(focusedValue.toLowerCase()));
    await interaction.respond(
        filtered.map(token => ({ name: token.tokenname, value: token.id.toString() }))
    );
}

function createTokenInfoEmbed(tokenInfo) {
    console.log(tokenInfo);
    const embed = new EmbedBuilder()
        .setTitle(`Token Info: ${tokenInfo.tokenname}`)
        .setColor('#9af764')
        .addFields(
            { name: 'Token Address', value: tokenInfo.tokenAddress },
            { name: 'Network', value: tokenInfo.network },
            { name: 'Monitored Address', value: tokenInfo.addressToMonitor },
            { name: 'Current Balance', value: tokenInfo.balance.toString() },
            { name: 'Alert Amount', value: tokenInfo.alertAmount || 'Not set' }
        );
    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tokens')
        .setDescription('Manage monitored tokens.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Get a list of monitored tokens.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a token to monitor.')
                .addStringOption(option =>
                    option.setName('tokenaddress')
                        .setDescription('The contract address of the token to monitor.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('network')
                        .setDescription('The network the token is on.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('addresstomonitor')
                        .setDescription('The address to monitor balance.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('tokenname')
                        .setDescription('The name of the token to monitor.')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a token from monitoring.')
                .addStringOption(option =>
                    option.setName('token')
                        .setDescription('The token to remove.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setalert')
                .setDescription('Set the alert amount. The bot will notify officials if there is less in the wallet.')
                .addStringOption(option =>
                    option.setName('token')
                        .setDescription('The token to set the alert amount for.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('The alert amount.')
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        console.log(`Interaction received from user: ${interaction.user.username}`);
        const commandName = interaction.commandName;
        const options = interaction.options.data.map(option => ({
            name: option.name,
            value: option.value
        }));
        console.log(`Command: ${commandName}`);
        console.log(`Options: ${JSON.stringify(options, null, 2)}`);

        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case 'list':
                const tokenInfoEmbeds = [];
                const tokens = await sql.getTokens();
                if (tokens.length === 0) {
                    return await interaction.reply({ content: 'There are no monitored tokens.', ephemeral: true });
                } else {
                    for (const token of tokens) {
                        const balance = await evm.checkTokenBalance(token.tokenAddress, token.addressToMonitor, token.network, token.tokenname);
                        const tokenInfo = {
                            tokenAddress: token.tokenAddress,
                            network: token.network,
                            addressToMonitor: token.addressToMonitor,
                            tokenname: token.tokenname,
                            balance: balance,
                            alertAmount: token.alertAmount
                        };
                        
                        const embed = createTokenInfoEmbed(tokenInfo);
                        tokenInfoEmbeds.push(embed);
                        // console.log(tokenInfoEmbeds[0].data);
                        // console.log(tokenInfoEmbeds.length);
                    }
                }
                try {
                    if (tokenInfoEmbeds.length > 10) {
                        const chunks = [];
                        for (let i = 0; i < tokenInfoEmbeds.length; i += 10) {
                            chunks.push(tokenInfoEmbeds.slice(i, i + 10));
                        }
                        await interaction.reply({ embeds: chunks[0], ephemeral: true });
                        // Send each chunk of embeds as a separate message
                        chunks.slice(1).forEach(async chunk => {
                            await interaction.followUp({ embeds: chunk, ephemeral: true });
                        });
                    } else if (tokenInfoEmbeds.length <= 10 && tokenInfoEmbeds.length > 0) {
                        // Send all embeds in a single message
                        await interaction.reply({ embeds: tokenInfoEmbeds, ephemeral: true });
                    } else {
                        await interaction.reply({ content: 'An error occurred while fetching token info or no tokens are monitored. Try again or contact Noahbreezy.', ephemeral: true });
                    }
                } catch (error) {
                    console.error('Error fetching token info:', error);
                    try {
                        await interaction.reply({ content: 'Failed to fetch token info. Try again or contact Noahbreezy.', ephemeral: true });
                    } catch (replyError) {
                        console.error('Error sending reply:', replyError);
                    }
                }
                break;
            case 'add':
                const tokenAddress = interaction.options.getString('tokenaddress');
                console.log(tokenAddress);
                const network = interaction.options.getString('network');
                const addressToMonitor = interaction.options.getString('addresstomonitor');
                const tokenname = interaction.options.getString('tokenname');

                try {
                    await sql.insertToken(tokenAddress, network, addressToMonitor, tokenname);
                    await interaction.reply({ content: 'Token added successfully!', ephemeral: true });
                } catch (error) {
                    console.error('Error adding token:', error);
                    await interaction.reply({ content: 'Failed to add token.', ephemeral: true });
                }
                break;
            case 'remove':
                const tokenId = interaction.options.getString('token');
                try {
                    await sql.deleteToken(tokenId);
                    await interaction.reply({ content: 'Token removed successfully!', ephemeral: true });
                } catch (error) {
                    console.error('Error removing token:', error);
                    await interaction.reply({ content: 'Failed to remove token.', ephemeral: true });
                }
                break;
            case 'setalert':
                const token = interaction.options.getString('token');
                const alertAmount = interaction.options.getString('amount');
                try {
                    await sql.setAlertAmount(alertAmount, token);
                    await interaction.reply({ content: 'Alert amount set successfully!', ephemeral: true });
                } catch (error) {
                    console.error('Error setting alert amount:', error);
                    await interaction.reply({ content: 'Failed to set alert amount.', ephemeral: true });
                }
                break;
            default:
                // Handle unknown subcommand
                break;
        }
    },
    async autocomplete(interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'add':
                if (interaction.options.getFocused(true).name === 'network') {
                    await handleNetworkAutocomplete(interaction);
                }
                break;
            case 'remove':
                if (interaction.options.getFocused(true).name === 'token') {
                    await handleTokenAutocomplete(interaction);
                }
                break;
            case 'setalert':
                if (interaction.options.getFocused(true).name === 'token') {
                    await handleTokenAutocomplete(interaction);
                }
            default:
                // Handle unknown subcommand
                break;
        }
    }
};