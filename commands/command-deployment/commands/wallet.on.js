const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

// Helper function to validate wallet address format
function isValidWalletAddress(wallet) {
    // Basic validation for common wallet formats
    // Ethereum address: 42 characters starting with 0x
    const ethRegex = /^0x[a-fA-F0-9]{40}$/;
    // Bitcoin address: 26-35 characters, alphanumeric with some special chars
    const btcRegex = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
    // Bitcoin Bech32 address: starts with bc1
    const btcBech32Regex = /^bc1[a-z0-9]{39,59}$/;
    // Litecoin address: starts with L or M
    const ltcRegex = /^[LM][a-km-zA-HJ-NP-Z1-9]{26,33}$/;
    // Basic validation for most addresses (at least 26 chars, alphanumeric + some special chars)
    const generalRegex = /^[a-zA-Z0-9]{26,}$/;
    
    return ethRegex.test(wallet) || 
           btcRegex.test(wallet) || 
           btcBech32Regex.test(wallet) || 
           ltcRegex.test(wallet) ||
           generalRegex.test(wallet);
}

// Helper function to create an embed for wallet info
function createWalletEmbed(walletInfo, userName) {
    const embed = new EmbedBuilder()
        .setTitle(`Wallet Information for ${userName}`)
        .setColor('#00ff00');

    embed.addFields({ 
        name: 'Current Wallet Address', 
        value: walletInfo.wallet === '0' ? 'No wallet set' : walletInfo.wallet, 
        inline: false 
    });

    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("wallet")
        .setDescription("Manage your wallet address")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("set")
                .setDescription("Set or update your wallet address")
                .addStringOption((option) =>
                    option
                        .setName("address")
                        .setDescription("Your wallet address")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("view")
                .setDescription("View your current wallet address")
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const { options, guildId, user } = interaction;
        const userId = user.id;
        const userName = user.username;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        try {
            await interaction.deferReply(ephemeral);

            // Check if user is verified in this guild
            const verifiedKingdoms = await sql.checkVerifiedKingdoms(userId, guildId);
            if (!verifiedKingdoms || verifiedKingdoms.length === 0) {
                await interaction.editReply({ 
                    content: "You must be verified in this server to manage your wallet address. Please verify your account first.", 
                    ...ephemeral 
                });
                return;
            }

            switch (options.getSubcommand()) {
                case "set":
                    {
                        const newWallet = options.getString("address").trim();
                        
                        // Validate wallet address format
                        if (!isValidWalletAddress(newWallet)) {
                            await interaction.editReply({ 
                                content: "Invalid wallet address format. Please provide a valid wallet address.", 
                                ...ephemeral 
                            });
                            break;
                        }

                        // Check if wallet is already in use by another user
                        const walletInUse = await sql.checkWalletInUse(newWallet, guildId, userId);
                        if (walletInUse && walletInUse.length > 0) {
                            await interaction.editReply({ 
                                content: `This wallet address is already associated with another verified account (${walletInUse[0].kingdomName}). Each wallet can only be linked to one account per server.`, 
                                ...ephemeral 
                            });
                            break;
                        }

                        // Update wallet address
                        await sql.updateUserWallet(userId, guildId, newWallet);
                        
                        await interaction.editReply({ 
                            content: `Your wallet address has been updated to: \`${newWallet}\``, 
                            ...ephemeral 
                        });
                    }
                    break;
                case "view":
                    {
                        const walletInfo = await sql.getUserWallet(userId, guildId);
                        if (!walletInfo || walletInfo.length === 0) {
                            await interaction.editReply({ 
                                content: "No wallet information found. You may not be verified in this server.", 
                                ...ephemeral 
                            });
                            break;
                        }

                        const embed = createWalletEmbed(walletInfo[0], userName);
                        await interaction.editReply({ 
                            embeds: [embed], 
                            ...ephemeral 
                        });
                    }
                    break;
                default:
                    await interaction.editReply({ 
                        content: "Unknown subcommand", 
                        ...ephemeral 
                    });
                    break;
            }
        } catch (error) {
            console.error('Wallet command error:', error);
            await interaction.editReply({ 
                content: "An error occurred while executing the command. Please try again later.", 
                ...ephemeral 
            });
        }
    }
};
