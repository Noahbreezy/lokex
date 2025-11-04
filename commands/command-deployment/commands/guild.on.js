const { SlashCommandBuilder, PermissionFlagsBits, Options, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");


module.exports = {
    data: new SlashCommandBuilder()
        .setName("guild")
        .setDescription("Manage guilds settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("verified-role")
                .setDescription("role to be assigned to verified members")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("Role to be assigned to verified members")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("unverify")
                .setDescription("Set whether to unverify members or not")
                .addBooleanOption((option) =>
                    option
                        .setName("unverify")
                        .setDescription("True = unverify members after X days with no verified account. Use /guild unverified-period.")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create-channels")
                .setDescription("Create verification channel and more")
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("accept-log-channel")
                .setDescription("channel to log accepted members and more")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log accepted members and more")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("reject-log-channel")
                .setDescription("channel to log rejected members and more")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log rejected members and more")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("shop-log-channel")
                .setDescription("channel to log shop purchases and transactions")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log shop purchases and transactions")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("blacklist-log-channel")
                .setDescription("channel to log blacklist actions and updates")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel to log blacklist actions and updates")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("announcement-channel")
                .setDescription("channel for bot announcements and notifications")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("Channel for bot announcements and notifications")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("hide-answers")
                .setDescription("Hide the bot's answers to commands")
                .addBooleanOption((option) =>
                    option
                        .setName("hidden")
                        .setDescription("True = hides bot answers")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("show-settings")
                .setDescription("Display all current guild settings")
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("stats")
                .setDescription("Display guild and continent statistics")
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("unverified-period")
                .setDescription("Set the period after which users lose their verified role")
                .addIntegerOption((option) =>
                    option
                        .setName("days")
                        .setDescription("Number of days before unverification")
                        .setRequired(true)
                        .setMinValue(1)
                )
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("currency-emoji")
                .setDescription("Set a custom emoji for shop currency")
                .addStringOption((option) =>
                    option
                        .setName("emoji")
                        .setDescription("Custom emoji to use as currency symbol (use default Discord emoji or custom guild emoji)")
                        .setRequired(true)
                )
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("verification-bonus")
                .setDescription("Set verification bonus amounts and limits")
                .addIntegerOption((option) =>
                    option
                        .setName("main")
                        .setDescription("Bonus amount for main kingdom verification")
                        .setRequired(true)
                        .setMinValue(0)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("alt")
                        .setDescription("Bonus amount for alt kingdom verification")
                        .setRequired(true)
                        .setMinValue(0)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("limit")
                        .setDescription("Maximum number of bonuses per user")
                        .setRequired(true)
                        .setMinValue(0)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("main-min-level")
                        .setDescription("Minimum castle level required for main kingdom bonus")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("alt-min-level")
                        .setDescription("Minimum castle level required for alt kingdom bonus")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("setwallet")
                .setDescription("Set the guild's EVM wallet address")
                .addStringOption((option) =>
                    option
                        .setName("wallet")
                        .setDescription("EVM wallet address (42 characters starting with 0x)")
                        .setRequired(true)
                        .setMinLength(42)
                        .setMaxLength(42)
                )
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("point-price")
                .setDescription("Set the price per point in decimal format")
                .addNumberOption((option) =>
                    option
                        .setName("price")
                        .setDescription("DST price per point (decimal value, e.g., 0.01)")
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(99999999.99)
                )
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("booster-point")
                .setDescription("Set the shop points awarded per booster completion")
                .addIntegerOption((option) =>
                    option
                        .setName("points")
                        .setDescription("Shop points awarded per booster completion")
                        .setRequired(true)
                        .setMinValue(0)
                )
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("land-point")
                .setDescription("Set the shop points per land development point in decimal format")
                .addNumberOption((option) =>
                    option
                        .setName("points")
                        .setDescription("Shop points per land development point (decimal value, e.g., 0.01)")
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(99999999.99)
                )
        ).addSubcommand((subcommand) =>
            subcommand
                .setName("rally-point")
                .setDescription("Set the shop points per rally point in decimal format")
                .addNumberOption((option) =>
                    option
                        .setName("start")
                        .setDescription("Shop points per rally start (decimal value, e.g., 0.01)")
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(99999999.99)
                )
                .addNumberOption((option) =>
                    option
                        .setName("join")
                        .setDescription("Shop points per rally join (decimal value, e.g., 0.01)")
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(99999999.99)
                )
        ),
    async execute(interaction) {
        const sql = module.exports.sql;
        const { commandName, options, guildId, user } = interaction;
        const guild = interaction.guild;
        const guildName = interaction.guild.name;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        try {
            const guildExistsFlag = await sql.guildExists(guildId);
            if (!guildExistsFlag) {
                await sql.addGuild(guildId, guildName);
            }
            switch (options.getSubcommand()) {
                case "verified-role":
                    {
                        const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "2");
                        if (!subscriptionFlagInfo) {
                            await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscribe` to get a new subscription.", flags: 64 });
                            return;
                        }
                        const role = options.getRole("role");
                        const roleId = role.id;
                        const roleName = role.name;
                        await sql.setGuildVerificationRole(roleId, guildId);
                        await interaction.reply({ content: `Role ${roleName} has been set as the verified role.`, ...ephemeral });
                        break;
                    }
                case "create-channels":
                    {
                        await interaction.deferReply({ ...ephemeral });
                        await createGuildChannels(interaction, guild, guildName, guildId, ephemeral, sql);
                        break;
                    }
                case "accept-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildAcceptLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the accept log channel.`, ...ephemeral });
                        break;
                    }
                case "reject-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildRejectLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the reject log channel.`, ...ephemeral });
                        break;
                    }
                case "shop-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildShopLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the shop log channel.`, ...ephemeral });
                        break;
                    }
                case "blacklist-log-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildBlacklistLogChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the blacklist log channel.`, ...ephemeral });
                        break;
                    }
                case "announcement-channel":
                    {
                        const channel = options.getChannel("channel");
                        const channelId = channel.id;
                        const channelName = channel.name;
                        await sql.setGuildAnnouncementChannel(channelId, guildId);
                        await interaction.reply({ content: `Channel ${channelName} has been set as the announcement channel.`, ...ephemeral });
                        break;
                    }
                case "hide-answers":
                    {
                        const hidden = options.getBoolean("hidden");
                        await sql.setEphemeral(hidden, guildId);
                        if (hidden) {
                            await interaction.reply({ content: `Bot answers are now hidden.`, flags: 64 });
                        }
                        else {
                            await interaction.reply({ content: `Bot answers are now visible.` });
                        }
                        break;
                    }
                case "unverify":
                    {
                        const unverifyFlag = options.getBoolean("unverify");
                        await sql.setUnverifyFlag(unverifyFlag, guildId);
                        if (unverifyFlag) {
                            await interaction.reply({ content: `Players will now get their verification role removed if they do not have a verified account on your continent.`, ...ephemeral });
                        }
                        else {
                            await interaction.reply({ content: `No roles will be removed regardless of affiliation or location.`, ...ephemeral });
                        }
                        break;
                    }
                case "unverified-period":
                    {
                        const period = options.getInteger("days");
                        await sql.setUnverifiedPeriod(period, guildId);
                        if (period === 0) {
                            await interaction.reply({ content: `Unverification period has been disabled.`, ...ephemeral });
                        } else {
                            await interaction.reply({ content: `Unverification period set to ${period} day${period === 1 ? '' : 's'}.`, ...ephemeral });
                        }
                        break;
                    }
                case "currency-emoji":
                    {
                        const emoji = options.getString("emoji");
                        
                        // Validate emoji format (either Unicode emoji or Discord custom emoji format)
                        const emojiRegex = /^(?:[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]|<a?:\w+:\d+>)$/u;
                        
                        if (!emojiRegex.test(emoji)) {
                            await interaction.reply({ content: "❌ Invalid emoji format. Please use a standard emoji or a Discord custom emoji format like <:name:id>", flags: 64 });
                            return;
                        }
                        
                        await sql.setGuildCurrencyEmoji(emoji, guildId);
                        
                        // Import and use the refresh function from shop.on.js
                        try {
                            const shopModule = require('./shop.on.js');
                            await shopModule.refreshShopChannel(guildId, sql, guild);
                        } catch (error) {
                            console.log('Could not refresh shop channel automatically:', error);
                        }
                        
                        await interaction.reply({ content: `✅ Currency emoji has been set to ${emoji}. Shop channel has been refreshed with the new emoji.`, ...ephemeral });
                        break;
                    }
                case "verification-bonus":
                    {
                        const mainMinLevel = options.getInteger("main-min-level");
                        const altMinLevel = options.getInteger("alt-min-level");
                        const mainBonus = options.getInteger("main");
                        const altBonus = options.getInteger("alt");
                        const bonusLimit = options.getInteger("limit");
                        
                        await sql.setVerificationBonuses(guildId, mainBonus, altBonus, bonusLimit, mainMinLevel, altMinLevel);
                        
                        let responseContent = `✅ Verification bonuses have been set:\n` +
                                            `• Main kingdom bonus: ${mainBonus.toLocaleString()}\n` +
                                            `• Alt kingdom bonus: ${altBonus.toLocaleString()}\n` +
                                            `• Bonus limit per user: ${bonusLimit}`;
                        
                        if (mainMinLevel !== null) {
                            responseContent += `\n• Main kingdom minimum level: ${mainMinLevel}`;
                        }
                        
                        if (altMinLevel !== null) {
                            responseContent += `\n• Alt kingdom minimum level: ${altMinLevel}`;
                        }
                        
                        await interaction.reply({ 
                            content: responseContent, 
                            ...ephemeral 
                        });
                        break;
                    }
                case "setwallet":
                    {
                        const wallet = options.getString("wallet");
                        
                        // Validate EVM wallet address format
                        const isValidEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(wallet);
                        
                        if (!isValidEvmAddress) {
                            await interaction.reply({ 
                                content: "❌ Invalid wallet address format. Please provide a valid EVM wallet address (42 characters starting with 0x).", 
                                flags: 64 
                            });
                            return;
                        }
                        
                        await sql.setGuildWallet(wallet, guildId);
                        
                        await interaction.reply({ 
                            content: `✅ Guild wallet address has been set to: \`${wallet}\``, 
                            ...ephemeral 
                        });
                        break;
                    }
                case "point-price":
                    {
                        const price = options.getNumber("price");
                        
                        // Validate the decimal places (max 2 decimal places for currency-like values)
                        const decimalPlaces = (price.toString().split('.')[1] || '').length;
                        if (decimalPlaces > 2) {
                            await interaction.reply({ 
                                content: "❌ Price can have a maximum of 2 decimal places.", 
                                flags: 64 
                            });
                            return;
                        }
                        
                        await sql.setGuildPointPrice(price, guildId);
                        
                        await interaction.reply({ 
                            content: `✅ Point price has been set to: **${price.toFixed(2)} DST**`, 
                            ...ephemeral 
                        });
                        break;
                    }
                case "booster-point":
                    {
                        const points = options.getInteger("points");

                        await sql.setGuildBoosterPoint(points, guildId);

                        await interaction.reply({
                            content: `✅ Booster point reward set to: **${points.toLocaleString()} shop points per booster per day**`,
                            ...ephemeral
                        });
                        break;
                    }
                case "land-price":
                    {
                        const price = options.getNumber("price");
                        
                        // Validate the decimal places (max 2 decimal places for currency-like values)
                        const decimalPlaces = (price.toString().split('.')[1] || '').length;
                        if (decimalPlaces > 2) {
                            await interaction.reply({ 
                                content: "❌ Price can have a maximum of 2 decimal places.", 
                                flags: 64 
                            });
                            return;
                        }
                        
                        await sql.setGuildLandPrice(price, guildId);
                        
                        await interaction.reply({ 
                            content: `✅ Land price has been set to: **${price.toFixed(2)} DST**`, 
                            ...ephemeral 
                        });
                        break;
                    }
                case "land-point":
                    {
                        const points = options.getNumber("points");
                        
                        // Validate the decimal places (max 2 decimal places for currency-like values)
                        const decimalPlaces = (points.toString().split('.')[1] || '').length;
                        if (decimalPlaces > 2) {
                            await interaction.reply({ 
                                content: "❌ Points can have a maximum of 2 decimal places.", 
                                flags: 64 
                            });
                            return;
                        }
                        
                        await sql.setGuildLandPoint(points, guildId);
                        
                        await interaction.reply({ 
                            content: `✅ Land points have been set to: **${points.toFixed(2)} shop points per land development point**`, 
                            ...ephemeral 
                        });
                        break;
                    }
                case "rally-point":
                    {
                        const startPoints = options.getNumber("start");
                        const joinPoints = options.getNumber("join");

                        if (startPoints === null && joinPoints === null) {
                            await interaction.reply({
                                content: "❌ Provide at least one value for rally start or rally join points.",
                                flags: 64
                            });
                            return;
                        }

                        const hasTooManyDecimals = (value) => {
                            const decimals = (value.toString().split('.')[1] || '').length;
                            return decimals > 2;
                        };

                        const updates = [];

                        if (startPoints !== null) {
                            if (hasTooManyDecimals(startPoints)) {
                                await interaction.reply({
                                    content: "❌ Rally start points can have a maximum of 2 decimal places.",
                                    flags: 64
                                });
                                return;
                            }

                            await sql.setGuildRallyPoint(startPoints, guildId);
                            updates.push(`• Rally start points: **${startPoints.toFixed(2)} shop points**`);
                        }

                        if (joinPoints !== null) {
                            if (hasTooManyDecimals(joinPoints)) {
                                await interaction.reply({
                                    content: "❌ Rally join points can have a maximum of 2 decimal places.",
                                    flags: 64
                                });
                                return;
                            }

                            await sql.setGuildRallyJoinPoint(joinPoints, guildId);
                            updates.push(`• Rally join points: **${joinPoints.toFixed(2)} shop points**`);
                        }

                        await interaction.reply({
                            content: `✅ Rally settings updated:\n${updates.join('\n')}`,
                            ...ephemeral
                        });
                        break;
                    }
                case "stats":
                    {
                        await interaction.deferReply({ ...ephemeral });

                        const [
                            continentRows,
                            activeKingdomRows,
                            activeDiscordRows,
                            scannerLevelSettings,
                            recentKingdomAdds30,
                            recentDiscordAdds30,
                            availableCmineLevels24,
                            availableDsaLevels24,
                            economySummary,
                            pointsDistributed7d,
                            pointsDistributed30d,
                            landPointsDistributed7d,
                            landPointsDistributed30d,
                            rallyPointsDistributed7d,
                            rallyPointsDistributed30d,
                            paymentPointsDistributed7d,
                            paymentPointsDistributed30d,
                            populationStats,
                            currencyEmojiRaw
                        ] = await Promise.all([
                            sql.getGuildContinent(guildId),
                            sql.getActiveVerifiedKingdoms(guildId),
                            sql.getActiveVerifiedDiscordIds(guildId),
                            sql.getCmineAndDsaLevels(guildId),
                            sql.getVerifiedKingdomsAddedWithin(guildId, 30),
                            sql.getVerifiedDiscordsAddedWithin(guildId, 30),
                            sql.getAvailableCmineCountsByLevel(guildId, 24),
                            sql.getAvailableDsaCountsByLevel(guildId, 24),
                            sql.getGuildPointsEconomy(guildId),
                            sql.getPointsDistributedWithin(guildId, 7),
                            sql.getPointsDistributedWithin(guildId, 30),
                            sql.getLandPointsDistributedWithin(guildId, 7),
                            sql.getLandPointsDistributedWithin(guildId, 30),
                            sql.getRallyPointsDistributedWithin(guildId, 7),
                            sql.getRallyPointsDistributedWithin(guildId, 30),
                            sql.getPaymentPointsDistributedWithin(guildId, 7),
                            sql.getPaymentPointsDistributedWithin(guildId, 30),
                            sql.getVerifiedLevelStats(guildId),
                            sql.getGuildCurrencyEmoji(guildId)
                        ]);

                        const uniqueContinentList = Array.isArray(continentRows)
                            ? [...new Set(continentRows.map(row => row?.continent).filter(Boolean))]
                            : [];

                        const kingdomIds = activeKingdomRows
                            .map(row => row?.kingdomId)
                            .filter(Boolean);

                        let recentlyActiveRows = [];
                        let recentlyActiveRows30 = [];
                        try {
                            [recentlyActiveRows, recentlyActiveRows30] = await Promise.all([
                                sql.getRecentlyActiveKingdoms(kingdomIds, guildId, 7),
                                sql.getRecentlyActiveKingdoms(kingdomIds, guildId, 30)
                            ]);
                        } catch (recentError) {
                            console.error("Failed to fetch recently active kingdoms", recentError);
                        }

                        const formatCount = (value) => Number(value || 0).toLocaleString();
                        const formatDecimal = (value) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        const currencyEmoji = currencyEmojiRaw || "🪙";
                        const formatPoints = (value) => `${formatCount(value)} ${currencyEmoji}`.trim();
                        const formatPointsDecimal = (value) => `${formatDecimal(value)} ${currencyEmoji}`.trim();
                        const continentValueLines = [
                            `Continents: ${uniqueContinentList.length ? uniqueContinentList.join(", ") : "None linked"}`,
                            `Verified kingdoms: ${formatCount(activeKingdomRows.length)}`,
                            `Verified Discord IDs: ${formatCount(activeDiscordRows.length)}`,
                            `Active kingdoms last 7d: ${formatCount(recentlyActiveRows.length)}`
                        ];

                        const growthValueLines = [
                            `Verified kingdoms 30d: +${formatCount(recentKingdomAdds30)}`,
                            `Verified Discord IDs 30d: +${formatCount(recentDiscordAdds30)}`,
                            `Active kingdoms last 30d: ${formatCount(recentlyActiveRows30.length)}`
                        ];

                        const totalCmineAvailable24 = Array.isArray(availableCmineLevels24)
                            ? availableCmineLevels24.reduce((sum, entry) => sum + (Number(entry?.count) || 0), 0)
                            : 0;

                        const cmineLevelsText = Array.isArray(availableCmineLevels24) && availableCmineLevels24.length > 0
                            ? availableCmineLevels24
                                .slice()
                                .sort((a, b) => {
                                    const levelA = Number(a?.level) || 0;
                                    const levelB = Number(b?.level) || 0;
                                    return levelA - levelB;
                                })
                                .map((entry) => {
                                    const level = Number(entry?.level) || 0;
                                    const label = level > 0 ? `L${level}` : "L?";
                                    return `${label}: ${formatCount(entry?.count || 0)}`;
                                })
                                .join("\n")
                            : "None";

                        const cmineFieldValue = cmineLevelsText === "None"
                            ? "Mines: 0"
                            : `Mines: ${formatCount(totalCmineAvailable24)}\n${cmineLevelsText}`;

                        const totalDsaAvailable24 = Array.isArray(availableDsaLevels24)
                            ? availableDsaLevels24.reduce((sum, entry) => sum + (Number(entry?.count) || 0), 0)
                            : 0;

                        const dsaLevelsText = Array.isArray(availableDsaLevels24) && availableDsaLevels24.length > 0
                            ? availableDsaLevels24
                                .slice()
                                .sort((a, b) => {
                                    const levelA = Number(a?.level) || 0;
                                    const levelB = Number(b?.level) || 0;
                                    return levelA - levelB;
                                })
                                .map((entry) => {
                                    const level = Number(entry?.level) || 0;
                                    const label = level > 0 ? `L${level}` : "L?";
                                    return `${label}: ${formatCount(entry?.count || 0)}`;
                                })
                                .join("\n")
                            : "None";

                        const dsaFieldValue = dsaLevelsText === "None"
                            ? "Mines: 0"
                            : `Mines: ${formatCount(totalDsaAvailable24)}\n${dsaLevelsText}`;

                        const totalEconomyPoints = Number(economySummary?.totalPoints || 0);
                        const economyOwnerCount = Number(economySummary?.ownerCount || 0);
                        const averageEconomyPoints = economyOwnerCount > 0
                            ? totalEconomyPoints / economyOwnerCount
                            : 0;

                        const level35Count = Number(populationStats?.level35 || 0);
                        const level33Count = Number(populationStats?.level33 || 0);
                        const level30OrBelowCount = Number(populationStats?.level30OrBelow || 0);
                        const averageLevel = populationStats?.averageLevel ? Number(populationStats.averageLevel) : 0;

                        const economyValueLines = [
                            `Total points: ${formatPoints(totalEconomyPoints)}`,
                            `Average per owner: ${economyOwnerCount > 0 ? formatPointsDecimal(averageEconomyPoints) : `0.00 ${currencyEmoji}`.trim()}`,
                            `Distributed last 7d: ${formatPoints(pointsDistributed7d)}`,
                            `Distributed last 30d: ${formatPoints(pointsDistributed30d)}`,
                            `Land program (7d/30d): ${formatPoints(landPointsDistributed7d)} / ${formatPoints(landPointsDistributed30d)}`,
                            `Rally points (7d/30d): ${formatPoints(rallyPointsDistributed7d)} / ${formatPoints(rallyPointsDistributed30d)}`,
                            `Payment points (7d/30d): ${formatPoints(paymentPointsDistributed7d)} / ${formatPoints(paymentPointsDistributed30d)}`
                        ];

                        const populationValueLines = [
                            `Level 35: ${formatCount(level35Count)}`,
                            `Level 33: ${formatCount(level33Count)}`,
                            `Level 30 or below: ${formatCount(level30OrBelowCount)}`,
                            `Average level: ${formatDecimal(averageLevel || 0)}`
                        ];

                        const mineAvailabilityFields = {
                            cmine: {
                                name: "__Available C-Mines (24h)__",
                                value: cmineFieldValue,
                                inline: true
                            },
                            dsa: {
                                name: "__Available DSA Mines (24h)__",
                                value: dsaFieldValue,
                                inline: true
                            }
                        };

                        let whitelistDsaValue = "No linked continents";
                        let whitelistCmineValue = "No linked continents";

                        if (uniqueContinentList.length > 0) {
                            const whitelistResults = await Promise.all(
                                uniqueContinentList.map(async (continent) => {
                                    try {
                                        return await sql.getWhitelist(guildId, continent);
                                    } catch (whitelistError) {
                                        console.error(`Failed to fetch whitelist for continent ${continent}`, whitelistError);
                                        return [];
                                    }
                                })
                            );

                            const whitelistEntries = whitelistResults.flat();
                            if (whitelistEntries.length === 0) {
                                whitelistDsaValue = "No active whitelists";
                                whitelistCmineValue = "No active whitelists";
                            } else {
                                const dsaCounts = {};
                                const cmineCounts = {};

                                for (const entry of whitelistEntries) {
                                    const dsaLevel = Number(entry?.dsa || 0);
                                    const cmineLevel = Number(entry?.cmine || 0);

                                    if (dsaLevel > 0) {
                                        dsaCounts[dsaLevel] = (dsaCounts[dsaLevel] || 0) + 1;
                                    }

                                    if (cmineLevel > 0) {
                                        cmineCounts[cmineLevel] = (cmineCounts[cmineLevel] || 0) + 1;
                                    }
                                }

                                const minLevels = {
                                    dsa: Number(scannerLevelSettings?.dsa_lvl) || 0,
                                    cmine: Number(scannerLevelSettings?.cmine_lvl) || 0
                                };

                                const formatLevelCounts = (counts, minimumAllowed) => {
                                    const levels = Object.keys(counts)
                                        .map((level) => Number(level))
                                        .filter((level) => level > 0 && (minimumAllowed ? level > minimumAllowed : true))
                                        .sort((a, b) => a - b);

                                    if (levels.length === 0) {
                                        return "None";
                                    }

                                    return levels
                                        .map((level) => `L${level}: ${formatCount(counts[level])}`)
                                        .join("\n");
                                };

                                const sumCounts = (counts, minimumAllowed) =>
                                    Object.entries(counts)
                                        .reduce((sum, [level, value]) => {
                                            const numericLevel = Number(level);
                                            if (numericLevel > 0 && (!minimumAllowed || numericLevel >= minimumAllowed)) {
                                                return sum + value;
                                            }
                                            return sum;
                                        }, 0);

                                const dsaLevelsText = formatLevelCounts(dsaCounts, minLevels.dsa);
                                const cmineLevelsText = formatLevelCounts(cmineCounts, minLevels.cmine);

                                const dsaKingdomCount = formatCount(sumCounts(dsaCounts, minLevels.dsa));
                                const cmineKingdomCount = formatCount(sumCounts(cmineCounts, minLevels.cmine));

                                const buildValue = (kingdomCount, levelsText) => {
                                    if (levelsText === "None") {
                                        return `Kingdoms: ${kingdomCount}\nLevels: None`;
                                    }
                                    return `Kingdoms: ${kingdomCount}\n${levelsText}`;
                                };

                                whitelistDsaValue = buildValue(dsaKingdomCount, dsaLevelsText);
                                whitelistCmineValue = buildValue(cmineKingdomCount, cmineLevelsText);
                            }
                        }

                        const embed = new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle(`${guildName}'s stats`)
                            .addFields(
                                {
                                    name: "__Continent Info__",
                                    value: continentValueLines.join("\n"),
                                    inline: true
                                },
                                {
                                    name: "__Continent Growth__",
                                    value: growthValueLines.join("\n"),
                                    inline: true
                                },
                                // Spacer field to create separation
                                {
                                    name: "\u200B",
                                    value: "\u200B",
                                    inline: false
                                },
                                {
                                    name: "__Population Stats__",
                                    value: populationValueLines.join("\n"),
                                    inline: true
                                },
                                {
                                    name: "\u200B",
                                    value: "\u200B",
                                    inline: false
                                },
                                {
                                    name: "__Whitelist Stats (DSA)__",
                                    value: whitelistDsaValue,
                                    inline: true
                                },
                                {
                                    name: "__Whitelist Stats (C-Mine)__",
                                    value: whitelistCmineValue,
                                    inline: true
                                },
                                {
                                    name: "\u200B",
                                    value: "\u200B",
                                    inline: false
                                },
                                mineAvailabilityFields.dsa,
                                mineAvailabilityFields.cmine,
                                {
                                    name: "\u200B",
                                    value: "\u200B",
                                    inline: false
                                },
                                {
                                    name: "__Economy Stats__",
                                    value: economyValueLines.join("\n"),
                                    inline: true
                                },
                            )
                            .setFooter({ text: "Activity windows: 7d (recent), 30d (growth), 24h (mines)" })
                            .setTimestamp(new Date());

                        await interaction.editReply({ embeds: [embed] });
                        break;
                    }
                case "show-settings":
                    {
                        // Define channel-related fields
                        const channelFields = [
                            'accept_log_channel',
                            'reject_log_channel',
                            'shop_log_channel',
                            'blacklist_log_channel',
                            'announcement_channel',
                            'verification_channel',
                            'titles_channel',
                            'admin_titles_channel',
                            'pledgers_channel',
                            'buff_channel',
                            'drago_lookup_channel',
                            'shop_channel',
                            'ranking_channel',
                            'cmine_whitelist_channel',
                            'dsa_whitelist_channel'
                        ];

                        // Define emoji fields
                        const emojiFields = ['emoji_id'];

                        // Define wallet fields
                        const walletFields = ['guild_wallet'];

                        // Define role fields
                        const roleFields = ['verified_role'];

                        // Define numeric fields that should be formatted with commas
                        const numericFields = ['main_verify_bonus', 'alt_verify_bonus'];

                        // Define decimal fields that should be formatted as currency/price
                        const decimalFields = ['point_price', 'land_point', 'rally_point', 'rally_join_point', 'boost_point'];

                        // Define boolean fields that should be formatted as YES/NO
                        const booleanFields = ['unverify', 'ephemeral'];

                        const settings = await sql.getGuildSettings(guildId);
                        if (!settings || !settings[0]) {
                            await interaction.reply({ content: "No settings found for this guild.", ...ephemeral });
                            return;
                        }

                        // Filter out guild_id and id, and prepare the settings entries
                        const settingsEntries = Object.entries(settings[0])
                            .filter(([key]) => key !== 'guild_id' && key !== 'id')
                            .map(([key, value]) => {
                                const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                let displayValue;
                                
                                if (channelFields.includes(key)) {
                                    // Handle channel fields by converting to a channel mention
                                    displayValue = (value && value !== '0') ? `<#${value}>` : 'Not set';
                                } else if (emojiFields.includes(key)) {
                                    // Handle emoji fields by displaying the emoji
                                    displayValue = value || '🪙 (default)';
                                } else if (walletFields.includes(key)) {
                                    // Handle wallet fields with code formatting
                                    displayValue = value ? `\`${value}\`` : 'Not set';
                                } else if (roleFields.includes(key)) {
                                    // Handle role fields by converting to role mention
                                    displayValue = (value && value !== '0') ? `<@&${value}>` : 'Not set';
                                } else if (numericFields.includes(key)) {
                                    // Handle numeric fields with comma formatting
                                    displayValue = value ? Number(value).toLocaleString() : '0';
                                } else if (decimalFields.includes(key)) {
                                    // Handle decimal fields with fixed decimal places
                                    displayValue = value ? Number(value).toFixed(2) : '0.00';
                                } else if (booleanFields.includes(key)) {
                                    // Handle boolean fields by converting 0/1 to NO/YES
                                    displayValue = (value === 1 || value === '1' || value === true) ? 'YES' : 'NO';
                                } else {
                                    // Handle other fields as before
                                    displayValue = value !== null && value !== undefined ? String(value) : 'Not set';
                                }
                                return { name: displayKey, value: displayValue, inline: true };
                            });

                        if (settingsEntries.length === 0) {
                            await interaction.reply({ content: "No settings to display for this guild.", ...ephemeral });
                            return;
                        }

                        // Split settings into chunks of 25 fields (Discord limit)
                        const chunkSize = 25;
                        const embeds = [];
                        for (let i = 0; i < settingsEntries.length; i += chunkSize) {
                            const chunk = settingsEntries.slice(i, i + chunkSize);
                            const embed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle(`${guildName} Guild Settings`)
                                .setDescription(`Current settings for this guild (Part ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(settingsEntries.length / chunkSize)}):`)
                                .addFields(chunk);
                            embeds.push(embed);
                        }

                        // Send all embeds
                        await interaction.reply({ embeds: [embeds[0]], ...ephemeral });
                        for (let i = 1; i < embeds.length; i++) {
                            await interaction.followUp({ embeds: [embeds[i]], ...ephemeral });
                        }
                        break;
                    }
                default:
                    await interaction.editReply({ content: "Unknown subcommand", ...ephemeral });
                    break;
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "There was an error while changing guild settings! If this is the first time using the /guild command it's normal. It should work if you try again. If it doesn't work several times, please contact support.", flags: 64 });
        }
    },
};

