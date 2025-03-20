const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const axios = require('axios');
const qs = require('qs');
const base64 = require('base64-js');
const { StringDecoder } = require('node:string_decoder');
const UpdateInfo = require('../../../alliancemanager/updateinfo.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify your kingdom account')
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    async execute(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        try {
            // Generate unique verification code
            const code = await this.generateUniqueCode(interaction, sql);
            await this.saveCodeToDatabase(code, userId, guildId, sql);
            const queenInfo = (await sql.getQueenInfo(guildId))[0];
            let queenLocation = await sql.getKingdomLocation(guildId);
            if (queenLocation.length > 0) {
                queenLocation = `located at coordinates ${queenLocation[0].x}:${queenLocation[0].y}`;
            } else {
                queenLocation = '';
            }

            // console.log(queenInfo)

            if (!queenInfo?.name) {
                await interaction.reply({
                    content: 'Queen account not set. Please ask your continent admin to set the queen account using the `/account editrole:QUEEN` command.',
                    ...ephemeral
                });
                return;
            }

            // Get verification instructions
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔹 Kingdom Verification')
                .setDescription(
                    'To verify your kingdom account:\n' +
                    `1. **Verify your wallet below first !!**\n` +
                    `2. Send the following code to the queen account "${queenInfo.name}" ${queenLocation}\n` +
                    `**Code: \`${code}\`**\n\n` +
                    '3. The bot will automatically verify your account once the code is received\n' +
                    '4. The code expires after 10 minutes\n\n' +
                    '🚨 Make sure to send the code from the kingdom account you want to verify!'
                )
                .setFooter({ text: 'Ask for help from your community admin if necessary' });

            // Send verification instructions to user DM
            let userDMChannel;
            try {
                userDMChannel = await interaction.user.createDM();
                await userDMChannel.send({ embeds: [embed] });
                await interaction.reply({
                    content: 'Verification instructions have been sent to your DMs!',
                    flags: 64
                });
            } catch (dmError) {
                await interaction.reply({
                    content: 'Unable to send DM. Please enable DMs from server members and try again.',
                    flags: 64
                });
                return;
            }

            // Log code request in verification channel
            const guildSettings = await sql.getGuildLogChannels(guildId);
            if (guildSettings[0]?.accept_log_channel) {
                const verificationLogChannel = await interaction.guild.channels.fetch(
                    guildSettings[0].accept_log_channel
                );
                await verificationLogChannel.send(
                    `<@${userId}> requested verification code: **${code}**`
                );
            }

            // Prompt user to input their wallet address in DM
            const walletPrompt = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔹 Wallet Verification')
                .setDescription(
                    'Please enter your wallet address to complete the verification process.'
                );

            const walletInput = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('wallet_input')
                    .setLabel('Enter Wallet Address')
                    .setStyle(ButtonStyle.Primary)
            );

            await userDMChannel.send({
                embeds: [walletPrompt],
                components: [walletInput]
            });

            // Create a modal for wallet input
            const walletModal = new ModalBuilder()
                .setCustomId('wallet_modal')
                .setTitle('Enter Wallet Address')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('wallet_address')
                            .setLabel('Wallet Address')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('e.g., 0x1234567890abcdef1234567890abcdef12345678')
                            .setRequired(true)
                            .setMinLength(42) // EVM wallet address length (including '0x')
                            .setMaxLength(42)
                    )
                );

            // Handle button interaction and show modal
            const filter = (i) => i.customId === 'wallet_input' && i.user.id === interaction.user.id;
            const collector = userDMChannel.createMessageComponentCollector({ filter, time: 600000 });

            let userWalletAddress;
            collector.on('collect', async (i) => {
                if (i.customId === 'wallet_input') {
                    // Show the modal when the button is clicked
                    await i.showModal(walletModal);
                }
            });

            // Handle modal submission
            const modalFilter = (i) => i.customId === 'wallet_modal' && i.user.id === interaction.user.id;
            interaction.client.on('interactionCreate', async (i) => {
                if (!modalFilter(i)) return;
                if (!i.isModalSubmit()) return;

                const walletAddress = i.fields.getTextInputValue('wallet_address');
                const isValidEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);

                if (isValidEvmAddress) {
                    userWalletAddress = walletAddress;
                    await i.reply({
                        content: 'Wallet address saved successfully!',
                        flags: 64
                    });
                } else {
                    await i.reply({
                        content: 'Invalid wallet address. Please enter a valid EVM wallet address.',
                        flags: 64
                    });
                }

                // Start checking for verification
                await this.checkVerification(interaction, code, guildId, userWalletAddress, 0, sql, api);
            });

            // Move collector.on('end', ...) outside of modalCollector
            collector.on('end', (collected, reason) => {
                if (reason === 'time' && !userWalletAddress) {
                    userDMChannel.send({
                        content: 'You did not enter your wallet address in time. Please try again.'
                    });
                }
            });

        } catch (error) {
            console.error('Verification error:', error);
            await interaction.followUp({
                content: 'There was an error starting the verification process.',
                flags: 64
            });
        }
    },

    async generateUniqueCode(interaction, sql) {
            const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoiding 0, O, I, L, 1
            const generateCode = () => {
                const length = Math.floor(Math.random() * 5) + 4; // 4 to 8 characters
                let code = '';
                for (let i = 0; i < length; i++) {
                    code += characters.charAt(Math.floor(Math.random() * characters.length));
                }
                return code;
            };

            const isCodeUnique = async (code, sql) => {
                return await sql.checkUniqueVerificationCode(code, interaction.guild.id);
            };

            let code;
            do {
                code = generateCode();
            } while (!await isCodeUnique(code, sql));

            return code;
        },

    async saveCodeToDatabase(code, discordId, guildId, sql) {
            await sql.saveVerificationCode(code, discordId, guildId);
            console.log('Verification code saved:', code);
        },

    async checkVerification(interaction, code, guildId, wallet, attempt, sql, api) {
            const updateInfo = new UpdateInfo(sql, api);
            const userId = interaction.user.id;
            const userName = interaction.user.username;
            if (attempt > 10) {
                try {
                    await sql.markCodeExpired(code, guildId);

                    const guildSettings = await sql.getGuildLogChannels(guildId);
                    if (guildSettings[0]?.accept_log_channel) {
                        const verificationChannel = await interaction.guild.channels.fetch(
                            guildSettings[0].accept_log_channel
                        );
                        await verificationChannel.send(
                            `<@${interaction.user.id}> verification code **${code}** expired`
                        );
                    }

                    await interaction.user.send('Your verification code expired. Please request a new one.');
                    await interaction.followUp({
                        content: 'Your verification code expired. Please request a new one.',
                        flags: 64
                    });
                } catch (error) {
                    console.error('Error handling code expiration:', error);
                }
                return;
            }

            try {
                // Get manager token for API calls
                let queenToken = await sql.getQueenToken(guildId);
                // console.log('Queen token nested:', queenToken);
                queenToken = queenToken[0];
                queenToken = queenToken.token;

                // Prepare the request using api.js
                const data = qs.stringify({
                    'json': '{"category":0}'
                });

                const headers = {
                    'x-access-token': queenToken,
                    'Content-Type': 'application/x-www-form-urlencoded'
                };

                // Make the API request using the api instance
                const response = await api.request(
                    'https://api-lok-live.leagueofkingdoms.com/api/mail/list',
                    data,
                    headers
                );

                const mails = response.data.mails;

                for (const mail of mails) {
                    if (mail.content.toUpperCase().includes(code)) {
                        const kingdomId = mail.from._id;
                        const kingdomName = mail.from.name;
                        const congressTitle = mail.from.congressTitle;
                        const worldId = mail.from.worldId;

                        if(congressTitle === 101 || congressTitle === 102) {
                            await sql.addGuildContinent(guildId, worldId);
                        }
                        
                        // Update kingdom info
                        const kingdomInfo = await updateInfo.updateInfo(queenToken, kingdomId, "", "");

                        // Check if kingdom is already verified
                        const verifiedFlag = await sql.isKingdomVerified(kingdomId, guildId);
                        if (verifiedFlag) {
                            await interaction.user.send(
                                `Your account ${kingdomName} was already verified. If you're trying to verify an alt account, please request another code and send the email using the alt account.`
                            );
                            await interaction.followUp({
                                content: `Your account ${kingdomName} was already verified. If you're trying to verify an alt account, please request another code and send the email using the alt account.`,
                                flags: 64
                            });
                            return;
                        }

                        // Verify kingdom and assign role
                        await sql.addVerified(kingdomId, kingdomName, userId, userName, guildId, wallet);

                        // Assign verification role
                        const guildSettings = await sql.getGuildVerificationRole(guildId);
                        if (guildSettings[0]?.verified_role) {
                            const member = await interaction.guild.members.fetch(interaction.user.id);
                            await member.roles.add(guildSettings[0].verified_role);
                        }

                        // Log successful verification
                        const logChannels = await sql.getGuildLogChannels(guildId);
                        if (logChannels[0]?.accept_log_channel) {
                            const acceptChannel = await interaction.guild.channels.fetch(
                                logChannels[0].accept_log_channel
                            );
                            await acceptChannel.send(
                                `${kingdomName} has been verified and linked to <@${interaction.user.id}>`
                            );
                        }

                        await interaction.user.send(`Your account ${kingdomName} has been verified!`);
                        await interaction.followUp({
                            content: `Your account ${kingdomName} has been verified!`,
                            flags: 64
                        });
                        return;
                    }
                }

                // If code not found, check again after delay
                setTimeout(() => {
                    this.checkVerification(interaction, code, guildId, wallet, attempt + 1, sql, api);
                }, 60 * 1000);

            } catch (error) {
                console.error('Verification check error:', error);
                setTimeout(() => {
                    this.checkVerification(interaction, code, guildId, wallet, attempt + 1, sql, api);
                }, 60 * 1000);
            }
        },
    };