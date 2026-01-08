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
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a discord server.', flags: 64 });
            return;
        }
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        // Using legacy flags:64 instead of ephemeral:true per project convention
        try {
            await interaction.deferReply({ flags: 64 });
        } catch (e) {
            console.error('Defer failed:', e);
        }

        try {
            const code = await this.generateUniqueCode(interaction, sql);
            await this.saveCodeToDatabase(code, userId, guildId, sql);
            const queenInfo = (await sql.getQueenInfo(guildId))[0];

            if (!queenInfo?.name) {
                await interaction.editReply({ content: 'Queen account not set. Please ask your continent admin to set the queen account using the `/account editrole:QUEEN` command.' });
                return;
            }

            let queenLocationData = await sql.getKingdomLocation(queenInfo.kingdomId);
            let queenLocation = '';
            if (Array.isArray(queenLocationData) && queenLocationData.length > 0) {
                queenLocation = `**_located at coordinates ${queenLocationData[0].x}:${queenLocationData[0].y}_**`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔹 Kingdom Verification')
                .setDescription(
                    'To verify your kingdom account:\n' +
                    '1. **Optionally verify your wallet below (it is not recommended skip)**\n' +
                    `2. Send the following code to the queen account in **mail body** "${queenInfo.name}" ${queenLocation}\n` +
                    `**Code (valid for 10 minutes only):**\n\`\`\`${code}\`\`\`\n` +
                    '   - *Desktop*: Copy the code above or from the message below.\n' +
                    '   - *Mobile*: Tap and hold the message below to copy the code.\n\n' +
                    '3. The bot will automatically verify your account once the code is received\n' +
                    '4. The code expires after 10 minutes\n\n' +
                    '🚨 Make sure to send the code from the kingdom account you want to verify!'
                )
                .setFooter({ text: 'Ask for help from your community admin if necessary' });

            let userDMChannel;
            try {
                userDMChannel = await interaction.user.createDM();
                await userDMChannel.send({ embeds: [embed] });
                await userDMChannel.send(`\`\`\`\n${code}\n\`\`\``);
                await interaction.editReply({ content: 'Verification instructions sent to your DMs. Follow the steps there.' });
            } catch (dmErr) {
                await interaction.editReply({ content: 'Unable to send DM. Please enable DMs from server members and try again.' });
                return;
            }

            const logChannelSettings = await sql.getGuildLogChannels(guildId);
            if (logChannelSettings[0]?.accept_log_channel) {
                try {
                    const verificationLogChannel = await interaction.guild.channels.fetch(logChannelSettings[0].accept_log_channel);
                    if (verificationLogChannel) {
                        await verificationLogChannel.send(`<@${userId}> requested verification code: **${code}**`);
                    }
                } catch (logErr) {
                    console.error('Failed to write verification request log:', logErr);
                }
            }

            // Wallet step (optional)
            const walletPrompt = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔹 Wallet Verification (Optional)')
                .setDescription('You can enter your wallet address or skip this step. If skipped, your wallet will be set to "0" in the database.');

            const walletInput = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('wallet_input').setLabel('Enter Wallet Address').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('skip_wallet').setLabel('Skip Wallet').setStyle(ButtonStyle.Secondary)
            );

            await userDMChannel.send({ embeds: [walletPrompt], components: [walletInput] });

            const walletModal = new ModalBuilder()
                .setCustomId('wallet_modal')
                .setTitle('Enter Wallet Address')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('wallet_address')
                            .setLabel('Wallet Address (Optional)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('e.g., 0x1234567890abcdef1234567890abcdef12345678 (or leave empty to skip)')
                            .setRequired(false)
                    )
                );

            const filter = (i) => (i.customId === 'wallet_input' || i.customId === 'skip_wallet') && i.user.id === interaction.user.id;
            const collector = userDMChannel.createMessageComponentCollector({ filter, time: 600000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'wallet_input') {
                    await i.showModal(walletModal);
                } else if (i.customId === 'skip_wallet') {
                    await i.reply({ content: 'Wallet verification skipped. Please send the code in the mail body. Starting verification...' });
                    await this.checkVerification(interaction, code, guildId, '0', 0, this.sql, this.api);
                    collector.stop('wallet_skipped');
                }
            });
        } catch (err) {
            console.error('Verification start error:', err);
            try {
                await interaction.editReply({ content: 'There was an error starting the verification process.' });
            } catch (_) {}
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

                    const linkExistsFlag = await sql.isWorldIdLinked(worldId);
                    if (!linkExistsFlag && (congressTitle === 101 || congressTitle === 102)) {
                        await sql.addGuildContinent(guildId, worldId);
                    }

                    const guildWorldIds = await sql.getGuildWorldIds(guildId);
                    console.log('guildWorldIds:', guildWorldIds, 'Player World ID:', worldId, 'Kingdom ID:', kingdomId, 'Kingdom Name:', kingdomName);

                    const playerInfo = await updateInfo.updateInfo(queenToken, kingdomId, "", "");

                    const playerWorldIdRaw = playerInfo?.continent ?? playerInfo?.worldId ?? worldId;
                    const playerWorldId = playerWorldIdRaw !== null && playerWorldIdRaw !== undefined ? Number(playerWorldIdRaw) : null;
                    if (!Array.isArray(guildWorldIds) || guildWorldIds.length === 0 || !Number.isFinite(playerWorldId) || !guildWorldIds.includes(playerWorldId)) {
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

                    const logChannels = await sql.getGuildLogChannels(guildId);

                    // Get guild verification bonus settings
                    const guildSettings = await sql.getGuildSettings(guildId);
                    if (guildSettings && guildSettings[0]) {
                        const { main_verify_bonus, alt_verify_bonus, bonus_limit } = guildSettings[0];

                        // Get minimum levels for verification bonuses
                        const minLevels = await sql.getMinLevelForVerificationBonus(guildId);
                        const mainMinLevel = minLevels ? minLevels.mainMinLevel : 35;
                        const altMinLevel = minLevels ? minLevels.altMinLevel : 21;

                        // Check if user has already received bonuses using the points_transactions table
                        const hasReceivedMainBonus = await sql.hasReceivedMainVerificationBonus(userId, guildId);
                        const totalBonusCount = await sql.getTotalVerificationBonusCount(userId, guildId);

                        // Determine bonus amount based on verification type and eligibility
                        let bonusAmount = 0;
                        let bonusType = '';

                        // Check for main verification bonus eligibility (only once per user)
                        if (!hasReceivedMainBonus && main_verify_bonus > 0 && kingdomLevel >= mainMinLevel) {
                            // Check if within bonus limit (if limit is set)
                            if (bonus_limit === 0 || totalBonusCount < bonus_limit) {
                                bonusAmount = main_verify_bonus;
                                bonusType = 'main verification';
                            }
                        } 
                        // Check for alt verification bonus eligibility (can be received multiple times up to limit)
                        else if (alt_verify_bonus > 0 && kingdomLevel >= altMinLevel) {
                            // Check if within bonus limit (if limit is set)
                            // For alts, we allow multiple bonuses as long as total count is under limit
                            if (bonus_limit === 0 || totalBonusCount < bonus_limit) {
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
            const ephemeral = !!interaction.guildId;
            if (ephemeral) {
                await interaction.deferReply({ flags: 64 });
            } else {
                await interaction.deferReply();
            }

            const walletInput = interaction.fields.getTextInputValue('wallet_address');
            const walletAddress = walletInput.trim() === '' ? '0' : walletInput;
            const userId = interaction.user.id;
            const latestRequest = await sql.getLatestVerificationRequestForUser(userId);
            const guildId = latestRequest.guild_id;
            const storedCode = latestRequest.code;

            // If wallet address is provided, validate it
            if (walletAddress !== '0') {
                const isValidEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
                if (!isValidEvmAddress) {
                    await interaction.editReply({
                        content: 'Invalid wallet address. Please enter a valid EVM wallet address or leave it empty to skip.',
                    });
                    return;
                }
            }

            await interaction.editReply({
                content: walletAddress === '0' ? 'Wallet verification skipped. Starting kingdom verification process...' : 'Wallet address saved successfully!',
            });

            if (storedCode) {
                await this.checkVerification(interaction, storedCode, guildId, walletAddress, 0, this.sql, this.api);
            } else {
                await interaction.editReply({
                    content: 'No verification code found. Please start the process again.',
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