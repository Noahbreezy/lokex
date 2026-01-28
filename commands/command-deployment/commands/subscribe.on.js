const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const ethers = require("ethers");
require('dotenv').config();

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
const USDT_CONTRACT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDT_ABI = [
    "function decimals() view returns (uint8)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, provider);

async function handleContinentAutocomplete(interaction, sql) {
    const focusedValue = interaction.options.getFocused();
    const guildId = interaction.guild.id;
    const continents = await sql.getGuildContinents(guildId);

    // Ensure each alliance object has both name and value properties
    const choices = continents.map(nameObj => ({
        name: nameObj.continent || 'Unknown',
        value: nameObj.continent || 'Unknown'
    }));

    console.log(choices);
    await interaction.respond(choices);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("subscription")
        .setDescription("Manage your server's subscription to our services.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("renew")
                .setDescription("start or renew your subscription")
                .addStringOption(option =>
                    option.setName('continent')
                        .setDescription('Continent number (ex. 1, 15, 26, ...)')
                        .setRequired(true)
                        .setAutocomplete(true))
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("expiration-dates")
                .setDescription("View expiration dates for all continent subscriptions")
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "renew") {
            const sql = module.exports.sql;
            const continent = interaction.options.getString("continent");
            const selected = ["12345"];
            const totalCost = 30;

            try {
                const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
                await sql.storePendingPayment(
                    interaction.user.id,
                    interaction.guild.id,
                    continent,
                    JSON.stringify(selected),
                    totalCost,
                    timestamp
                );

                const paymentInfoEmbed = new EmbedBuilder()
                    .setTitle("Subscription Payment")
                    .setDescription(
                        [
                            `Single subscription price: ${totalCost} USDT (Polygon)`,
                            `Recipient address: ${process.env.PAYMENT_ADDRESS}`,
                            "After sending, press the 'Pay' button below and paste the transaction hash.",
                            `Continent: ${continent}`
                        ].join("\n")
                    )
                    .setColor("Blue");

                const payButton = new ButtonBuilder()
                    .setCustomId(`pay_${interaction.user.id}_${timestamp}`)
                    .setLabel("Pay")
                    .setStyle(ButtonStyle.Primary);

                const actionRow = new ActionRowBuilder().addComponents(payButton);

                await interaction.reply({ embeds: [paymentInfoEmbed], components: [actionRow], flags: 64 });
            } catch (error) {
                console.error("Error storing payment request:", error);
                return interaction.reply({
                    content: "Error storing payment request. Please try again.",
                    flags: 64,
                });
            }
        } else if (subcommand === "expiration-dates") {
            const sql = module.exports.sql;
            try {
                const guildId = interaction.guild.id;
                const subscriptions = await sql.getSubscriptionValidUntil(guildId);

                if (!subscriptions || subscriptions.length === 0) {
                    return interaction.reply({
                        content: "No active subscriptions found for this server.",
                        flags: 64,
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle("Subscription Expiration Dates")
                    .setDescription("Below are the expiration dates for all continent subscriptions linked to this server.")
                    .setColor("Blue");

                subscriptions.forEach(sub => {
                    embed.addFields({
                        name: `Continent ${sub.continent}`,
                        value: `Expires: ${new Date(sub.valid_until).toLocaleString()}`,
                        inline: true
                    });
                });

                await interaction.reply({ embeds: [embed], flags: 64 });
            } catch (error) {
                console.error("Error fetching subscription expiration dates:", error);
                await interaction.reply({
                    content: "Error fetching subscription expiration dates. Please try again.",
                    flags: 64,
                });
            }
        }
    },

    async autocomplete(interaction) {
        const sql = module.exports.sql;
        try {
            switch (interaction.options.getSubcommand()) {
                case "renew":
                    {
                        if (interaction.options.getFocused(true).name === "continent") {
                            await handleContinentAutocomplete(interaction, sql);
                        }
                    }
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.error(error);
        }
    },

    async stringselect(interaction) {
        // Legacy handler kept to avoid component errors; selection UI removed in the new single-subscription flow.
        return interaction.reply({
            content: "Subscription selection is no longer required. Please use /subscription renew.",
            flags: 64,
        });
    },

    async button(interaction) {
        if (interaction.customId.startsWith("pay_")) {
            const [_, userId, timestamp] = interaction.customId.split("_");

            // Verify the button presser is the same as the original user
            if (interaction.user.id !== userId) {
                return interaction.reply({
                    content: "Only the user who initiated the subscription can proceed with payment.",
                    flags: 64,
                });
            }

            const modal = new ModalBuilder()
                .setCustomId("payment_submission")
                .setTitle("Complete Payment in USDT");

            const txHashInput = new TextInputBuilder()
                .setCustomId("tx_hash")
                .setLabel("Transaction Hash")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(txHashInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        }
    },

    async modal(interaction) {
        const sql = module.exports.sql;
        if (interaction.customId === "payment_submission") {
            const txHash = interaction.fields.getTextInputValue("tx_hash");

            try {
                // Get pending payment from database
                const pendingPaymentQuery = await sql.getPendingPayment(interaction.user.id, interaction.guild.id);

                if (!pendingPaymentQuery.length) {
                    return interaction.reply({
                        content: "No pending payment found. Please start over.",
                        flags: 64,
                    });
                }

                const pendingPayment = pendingPaymentQuery[0];
                const totalCost = pendingPayment.total_cost;
                const continent = pendingPayment.continent;

                // Fetch transaction details
                const tx = await provider.getTransaction(txHash);
                if (!tx) {
                    // Delete pending payment
                    await sql.deletePendingPayment(
                        interaction.user.id,
                        interaction.guild.id
                    );
                    return interaction.reply({
                        content: "Transaction not found. Please check the hash and try again.",
                        flags: 64,
                    });
                }

                // Wait for confirmation
                const receipt = await tx.wait();

                // Check transaction timestamp (within 2 hours)
                const block = await provider.getBlock(tx.blockNumber);
                const txTimestamp = new Date(block.timestamp * 1000);
                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

                if (txTimestamp < twoHoursAgo) {
                    return interaction.reply({
                        content: "Transaction is older than 2 hours. Please make a new payment or contact support.",
                        flags: 64,
                    });
                }

                // Verify transaction is to USDT contract
                if (tx.to.toLowerCase() !== USDT_CONTRACT_ADDRESS.toLowerCase()) {
                    // Delete pending payment
                    await sql.deletePendingPayment(
                        interaction.user.id,
                        interaction.guild.id
                    );
                    return interaction.reply({
                        content: "Invalid recipient address. Please send to the correct USDT contract address.",
                        flags: 64,
                    });
                }

                // Decode transfer event to get amount and recipient
                const transferEvent = receipt.logs
                    .map(log => {
                        try {
                            return usdtContract.interface.parseLog(log);
                        } catch (e) {
                            return null;
                        }
                    })
                    .find(log => log && log.name === "Transfer");

                if (!transferEvent) {
                    return interaction.reply({
                        content: "Could not verify USDT transfer.",
                        flags: 64,
                    });
                }

                const amount = ethers.formatUnits(transferEvent.args.value, 6); // USDT has 6 decimals
                const recipient = transferEvent.args.to;

                // Verify recipient address
                if (recipient.toLowerCase() !== process.env.PAYMENT_ADDRESS.toLowerCase()) {
                    return interaction.reply({
                        content: "Payment sent to wrong address.",
                        flags: 64,
                    });
                }

                // Verify amount
                if (parseFloat(amount) < parseFloat(totalCost)) {
                    return interaction.reply({
                        content: `Insufficient payment. Sent ${amount} USDT, required ${totalCost} USDT. Contact support.`,
                        flags: 64,
                    });
                }

                // Verify fraud
                const fraudFlag = await sql.checkTxHashExists(txHash);
                if (fraudFlag) {
                    return interaction.reply({
                        content: "Transaction hash already used. Please contact support.",
                        flags: 64,
                    });
                }

                if (!continent) {
                    // Delete pending payment
                    await sql.deletePendingPayment(
                        interaction.user.id,
                        interaction.guild.id
                    );
                    return interaction.reply({
                        content: "No continent specified. Please start over.",
                        flags: 64,
                    });
                }

                // Payment verified - store subscription (single plan)
                const subscriptionType = "12345";
                await sql.addSubscription(
                    interaction.guild.id,
                    continent,
                    subscriptionType
                );

                // Store transaction hash
                await sql.setGuildContinentTxHash(
                    interaction.guild.id,
                    continent,
                    txHash
                );

                return interaction.reply({
                    content: `Payment verified! Subscription activated for continent ${continent}.`,
                    flags: 64,
                });

            } catch (error) {
                // Delete pending payment
                await sql.deletePendingPayment(
                    interaction.user.id,
                    interaction.guild.id
                );
                console.error("Error verifying payment:", error);
                return interaction.reply({
                    content: "Error verifying payment. Please try again or contact support.",
                    flags: 64,
                });
            }
        }
    }
};