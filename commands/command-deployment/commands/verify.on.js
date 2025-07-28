const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
            const code = await this.generateUniqueCode(interaction, sql);
            await this.saveCodeToDatabase(code, userId, guildId, sql);
            const queenInfo = (await sql.getQueenInfo(guildId))[0];
            // console.log('Queen info:', queenInfo);
            let queenLocation = await sql.getKingdomLocation(queenInfo.kingdomId);
            console.log('Queen location:', queenLocation);
            if (queenLocation.length > 0) {
                queenLocation = `**_located at coordinates ${queenLocation[0].x}:${queenLocation[0].y}_**`;
            } else {
                queenLocation = '';
            }

            if (!queenInfo?.name) {
                await interaction.reply({
                    content: 'Queen account not set. Please ask your continent admin to set the queen account using the `/account editrole:QUEEN` command.',
                    ...ephemeral
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔹 Kingdom Verification')
                .setDescription(
                    'To verify your kingdom account:\n' +
                    `1. **Verify your wallet below first !!**\n` +
                    `2. Send the following code to the queen account in **mail** "${queenInfo.name}" ${queenLocation}\n` +
                    `**Code:**\n\`\`\`${code}\`\`\`\n` +
                    '   - *Desktop*: Copy the code above or from the message below.\n' +
                    '   - *Mobile*: Tap and hold the message below to copy the code.\n\n' +
                    '3. The bot will automatically verify your account once the code is received\n' +
                    '4. The code expires after 10 minutes\n\n' +
                    '🚨 Make sure to send the code from the kingdom account you want to verify!'
                )
                .setFooter({ text: 'Ask for help from your community admin if necessary' });

            let userDMChannel;
            try {
                await interaction.reply({
                    content: 'Verification instructions are being sent to your DMs!',
                    flags: 64
                });
                userDMChannel = await interaction.user.createDM();
                await userDMChannel.send({ embeds: [embed] });
                await userDMChannel.send(`\`\`\`\n${code}\n\`\`\``);
            } catch (dmError) {
                await interaction.followUp({
                    content: 'Unable to send DM. Please enable DMs from server members and try again.',
                    flags: 64
                });
                return;
            }

            const guildSettings = await sql.getGuildLogChannels(guildId);
            if (guildSettings[0]?.accept_log_channel) {
                const verificationLogChannel = await interaction.guild.channels.fetch(guildSettings[0].accept_log_channel);
                await verificationLogChannel.send(`<@${userId}> requested verification code: **${code}**`);
            }

            const walletPrompt = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔹 Wallet Verification')
                .setDescription('Please enter your wallet address to complete the verification process.');

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
                            .setMinLength(42)
                            .setMaxLength(42)
                    )
                );

            const filter = (i) => i.customId === 'wallet_input' && i.user.id === interaction.user.id;
            const collector = userDMChannel.createMessageComponentCollector({ filter, time: 600000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'wallet_input') {
                    await i.showModal(walletModal);
                }
            });

            collector.on('end', (collected, reason) => {
                const hasWalletFlag = sql.checkVerifiedWallet(userId, guildId);
                if (reason === 'time' && !hasWalletFlag) {
                    userDMChannel.send({
                        content: 'You did not enter your wallet address in time. Please try again.',
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
        const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const generateCode = () => {
            const length = Math.floor(Math.random() * 5) + 4;
            let code = '';
            for (let i = 0; i < length; i++) {
                code += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            return code;
        };

        const isCodeUnique = async (code) => {
            return await sql.checkUniqueVerificationCode(code, interaction.guild.id);
        };

        let code;
        do {
            code = generateCode();
        } while (!await isCodeUnique(code));

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
                    const verificationChannel = await interaction.client.channels.fetch(guildSettings[0].accept_log_channel);
                    await verificationChannel.send(`<@${userId}> verification code **${code}** expired`);
                }

                const user = await interaction.client.users.fetch(userId);
                await user.send('Your verification code expired. Please request a new one.');
            } catch (error) {
                console.error('Error handling code expiration:', error);
            }
            return;
        }

        try {
            let queenToken = (await sql.getQueenToken(guildId))[0].token;
            const data = qs.stringify({ 'json': '{"category":0}' });
            const headers = {
                'x-access-token': queenToken,
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const response = await api.request('https://api-lok-live.leagueofkingdoms.com/api/mail/list', data, headers);
            const mails = response.data.mails;

            // console.log('Mails response:', response.data);

            for (const mail of mails) {
                if (mail.content.toUpperCase().includes(code)) {
                    const kingdomId = mail.from._id;
                    const kingdomName = mail.from.name;
                    const kingdomLevel = mail.from.level;
                    const congressTitle = mail.from.congressTitle;
                    const worldId = mail.from.worldId;

                    const linkExistsFlag = await sql.isContinentLinked(worldId);
                    if (!linkExistsFlag && (congressTitle === 101 || congressTitle === 102)) {
                        await sql.addGuildContinent(guildId, worldId);
                    }

                    const continent = (await sql.getGuildContinent(guildId))[0].continent;
                    console.log('continent:', continent, 'Player World ID:', worldId, 'Kingdom ID:', kingdomId, 'Kingdom Name:', kingdomName);
                    console.log(typeof continent, typeof worldId);

                    await updateInfo.updateInfo(queenToken, kingdomId, "", "");

                    if (String(continent) !== String(worldId)) {
                        const user = await interaction.client.users.fetch(userId);
                        await user.send(`Your kingdom is not in the correct continent. Please verify a kingdom that is in the correct continent.`);
                        return;
                    }

                    const verifiedFlag = await sql.isKingdomVerified(kingdomId, guildId);
                    if (verifiedFlag) {
                        const user = await interaction.client.users.fetch(userId);
                        await user.send(`Your account ${kingdomName} was already verified. If you're trying to verify an alt account, please request another code and send the email using the alt account.`);
                        return;
                    }

                    await sql.addVerified(kingdomId, kingdomName, userId, userName, guildId, wallet);

                    // Check if this is the user's first verification (main) or additional (alt)
                    const existingVerifications = await sql.checkVerifiedKingdoms(userId, guildId);
                    const isFirstVerification = !existingVerifications || existingVerifications.length <= 1;
                    
                    const logChannels = await sql.getGuildLogChannels(guildId);

                    // Get guild verification bonus settings
                    const guildSettings = await sql.getGuildSettings(guildId);
                    if (guildSettings && guildSettings[0]) {
                        const { main_verify_bonus, alt_verify_bonus, bonus_limit } = guildSettings[0];

                        // Get minimum levels for verification bonuses
                        const minLevels = await sql.getMinLevelForVerificationBonus(guildId);
                        const mainMinLevel = minLevels ? minLevels.mainMinLevel : 35;
                        const altMinLevel = minLevels ? minLevels.altMinLevel : 21;

                        // Determine bonus amount based on verification type
                        let bonusAmount = 0;
                        let bonusType = '';

                        if (isFirstVerification && main_verify_bonus > 0 && kingdomLevel >= mainMinLevel) {
                            bonusAmount = main_verify_bonus;
                            bonusType = 'main verification';
                        } else if (!isFirstVerification && alt_verify_bonus > 0 && kingdomLevel >= altMinLevel) {
                            // Check if user hasn't exceeded bonus limit
                            // Current verification count includes the one we just added
                            const currentVerificationCount = existingVerifications ? existingVerifications.length : 1;
                            
                            // If bonus_limit is 0, unlimited bonuses allowed
                            // If bonus_limit > 0, check if current count is within limit
                            if (bonus_limit === 0 || currentVerificationCount <= bonus_limit) {
                                bonusAmount = alt_verify_bonus;
                                bonusType = 'alt verification';
                            }
                        }
                        
                        // Award bonus if applicable
                        if (bonusAmount > 0) {
                            await sql.addUserPoints(userId, guildId, bonusAmount, `${bonusType} bonus`);
                            if (logChannels[0]?.shop_log_channel) {
                                try {
                                    const shopChannel = await interaction.client.channels.fetch(logChannels[0].shop_log_channel);
                                    if (shopChannel) {
                                        await shopChannel.send(`<@${userId}> received a ${bonusType} bonus of ${bonusAmount} points!`);
                                    } else {
                                        console.error('Shop log channel not found:', logChannels[0].shop_log_channel);
                                    }
                                } catch (error) {
                                    console.error('Error sending bonus log message:', error);
                                }
                            }
                        }
                    }

                    const roleSettings = await sql.getGuildVerificationRole(guildId);
                    if (roleSettings[0]?.verified_role) {
                        try {
                            const guild = await interaction.client.guilds.fetch(guildId); // Fetch guild explicitly
                            if (guild) {
                                const member = await guild.members.fetch(userId);
                                await member.roles.add(roleSettings[0].verified_role);
                            } else {
                                console.error(`Guild with ID ${guildId} not found.`);
                            }
                        } catch (error) {
                            console.error('Error assigning role:', error);
                        }
                    }

                    if (logChannels[0]?.accept_log_channel) {
                        try {
                            console.log('Attempting to send log message to channel:', logChannels[0].accept_log_channel);
                            const acceptChannel = await interaction.client.channels.fetch(logChannels[0].accept_log_channel);
                            if (acceptChannel) {
                                await acceptChannel.send(`${kingdomName} has been verified and linked to <@${userId}>`);
                                console.log('Log message sent successfully');
                            } else {
                                console.error('Accept log channel not found:', logChannels[0].accept_log_channel);
                            }
                        } catch (channelError) {
                            console.error('Error sending message to accept log channel:', channelError);
                        }
                    } else {
                        console.log('No accept log channel configured for guild:', guildId);
                    }

                    const user = await interaction.client.users.fetch(userId);
                    await user.send(`Your account ${kingdomName} has been verified!`);
                    return;
                }
            }

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

    async handleModalSubmit(interaction, sql) {
        try {
            await interaction.deferReply({ flags: 64 });

            const walletAddress = interaction.fields.getTextInputValue('wallet_address');
            const isValidEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
            const userId = interaction.user.id;
            const latestRequest = await sql.getLatestVerificationRequestForUser(userId);
            const guildId = latestRequest.guild_id;
            const storedCode = latestRequest.code;

            if (isValidEvmAddress) {
                await interaction.editReply({
                    content: 'Wallet address saved successfully!',
                });

                if (storedCode) {
                    await this.checkVerification(interaction, storedCode, guildId, walletAddress, 0, this.sql, this.api);
                } else {
                    await interaction.editReply({
                        content: 'No verification code found. Please start the process again.',
                    });
                }
            } else {
                await interaction.editReply({
                    content: 'Invalid wallet address. Please enter a valid EVM wallet address.',
                });
            }
        } catch (error) {
            console.error('Modal submission error:', error);
            await interaction.editReply({
                content: 'An error occurred while processing your wallet address. Please try again.',
            });
        }
    },
};