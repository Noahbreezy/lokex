const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const qs = require('qs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dragolookup")
        .setDescription("Look up up to 5 Drago IDs or links and get their stats")
        .addStringOption(option =>
            option.setName("drago1")
                .setDescription("Drago ID or link #1")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("drago2")
                .setDescription("Drago ID or link #2")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("drago3")
                .setDescription("Drago ID or link #3")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("drago4")
                .setDescription("Drago ID or link #4")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("drago5")
                .setDescription("Drago ID or link #5")
                .setRequired(false)
        ),

    async execute(interaction) {
        const sql = module.exports.sql;
        const api = module.exports.api;
        const guildId = interaction.guild.id;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        // Check subscription
        const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "3");
        if (!subscriptionFlagInfo) {
            await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscription renew` to get a new subscription. ", ...ephemeral });
            return;
        }

        await interaction.deferReply({ flags: 64 });

        // Get up to 5 IDs from options
        const ids = [];
        for (let i = 1; i <= 5; i++) {
            const val = interaction.options.getString(`drago${i}`);
            if (val) {
                const id = this.extractID(val);
                if (id) ids.push(id);
            }
        }

        if (ids.length === 0) {
            return interaction.editReply({ content: "No valid Drago IDs found.", ...ephemeral });
        }

        const logChannel = (await sql.getGuildLogChannels(guildId))[0]?.accept_log_channel;

        // Get a token from a random bot account
        const token = (await sql.getRandomNonIdleTokenFromGuild(guildId))[0]?.token;
        console.log("Using token:", token);

        if (!token) {
            return interaction.editReply({ content: "No bot token found. There must be at least one bot account set as manager or queen.", ...ephemeral });
        }

        const embeds = [];
        for (const id of ids) {
            try {
                const embed = await this.fetchDragoData(id, token, api);
                if (embed) {
                    embeds.push(embed);
                    if (logChannel) {
                        if (logChannel) {
                            await interaction.client.channels.cache.get(logChannel).send({
                                content: `<@${interaction.user.id}> looked for Drago #${id}`,
                            });
                        }
                    }
                }
            } catch (e) {
                console.error(`Error fetching Drago #${id}:`, e.message);
                embeds.push(new EmbedBuilder().setTitle(`Drago #${id}`).setDescription(`Error fetching data: ${e.message}`));
            }
        }

        await interaction.editReply({ embeds, ...ephemeral });
    },

    async handleButtonInteraction(interaction) {
        if (interaction.customId !== "drago_list") return;

        const modal = new ModalBuilder()
            .setCustomId('dragolist')
            .setTitle('Drago Info');

        const dragoid1 = new TextInputBuilder()
            .setCustomId('dragoid1')
            .setLabel("Drago 1")
            .setStyle(TextInputStyle.Short);
        const dragoid2 = new TextInputBuilder()
            .setCustomId('dragoid2')
            .setLabel("Drago 2")
            .setStyle(TextInputStyle.Short)
            .setRequired(false);
        const dragoid3 = new TextInputBuilder()
            .setCustomId('dragoid3')
            .setLabel("Drago 3")
            .setStyle(TextInputStyle.Short)
            .setRequired(false);
        const dragoid4 = new TextInputBuilder()
            .setCustomId('dragoid4')
            .setLabel("Drago 4")
            .setStyle(TextInputStyle.Short)
            .setRequired(false);
        const dragoid5 = new TextInputBuilder()
            .setCustomId('dragoid5')
            .setLabel("Drago 5")
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const row1 = new ActionRowBuilder().addComponents(dragoid1);
        const row2 = new ActionRowBuilder().addComponents(dragoid2);
        const row3 = new ActionRowBuilder().addComponents(dragoid3);
        const row4 = new ActionRowBuilder().addComponents(dragoid4);
        const row5 = new ActionRowBuilder().addComponents(dragoid5);

        modal.addComponents(row1, row2, row3, row4, row5);

        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'dragolist') return;

        const sql = module.exports.sql;
        const api = module.exports.api;
        const guildId = interaction.guild.id;
        const ephemeralFlag = await sql.getEphemeral(guildId);
        const ephemeral = ephemeralFlag ? { flags: 64 } : {};

        // Check subscription
        const subscriptionFlagInfo = await sql.checkSubscriptionValid(guildId, "3");
        if (!subscriptionFlagInfo) {
            await interaction.reply({ content: "Your continent needs to have a valid subscription to use this command. Use `/subscription renew` to get a new subscription. ", ...ephemeral });
            return;
        }

        await interaction.deferReply({ flags: 64 });

        const ids = [];
        for (let i = 1; i <= 5; i++) {
            const val = interaction.fields.getTextInputValue(`dragoid${i}`);
            if (val) {
                const id = this.extractID(val);
                if (id) ids.push(id);
            }
        }

        if (ids.length === 0) {
            return interaction.editReply({ content: "No valid Drago IDs provided.", ...ephemeral });
        }

        const token = (await sql.getRandomNonIdleTokenFromGuild(guildId))[0]?.token;
        if (!token) {
            return interaction.editReply({ content: "No bot token found. There must be at least one bot account set as manager or queen.", ...ephemeral });
        }

        const logChannel = (await sql.getGuildLogChannels(guildId))[0]?.accept_log_channel;
        const embeds = [];
        for (const id of ids) {
            try {
                const embed = await this.fetchDragoData(id, token, api);
                if (embed) {
                    embeds.push(embed);
                    if (logChannel) {
                        await interaction.client.channels.cache.get(logChannel).send({
                            content: `<@${interaction.user.id}> looked for Drago #${id}`,
                        });
                    }
                }
            } catch (e) {
                console.error(`Error fetching Drago #${id}:`, e.message);
                embeds.push(new EmbedBuilder().setTitle(`Drago #${id}`).setDescription(`Error fetching data: ${e.message}`));
            }
        }

        if (embeds.length > 0) {
            await interaction.editReply({ embeds, ...ephemeral });
        } else {
            await interaction.editReply({ content: "No data fetched for the provided Drago IDs.", ...ephemeral });
        }
    },

    extractID(text) {
        if (!text) return null;
        const match = text.match(/\b(\d{5})\b/);
        return match ? match[1] : null;
    },

    async fetchDragoData(number, token, api) {
        // Step 1: Get drago._id from market/detail (no token required)
        const detailResponse = await api.request(
            'https://lok-nft.leagueofkingdoms.com/api/market/detail',
            { tokenId: number },
            { 'Content-Type': 'application/json' }
        );
        if (!detailResponse.data.drago || !detailResponse.data.drago._id) throw new Error("Drago not found");
        const dragoid = detailResponse.data.drago._id;
        console.log("Drago ID found:", dragoid);

        // Step 2: Get drago info (requires token)
        const data = qs.stringify({
            'json': `{"dragoId":"${dragoid}"}`
        });
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-access-token': token,
        };
        const infoResponse = await api.request(
            "https://lok-api-live.leagueofkingdoms.com/api/drago/info",
            data,
            headers
        );
        const jsontot = infoResponse.data;
        console.log("Drago info response:", jsontot);
        if (!jsontot.drago) throw new Error("Drago info not found");

        // Build embed
        const { level, fusion, tokenId: tid, grade: lege, parts, bonus, xp, breed, owner } = jsontot.drago;
        // Aggregate buffs by ability code
        const buffTotals = new Map();

        // Process parts (base value + legends bonus)
        for (const part of parts) {
            const abilityCode = part.ability.code;
            const baseValue = part.ability.value * 100;
            const legendsBonus = part.legendsBonus * 100;
            const total = (buffTotals.get(abilityCode) || 0) + baseValue + legendsBonus;
            buffTotals.set(abilityCode, total);
        }

        // Process bonus (additional value)
        for (const b of bonus) {
            const abilityCode = b.code;
            const bonusValue = b.value * 100;
            const total = (buffTotals.get(abilityCode) || 0) + bonusValue;
            buffTotals.set(abilityCode, total);
        }

        // Build the stats list as a string
        let statsList = '';
        for (const [code, total] of buffTotals.entries()) {
            const abilityn = abilityName[code] || `Ability ${code}`;
            statsList += `${abilityn}: ${total.toFixed(2)}%\n`;
        }

        let embed = new EmbedBuilder()
            .setTitle(`Drago #${tid}`)
            .setDescription(
                `Level: ${level}, Fusion: ${fusion}, Legendary parts: ${lege}\n` +
                `XP: ${xp}, Breed: ${breed}\n` +
                `Owner: ${owner || "Unknown"}\n\n` +
                `**Current drago stats:**\n${statsList}`
            )
            .setColor('#00FF00')
            .setImage(`https://lok-nft.leagueofkingdoms.com/api/card/drago/${tid}`)
            .setThumbnail(`https://lok-nft.leagueofkingdoms.com/api/card/drago/${tid}`)
            .setTimestamp();

        return embed;
    },
};