async function createGuildChannels(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        const existingChannels = await guild.channels.fetch();
        const existingChannelIds = existingChannels.map(channel => channel.id);
        const managedChannelsDB = (await sql.getManagedChannels(guildId))[0] || {};

        // Only create channels that are not already in the database and Discord
        if (!managedChannelsDB.verification_channel || !existingChannelIds.includes(managedChannelsDB.verification_channel)) {
            await createVerificationChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.titles_channel || !existingChannelIds.includes(managedChannelsDB.titles_channel)) {
            await createTitlesChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.admin_titles_channel || !existingChannelIds.includes(managedChannelsDB.admin_titles_channel)) {
            await createAdminTitlesChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.pledgers_channel || !existingChannelIds.includes(managedChannelsDB.pledgers_channel)) {
            await createPledgersChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.buff_channel || !existingChannelIds.includes(managedChannelsDB.buff_channel)) {
            await createBuffChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.drago_lookup_channel || !existingChannelIds.includes(managedChannelsDB.drago_lookup_channel)) {
            await createDragoLookupChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }
        if (!managedChannelsDB.shop_channel || !existingChannelIds.includes(managedChannelsDB.shop_channel)) {
            await createShopChannel(interaction, guild, guildName, guildId, ephemeral, sql);
        }

        await interaction.followUp({ content: `✅ Channels created or verified for ${guildName}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the channels.", flags: 64 });
    }
}

async function createVerificationChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let verificationChannel = await guild.channels.create({
            name: "verification",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        await sql.setGuildVerificationChannel(verificationChannel.id, guildId);

        // Create embed message
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🔹 Automated Verification of ${guildName}`)
            .setDescription(
                "🇬🇧 **Push 'Verify' to receive instructions in your private messages!**\n" +
                "Please check messages from Lokex for a step-by-step guide."
            )
            .addFields(
                { name: "🇫🇷 French", value: "**Appuyez sur 'Verify' pour recevoir des instructions dans vos messages privés !**\nVeuillez vérifier les messages de Lokex pour un guide étape par étape." },
                { name: "🇪🇸 Spanish", value: "**Presiona 'Verify' para recibir instrucciones en tus mensajes privados!**\nPor favor, revisa los mensajes de Lokex para obtener una guía paso a paso." },
                { name: "🇩🇪 German", value: "**Drücken Sie 'Verify', um Anweisungen in Ihren privaten Nachrichten zu erhalten!**\nBitte überprüfen Sie die Nachrichten von Lokex für eine Schritt-für-Schritt-Anleitung." },
                { name: "🇵🇹 Portuguese", value: "**Pressione 'Verify' para receber instruções em suas mensagens privadas!**\nPor favor, verifique as mensagens de Lokex para um guia passo a passo." },
                { name: "🇷🇺 Russian", value: "**Нажмите 'Verify', чтобы получить инструкции в личных сообщениях!**\nПожалуйста, проверьте сообщения от Lokex для пошагового руководства." },
                { name: "🇮🇷 Persian", value: "**دکمه 'Verify' را فشار دهید تا دستورالعمل‌ها را در پیام‌های خصوصی خود دریافت کنید!**\nلطفاً پیام‌های Lokex را برای راهنمای گام به گام بررسی کنید." },
                { name: "🇨🇳 Chinese", value: "**点击 'Verify' 按钮在您的私信中获取指示！**\n请检查 Lokex 发送的消息以获取分步指南。" }
            )
            .setFooter({ text: "Ask for help in: #open-chat" });


        // Create the "Verify" button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("verify")
                .setLabel("Verify")
                .setStyle(ButtonStyle.Primary)
        );

        // Send message to the new channel
        let message = await verificationChannel.send({ embeds: [embed], components: [row] });

        // Respond to the interaction
        await interaction.followUp({ content: `✅ Verification channel created: ${verificationChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the verification channel.", flags: 64 });
    }
}

async function createTitlesChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        // Create the "titles" channel with appropriate permissions
        let titlesChannel = await guild.channels.create({
            name: "titles-request",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        // Store the channel ID in the database
        await sql.setGuildTitlesChannel(titlesChannel.id, guildId);

        // Create the embed message for the titles panel
        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Matching the color from the image
            .setTitle(`🔹 Titles for ${guildName}`)
            .setDescription(
                "Choose a title, then select the target kingdom. IF you have only one kingdom verified, the title will be delivered directly.\n\n" +
                "1. Click on **Alchemist** 🧪 (for research) or **Architect** 🏰 (for building)\n" +
                "2. Select the target kingdom for the title from the dropdown menu.\n" +
                "3. If the target kingdom is not in the dropdown menu, please click **\"Add Kingdom\"** and follow the instructions to verify it. Once verified, start over at step 1.\n\n" +
                "🚨 **PLEASE NOTE:** The title is reserved for **2 minutes ⏰** then someone else can take it from you. If you finish with the title more quickly, please click **\"Free the Title\"** ❌ so that the others can use it! 🙏"
            )
            .addFields(
                { name: "Alchemist status:", value: "Free", inline: true },
                { name: "Architect status:", value: "Free", inline: true },
                { name: "Titles applied today:", value: "0", inline: false },
                { name: "Titles applied from start:", value: "0", inline: false }
            )
        // .setFooter({ text: "Lokex" });

        // Create the buttons for the panel
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("alchemist_")
                .setLabel("Alchemist")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🧪"),
            new ButtonBuilder()
                .setCustomId("architect_")
                .setLabel("Architect")
                .setStyle(ButtonStyle.Success)
                .setEmoji("🔨"),
            new ButtonBuilder()
                .setCustomId("freetitle_")
                .setLabel("Free the Title")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌")
        );

        // Create the "Add Kingdom" button in a separate row
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("add_kingdom")
                .setLabel("Add Kingdom")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🏰")
        );

        // Send the message to the new titles channel
        let message = await titlesChannel.send({ embeds: [embed], components: [row, row2] });

        // Respond to the interaction
        await interaction.followUp({ content: `✅ Titles channel created: ${titlesChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the titles channel.", flags: 64 });
    }
}

async function createAdminTitlesChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        // Create the "admin-titles" channel with appropriate permissions
        let adminTitlesChannel = await guild.channels.create({
            name: "admin-titles",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        // Store the channel ID in the database
        await sql.setGuildAdminTitlesChannel(adminTitlesChannel.id, guildId);

        // Create the embed message for the admin titles panel
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red color for admin titles
            .setTitle(`🔹 Admin Titles for ${guildName}`)
            .setDescription(
                "Choose an admin title, then select the target kingdom. IF you have only one kingdom verified, the title will be delivered directly.\n\n" +
                "1. Click on **Duke** 👑, **Count** 🎩, **Baron** ⚔️, **General** 🛡️, or **Minister** 📜\n" +
                "2. Select the target kingdom for the title from the dropdown menu.\n" +
                "3. If the target kingdom is not in the dropdown menu, please click **\"Add Kingdom\"** and follow the instructions to verify it. Once verified, start over at step 1.\n\n" +
                "🚨 **PLEASE NOTE:** The title is reserved for **2 minutes ⏰** then someone else can take it from you. If you finish with the title more quickly, please click **\"Free the Title\"** ❌ so that the others can use it! 🙏\n\n" +
                "⚠️ **ADMIN ONLY:** These titles are reserved for administrators."
            )
            .addFields(
                { name: "Duke status:", value: "Free", inline: true },
                { name: "Count status:", value: "Free", inline: true },
                { name: "Baron status:", value: "Free", inline: true },
                { name: "General status:", value: "Free", inline: true },
                { name: "Minister status:", value: "Free", inline: true },
                { name: "Admin titles applied today:", value: "0", inline: false },
                { name: "Admin titles applied from start:", value: "0", inline: false }
            );

        // Create the buttons for the admin titles panel
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("duke_")
                .setLabel("Duke")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("👑"),
            new ButtonBuilder()
                .setCustomId("count_")
                .setLabel("Count")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🎩"),
            new ButtonBuilder()
                .setCustomId("baron_")
                .setLabel("Baron")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("⚔️")
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("general_")
                .setLabel("General")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🛡️"),
            new ButtonBuilder()
                .setCustomId("minister_")
                .setLabel("Minister")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("📜"),
            new ButtonBuilder()
                .setCustomId("freetitle_admin_")
                .setLabel("Free the Title")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌")
        );

        // Create the "Add Kingdom" button in a separate row
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("add_kingdom_admin")
                .setLabel("Add Kingdom")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🏰")
        );

        // Send the message to the new admin titles channel
        let message = await adminTitlesChannel.send({ embeds: [embed], components: [row1, row2, row3] });

        // Respond to the interaction
        await interaction.followUp({ content: `✅ Admin Titles channel created: ${adminTitlesChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the admin titles channel.", flags: 64 });
    }
}

async function createPledgersChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let pledgersChannel = await guild.channels.create({
            name: "pledgers",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        await sql.setGuildPledgersChannel(pledgersChannel.id, guildId);

        await interaction.followUp({ content: `✅ Pledgers channel created: ${pledgersChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the pledgers channel.", flags: 64 });
    }
}

async function createBuffChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let buffChannel = await guild.channels.create({
            name: "buff-status",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        await sql.setGuildBuffChannel(buffChannel.id, guildId);

        await interaction.followUp({ content: `✅ Buff channel created: ${buffChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the buff channel.", flags: 64 });
    }
}

async function createDragoLookupChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let dragoInfoChannel = await guild.channels.create({
            name: "drago-info",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], // Allow sending messages for slash command
                }
            ]
        });

        await sql.setGuildDragoLookupChannel(dragoInfoChannel.id, guildId);

        // Create embed message explaining the /dragolookup command and button
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle("🟢 Drago Info Lookup")
            .setDescription(
                "Use the `/dragolookup` command or click the **Find Drago** button below to look up stats for up to 5 Dragos by ID or link.\n\n" +
                "**Slash Command Example:** `/dragolookup drago1:12345 drago2:23456`\n\n" +
                "**Button:** Click 'Find Drago' to open a modal and enter up to 5 Drago IDs.\n\n" +
                "You will get a detailed embed for each Drago, including level, fusion, legendary parts, and all abilities."
            )
            .setFooter({ text: "Powered by Lokex" });

        // Create the "Find Drago" button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("drago_list")
                .setLabel("Find Drago")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🐉")
        );

        // Send message to the new channel
        await dragoInfoChannel.send({ embeds: [embed], components: [row] });

        await interaction.followUp({ content: `✅ Drago Info channel created: ${dragoInfoChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the Drago Info channel.", flags: 64 });
    }
}

async function createShopChannel(interaction, guild, guildName, guildId, ephemeral, sql) {
    try {
        let shopChannel = await guild.channels.create({
            name: "shop",
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guildId, // @everyone role
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                }
            ]
        });

        await sql.setGuildShopChannel(shopChannel.id, guildId);

        // Get shop items from database
        const shopItems = await sql.getShopItems(guildId);
        
        // Create embed message for the shop
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🛒 ${guildName} Shop`)
            .setDescription("Welcome to the guild shop! Browse and purchase items below.")
            .setFooter({ text: "Powered by Lokex" });

        // Create buttons for shop items
        const rows = [];
        let currentRow = new ActionRowBuilder();
        let buttonsInRow = 0;

        // Filter items with stock > 0 for display
        const inStockItems = shopItems ? shopItems.filter(item => item.stock > 0) : [];
        
        if (inStockItems.length > 0) {
            // Get currency emoji for buttons
            const currencyEmoji = await sql.getGuildCurrencyEmoji(guildId) || "🪙";
            
            for (const item of inStockItems) {
                const button = new ButtonBuilder()
                    .setCustomId(`shop_buy_${item.id}`)
                    .setLabel(`${item.name} - ${item.price}`)
                    .setStyle(ButtonStyle.Success);

                // Handle custom emoji for button
                if (currencyEmoji.startsWith('<') && currencyEmoji.endsWith('>')) {
                    // Custom emoji format: <:name:id> or <a:name:id>
                    const emojiMatch = currencyEmoji.match(/<a?:(\w+):(\d+)>/);
                    if (emojiMatch) {
                        button.setEmoji({
                            name: emojiMatch[1],
                            id: emojiMatch[2],
                            animated: currencyEmoji.startsWith('<a:')
                        });
                    } else {
                        button.setEmoji("🪙"); // Fallback
                    }
                } else {
                    // Unicode emoji - use currency emoji as button emoji
                    button.setEmoji(currencyEmoji);
                }

                currentRow.addComponents(button);
                buttonsInRow++;

                if (buttonsInRow === 5) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                    buttonsInRow = 0;
                }
            }

            if (buttonsInRow > 0) {
                rows.push(currentRow);
            }

            // Add fields for each item in stock
            for (const item of inStockItems) {
                embed.addFields({
                    name: item.name,
                    value: `**Price:** ${item.price} ${currencyEmoji}\n**Stock:** ${item.stock}\n**Description:** ${item.description || 'No description'}`,
                    inline: true
                });
            }
        } else {
            embed.addFields({
                name: "No Items Available",
                value: "There are currently no items in the shop. Check back later!",
                inline: false
            });
        }

        // Send message to the new channel
        await shopChannel.send({ embeds: [embed], components: rows });

        await interaction.followUp({ content: `✅ Shop channel created: ${shopChannel}`, ...ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.followUp({ content: "There was an error while creating the shop channel.", flags: 64 });
    }
}