// Ability name mapping (unchanged)
const abilityName = {
    1: "Power",
    2: "Food Production",
    3: "Lumber Production",
    4: "Stone Production",
    5: "Gold Production",
    6: "Food storage capacity",
    7: "Lumber storage capacity",
    8: "Stone storage capacity",
    9: "Gold storage capacity",
    10: "VIP point",
    11: "Troop dispatch queue",
    12: "Marching troop capacity",
    13: "Troop Limit",
    14: "Research Speed",
    15: "Resource protection",
    16: "Scout Level",
    17: "Additional building queue",
    18: "Scout limit",
    19: "Maximum troop size for Rally",
    20: "Maximum reinforcement troop size",
    21: "Food Protection capacity",
    22: "Lumber Protection capacity",
    23: "Stone Protection capacity",
    24: "Gold Protection capacity",
    25: "Treasure slot",
    26: "Wall Durability",
    27: "Wall Attack buff",
    28: "Wall Defense buff",
    29: "Hospital Capacity",
    30: "Healing Speed",
    31: "Mortality reduction",
    32: "Alliance help Count",
    33: "Alliance help Speedup",
    34: "Alliance size",
    35: "Gathering Speed",
    36: "Construction Speed",
    37: "Food Gathering Speed",
    38: "Lumber Gathering Speed",
    39: "Stone Gathering Speed",
    40: "Gold Gathering Speed",
    41: "Crystal Gathering Speed",
    42: "Caravan Stocks",
    43: "Caravan Visit Interval",
    44: "Food",
    45: "Lumber",
    46: "Stone",
    47: "Gold",
    48: "Crystal",
    49: "Speedup",
    50: "Infantry HP",
    51: "Archery HP",
    52: "Cavalry HP",
    53: "Infantry Defense",
    54: "Archery Defense",
    55: "Cavalry Defense",
    56: "Infantry Attack",
    57: "Archery Attack",
    58: "Cavalry Attack",
    59: "Infantry Speed",
    60: "Archery Speed",
    61: "Cavalry Speed",
    62: "Infantry Load",
    63: "Archery Load",
    64: "Cavalry Load",
    65: "Troops HP",
    66: "Troops Defense",
    67: "Troops Attack",
    68: "Troops Speed",
    69: "Troops Load",
    70: "T2 Infantry Unlock",
    71: "T2 Archery Unlock",
    72: "T2 Cavalry Unlock",
    73: "T3 Infantry Unlock",
    74: "T3 Archery Unlock",
    75: "T3 Cavalry Unlock",
    76: "T4 Infantry Unlock",
    77: "T4 Archery Unlock",
    78: "T4 Cavalry Unlock",
    79: "T5 Infantry Unlock",
    80: "T5 Archery Unlock",
    81: "T5 Cavalry Unlock",
    82: "Troops Training Rate",
    83: "Troops Training Speed",
    84: "Troops Training Cost",
    85: "Random Teleport",
    86: "Advanced Teleport",
    87: "Defense mortality reduction bonus",
    88: "Infantry Training Rate",
    89: "Archery Training Rate",
    90: "Cavalry Training Rate",
    91: "Infantry Training Speed",
    92: "Archery Training Speed",
    93: "Cavalry Training Speed",
    94: "Infantry Training Cost",
    95: "Archery Training Cost",
    96: "Cavalry Training Cost",
    97: "Construction speed",
    98: "Research speed",
    99: "Training speed",
    100: "Action point",
    101: "Action point regeneration",
    102: "Healing speed",
    103: "Teleport",
    104: "Teleport 2",
    105: "Teleport 3",
    106: "Package opening",
    107: "Instant harvest",
    108: "Instant recall",
    109: "Resource production",
    110: "Name change",
    111: "King's Shield",
    112: "vs Monster HP",
    113: "vs Monster Defense",
    114: "vs Monster Attack",
    115: "Summon Monster",
    116: "Summon Resources",
    117: "Action point regeneration",
    118: "Daily Free Chest",
    119: "Resource reserves",
    120: "Dispel",
    121: "Dev point",
    122: "Alliance Teleport",
    123: "Resource box",
    124: "Speedup box",
    125: "Intercontinental Teleport",
    126: "Ban Advanced Teleport",
    127: "Ban Shield",
    128: "Recruit T1 Troops",
    129: "Spawn crystal mine Lv4",
    130: "Spawn crystal mine Lv5",
    131: "Candy drop rate x2",
    132: "Experience points",
    133: "Infantry HP when composed of infantry only",
    134: "Infantry defense when composed of infantry only",
    135: "Infantry attack when composed of infantry only",
    136: "Archer HP when composed of archer only",
    137: "Archer defense when composed of archer only",
    138: "Archer attack when composed of archer only",
    139: "Cavalry HP when composed of cavalry only",
    140: "Cavalry defense when composed of cavalry only",
    141: "Cavalry attack when composed of cavalry only",
    142: "Castle defending Infantry's defense",
    143: "Infantry HP against archer",
    144: "Infantry defense under 50% HP",
    145: "Castle defending Infantry's HP",
    146: "Infantry defense when participating a rally",
    147: "Infantry attack when invading enemy kingdom",
    148: "Castle defending archer's attack",
    149: "Archer's attack against cavalry",
    150: "Archer's attack for the first 2 turns",
    151: "Archer's defense when raiding resource gathering",
    152: "Archer's HP when participating a rally",
    153: "Cavalry's speed when raiding enemy kingdom",
    154: "Cavalry speed when raiding resource gathering",
    155: "Cavalry attack when marching over 200km",
    156: "Cavalry defense when marching over 200km",
    157: "Cavalry speed when composed of cavalry only",
    158: "Troop speed when participating in a rally",
    159: "Troop attack when raiding collectors",
    160: "Troop HP when composed of all troop types",
    161: "Troop defense when composed of all troop types",
    162: "Troop attack when composed of all troop types",
    163: "Reduced action point consumption",
    164: "Troop speed against monster",
    165: "Resources gained from monster",
    166: "Item drop rate from monster",
    167: "March size against monster",
    168: "Increase buff duration",
    169: "Resource production per 10,000 troops",
    170: "Skill cooldown reduction",
    171: "Gathering speed per 10,000 troops",
    172: "Archer attack when invading enemy kingdoms",
    173: "Mastery point",
    174: "Christmas ornaments x2",
    175: "Resource gathering protection",
    176: "The first takeover points",
    177: "The defense points",
    178: "The final holders' bonus",
    179: "Troop health when defending",
    180: "Defense of troops when defending",
    181: "Troop attack when defending",
    182: "Infantry DEFENSE versus Archer",
    183: "Infantry ATTACK versus Archer",
    184: "Archery HP versus Cavalry",
    185: "Archery defense versus Cavalry",
    186: "Cavalry HP versus Infantry",
    187: "Cavalry DEFENSE versus Infantry",
    188: "Cavalry ATTACK versus Infantry",
    189: "Infantry ATTACK when defending castle",
    190: "Archery HP when defending castle",
    191: "Archery DEFENSE when defending castle",
    192: "Cavalry HP when defending castle",
    193: "Cavalry DEFENSE when defending castle",
    194: "Cavalry ATTACK when defending castle",
    195: "Infantry HP when participating a rally",
    196: "Infantry ATTACK when participating a rally",
    197: "Archery's DEFENSE when participating a rally",
    198: "Archery ATTACK when participating a rally",
    199: "Cavalry HP when participating a rally",
    200: "Cavalry DEFENSE when participating a rally",
    201: "Cavalry ATTACK when participating a rally",
    202: "Reconnaissance distance",
    203: "March speedup",
    204: "Archer speed when composed of archer only",
    205: "Infantry speed when composed of infantry only",
    206: "Troop HP when participating in a rally",
    207: "Troop DEFENS when participating in a rally",
    208: "Troop ATTACK when participating in a rally",
    209: "Enemy Troop HP Debuff",
    210: "Enemy Troop Defense Debuff",
    211: "Enemy Troop Attack Debuff",
    212: "drago slots",
    213: "defence drago slots",
    214: "anniversary decoration x2",
    215: "resource mint slots"
};