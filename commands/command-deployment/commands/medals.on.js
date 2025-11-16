const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ActionRowBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	EmbedBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType
} = require("discord.js");

function formatAmount(amount) {
	return amount > 0 ? `+${amount}` : `${amount}`;
}

function truncateLabel(label) {
	return label.length > 100 ? `${label.slice(0, 97)}...` : label;
}

function buildAutocompleteOption(record) {
	const baseName = record.kingdomName || `Kingdom ${record.kingdomId}`;
	const label = truncateLabel(`${baseName} (ID: ${record.kingdomId})`);
	const payload = {
		id: String(record.kingdomId),
		discordId: record.discordId ? String(record.discordId) : null,
		name: baseName
	};
	let value = JSON.stringify(payload);
	if (value.length > 100) {
		delete payload.name;
		value = JSON.stringify(payload);
	}
	if (value.length > 100) {
		value = `${payload.id}|${payload.discordId || ""}`;
	}
	return { name: label, value };
}

function parseKingdomOption(raw) {
	if (!raw) {
		return { kingdomId: null, discordId: null, kingdomName: null };
	}
	if (raw.trim().startsWith("{")) {
		try {
			const parsed = JSON.parse(raw);
			return {
				kingdomId: parsed.id || parsed.kingdomId || null,
				discordId: parsed.discordId || null,
				kingdomName: parsed.name || null
			};
		} catch (_) {
			// Fall back to delimiter parsing
		}
	}
	const parts = raw.split("|");
	return {
		kingdomId: parts[0]?.trim() || null,
		discordId: parts[1]?.trim() || null,
		kingdomName: null
	};
}

async function resolveKingdomDetails(sql, kingdomId, guildId) {
	const [nameRows, discordRows] = await Promise.all([
		sql.getKingdomName(kingdomId),
		sql.getVerifiedDiscordId(kingdomId, guildId)
	]);
	const kingdomName = nameRows?.[0]?.name || `Kingdom ${kingdomId}`;
	const discordId = discordRows?.[0]?.discordId || null;
	return { kingdomName, discordId };
}

function createMedalListEmbed(entries, page) {
	const ITEMS_PER_PAGE = 10;
	const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
	const startIndex = page * ITEMS_PER_PAGE;
	const pageEntries = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

	const embed = new EmbedBuilder()
		.setTitle('🏅 Medal Balances')
		.setColor(0xF1C40F)
		.setFooter({ text: `Page ${page + 1} of ${totalPages} • Total kingdoms: ${entries.length}` });

	if (!pageEntries.length) {
		embed.setDescription('No medal balances to display.');
		return embed;
	}

	const description = pageEntries.map((entry, idx) => {
		const rank = startIndex + idx + 1;
		const nameDisplay = entry.name || `Kingdom ${entry.kingdomId}`;
		const medalsDisplay = Number(entry.total || 0).toLocaleString();
		let lines = `**${rank}. ${nameDisplay}**\n   👑 ID: ${entry.kingdomId}\n   🎖️ Medals: ${medalsDisplay}`;
		if (entry.discordId) {
			lines += `\n   👤 <@${entry.discordId}> (${entry.discordId})`;
		}
		return lines;
	}).join('\n\n');

	embed.setDescription(description);
	return embed;
}

function createMedalNavigationRow(currentPage, totalPages, disabled = false) {
	const row = new ActionRowBuilder();

	const prevButton = new ButtonBuilder()
		.setCustomId('medals_prev')
		.setLabel('◀️ Previous')
		.setStyle(ButtonStyle.Primary)
		.setDisabled(disabled || currentPage === 0);

	const pageButton = new ButtonBuilder()
		.setCustomId('medals_page_info')
		.setLabel(`${currentPage + 1}/${totalPages}`)
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(true);

	const nextButton = new ButtonBuilder()
		.setCustomId('medals_next')
		.setLabel('Next ▶️')
		.setStyle(ButtonStyle.Primary)
		.setDisabled(disabled || currentPage === totalPages - 1);

	row.addComponents(prevButton, pageButton, nextButton);
	return row;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName("medals")
		.setDescription("Manage medal balances for verified kingdoms")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName("add")
				.setDescription("Add medals to a kingdom")
				.addStringOption((option) =>
					option
						.setName("kingdom")
						.setDescription("Kingdom to credit")
						.setRequired(true)
						.setAutocomplete(true)
				)
				.addIntegerOption((option) =>
					option
						.setName("amount")
						.setDescription("Medals to add (positive number)")
						.setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName("list")
				.setDescription("List medal balances for this guild")
		)
		.addSubcommand((sub) =>
			sub
				.setName("bulkadd")
				.setDescription("Bulk add medals to kingdoms")
		)
		.addSubcommand((sub) =>
			sub
				.setName("remove")
				.setDescription("Remove medals from a kingdom")
				.addStringOption((option) =>
					option
						.setName("kingdom")
						.setDescription("Kingdom to debit")
						.setRequired(true)
						.setAutocomplete(true)
				)
				.addIntegerOption((option) =>
					option
						.setName("amount")
						.setDescription("Medals to remove (positive number)")
						.setRequired(true)
				)
		),

	async execute(interaction) {
		const sql = module.exports.sql;
		if (!interaction.guild) {
			await interaction.reply({ content: "This command can only be used in a server.", flags: 64 });
			return;
		}

		const guildId = interaction.guild.id;
		const subcommand = interaction.options.getSubcommand();
		const ephemeralFlag = await sql.getEphemeral(guildId);
		const deferOptions = ephemeralFlag ? { flags: 64 } : {};

		if (subcommand === "bulkadd") {
			const modal = new ModalBuilder()
				.setCustomId("medals_bulkadd_modal")
				.setTitle("Bulk Add Medals")
				.addComponents(
					new ActionRowBuilder().addComponents(
						new TextInputBuilder()
							.setCustomId("bulkadd_list")
							.setLabel("kingdomId,amount (one per line)")
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true)
					)
				);

			await interaction.showModal(modal);
			return;
		}

		if (subcommand === "list") {
			try {
				await interaction.deferReply(deferOptions);

				const totalsMap = await sql.getAllMedalTotals(guildId);
				const entries = [];
				if (totalsMap instanceof Map) {
					for (const [kingdomId, total] of totalsMap.entries()) {
						const numericTotal = Number(total || 0);
						if (!Number.isFinite(numericTotal) || numericTotal === 0) {
							continue;
						}
						entries.push({ kingdomId: kingdomId.toString(), total: numericTotal });
					}
				}

				if (!entries.length) {
					await interaction.editReply({ content: "No medal balances recorded for this guild." });
					return;
				}

				const kingdomIds = entries.map((entry) => entry.kingdomId);
				const [nameRows, verifiedRows] = await Promise.all([
					sql.getKingdomNamesBulk(kingdomIds),
					sql.getVerifiedInfoForKingdoms(kingdomIds, guildId)
				]);

				const nameMap = new Map();
				if (Array.isArray(nameRows)) {
					for (const row of nameRows) {
						if (row?.kingdomId) {
							nameMap.set(String(row.kingdomId), row.name || null);
						}
					}
				}

				const verifiedMap = new Map();
				if (Array.isArray(verifiedRows)) {
					for (const row of verifiedRows) {
						if (row?.kingdomId) {
							verifiedMap.set(String(row.kingdomId), row);
						}
					}
				}

				for (const entry of entries) {
					entry.name = nameMap.get(entry.kingdomId) || verifiedMap.get(entry.kingdomId)?.kingdomName || null;
					entry.discordId = verifiedMap.get(entry.kingdomId)?.discordId || null;
				}

				entries.sort((a, b) => {
					const diff = b.total - a.total;
					if (diff !== 0) {
						return diff;
					}
					const nameA = (a.name || '').toLowerCase();
					const nameB = (b.name || '').toLowerCase();
					if (nameA && nameB) {
						const nameDiff = nameA.localeCompare(nameB);
						if (nameDiff !== 0) {
							return nameDiff;
						}
					}
					return a.kingdomId.localeCompare(b.kingdomId);
				});

				const totalPages = Math.max(1, Math.ceil(entries.length / 10));
				let currentPage = 0;
				const embed = createMedalListEmbed(entries, currentPage);
				const components = totalPages > 1 ? [createMedalNavigationRow(currentPage, totalPages)] : [];
				const response = await interaction.editReply({ embeds: [embed], components });

				if (totalPages > 1 && response?.createMessageComponentCollector) {
					const collector = response.createMessageComponentCollector({
						componentType: ComponentType.Button,
						time: 300000
					});

					collector.on('collect', async (buttonInteraction) => {
						if (buttonInteraction.user.id !== interaction.user.id) {
							await buttonInteraction.reply({ content: "Only the command invoker can use these controls.", ephemeral: true });
							return;
						}

						if (buttonInteraction.customId === 'medals_prev' && currentPage > 0) {
							currentPage -= 1;
						} else if (buttonInteraction.customId === 'medals_next' && currentPage < totalPages - 1) {
							currentPage += 1;
						}

						const updatedEmbed = createMedalListEmbed(entries, currentPage);
						const updatedComponents = [createMedalNavigationRow(currentPage, totalPages)];
						await buttonInteraction.update({ embeds: [updatedEmbed], components: updatedComponents });
					});

					collector.on('end', async () => {
						try {
							await interaction.editReply({ embeds: [createMedalListEmbed(entries, currentPage)], components: [createMedalNavigationRow(currentPage, totalPages, true)] });
						} catch (_) {
							// swallow
						}
					});
				}
			} catch (error) {
				console.error("Medals list error:", error);
				if (interaction.deferred || interaction.replied) {
					await interaction.editReply({ content: "There was an error while retrieving medal balances." });
				} else {
					await interaction.reply({ content: "There was an error while retrieving medal balances.", flags: 64 });
				}
			}
			return;
		}

		const amountInput = interaction.options.getInteger("amount");
		const kingdomOption = interaction.options.getString("kingdom");

		try {
			await interaction.deferReply(deferOptions);

			if (amountInput === null || amountInput === 0) {
				await interaction.editReply("Amount must be a non-zero integer.");
				return;
			}

			const trimmedInput = kingdomOption?.trim() || "";
			const directIdInput = /^[0-9a-fA-F]{24}$/.test(trimmedInput);
			const { kingdomId, discordId: selectionDiscordId, kingdomName: selectionName } = parseKingdomOption(kingdomOption);
			if (!kingdomId) {
				await interaction.editReply("Unable to determine the selected kingdom. Please use the autocomplete list.");
				return;
			}

			let normalizedAmount;
			if (subcommand === "add") {
				normalizedAmount = Math.abs(amountInput);
			} else if (subcommand === "remove") {
				normalizedAmount = -Math.abs(amountInput);
			} else {
				await interaction.editReply("Unsupported medals action.");
				return;
			}

			let discordId = selectionDiscordId || null;
			let kingdomName = selectionName || null;

			if (directIdInput) {
				const verifiedInfo = await sql.getVerifiedKingdomInfo(kingdomId, guildId);
				if (!verifiedInfo) {
					await interaction.editReply("That kingdom ID is not available in this guild.");
					return;
				}
				discordId = discordId || verifiedInfo.discordId || null;
				kingdomName = kingdomName || verifiedInfo.kingdomName || null;
			}

			if (!discordId || !kingdomName) {
				const resolved = await resolveKingdomDetails(sql, kingdomId, guildId);
				discordId = discordId || resolved.discordId;
				kingdomName = kingdomName || resolved.kingdomName;
			}

			await sql.recordMedalTransaction(kingdomId, discordId, normalizedAmount, guildId);

			const updatedTotal = await sql.getMedalTotalForKingdom(kingdomId, guildId);
			const amountText = formatAmount(normalizedAmount);
			const pieces = [
				`Recorded medal transaction for **${kingdomName || `Kingdom ${kingdomId}`}** (ID: ${kingdomId}).`,
				`Amount: **${amountText}** medals.`
			];

			if (Number.isFinite(updatedTotal)) {
				pieces.push(`New total: **${updatedTotal}** medals.`);
			}

			if (discordId) {
				pieces.push(`Linked user: <@${discordId}> (${discordId}).`);
			}

			await interaction.editReply(pieces.join(" "));
		} catch (error) {
			console.error("Medals command error:", error);
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply("There was an error while recording the medal transaction.");
			} else {
				await interaction.reply({ content: "There was an error while recording the medal transaction.", flags: 64 });
			}
		}
	},

	async autocomplete(interaction) {
		const sql = module.exports.sql;
		const focused = interaction.options.getFocused(true);
		if (focused.name !== "kingdom") {
			return;
		}

		const guildId = interaction.guild?.id;
		if (!guildId) {
			await interaction.respond([]);
			return;
		}

		const search = focused.value?.trim();
		if (!search) {
			await interaction.respond([]);
			return;
		}

		const suggestions = [];

		try {
			const match = await sql.getVerifiedKingdomByName(search, guildId);
			if (match) {
				suggestions.push(buildAutocompleteOption({
					kingdomId: match.kingdomId,
					kingdomName: match.kingdomName,
					discordId: match.discordId
				}));
			}

			const unique = [];
			const seenValues = new Set();
			for (const option of suggestions) {
				if (!seenValues.has(option.value)) {
					unique.push(option);
					seenValues.add(option.value);
				}
			}

			await interaction.respond(unique.slice(0, 25));
		} catch (error) {
			console.error("Medals autocomplete error:", error);
			try {
				await interaction.respond([]);
			} catch (_) {}
		}
	},

	async modalSubmit(interaction) {
		if (interaction.customId !== "medals_bulkadd_modal") {
			return;
		}

		const sql = module.exports.sql;
		const guildId = interaction.guild?.id;
		if (!guildId) {
			await interaction.reply({ content: "This modal can only be used inside a server.", flags: 64 });
			return;
		}

		try {
			const ephemeralFlag = await sql.getEphemeral(guildId);
			const deferOptions = ephemeralFlag ? { flags: 64 } : {};
			await interaction.deferReply(deferOptions);

			const rawInput = interaction.fields.getTextInputValue("bulkadd_list") || "";
			const lines = rawInput
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);

			const parsedEntries = [];
			const invalidInputs = [];

			for (const line of lines) {
				const parts = line.split(",").map((part) => part.trim()).filter(Boolean);
				if (parts.length !== 2) {
					invalidInputs.push(`${line} • expected "kingdomId,amount"`);
					continue;
				}

				const [kingdomIdRaw, amountRaw] = parts;
				if (!/^[0-9a-fA-F]{24}$/.test(kingdomIdRaw)) {
					invalidInputs.push(`${line} • invalid kingdomId`);
					continue;
				}

				const amount = parseInt(amountRaw, 10);
				if (!Number.isFinite(amount) || amount === 0) {
					invalidInputs.push(`${line} • amount must be a non-zero integer`);
					continue;
				}

				parsedEntries.push({
					kingdomId: kingdomIdRaw,
					amount: Math.abs(amount)
				});
			}

			if (!parsedEntries.length) {
				await interaction.editReply({ content: invalidInputs.length ? invalidInputs.join("\n") : "No valid entries." });
				return;
			}

			const uniqueIds = [...new Set(parsedEntries.map((entry) => entry.kingdomId))];
			const verifiedRows = await sql.getVerifiedInfoForKingdoms(uniqueIds, guildId);
			const verifiedMap = new Map();
			for (const row of verifiedRows) {
				verifiedMap.set(String(row.kingdomId), row);
			}

			const added = [];
			const missing = [];
			const failed = [];

			for (const entry of parsedEntries) {
				const info = verifiedMap.get(entry.kingdomId);
				if (!info) {
					missing.push(`${entry.kingdomId} • not verified in this guild`);
					continue;
				}

				const displayName = info.kingdomName || `Kingdom ${entry.kingdomId}`;
				const userFragment = info.discordId ? ` (User: <@${info.discordId}> / ${info.discordId})` : "";

				try {
					await sql.recordMedalTransaction(entry.kingdomId, info.discordId || null, entry.amount, guildId);
					added.push(`${displayName} (ID: ${entry.kingdomId}) ${formatAmount(entry.amount)} medals${userFragment}`);
				} catch (err) {
					console.error("Medals bulk add error:", err);
					failed.push(`${displayName} (ID: ${entry.kingdomId}) • ${err.message || "database error"}`);
				}
			}

			const responseSections = [];
			if (added.length) {
				responseSections.push(`✅ Added medals:\n${added.join("\n")}`);
			}
			if (failed.length) {
				responseSections.push(`❌ Failed:\n${failed.join("\n")}`);
			}
			if (missing.length) {
				responseSections.push(`🚫 Not processed:\n${missing.join("\n")}`);
			}
			if (invalidInputs.length) {
				responseSections.push(`⚠️ Invalid input:\n${invalidInputs.join("\n")}`);
			}

			let reply = responseSections.join("\n\n");
			if (!reply) {
				reply = "No valid entries.";
			}

			const MAX_REPLY_LENGTH = 2000;
			if (reply.length > MAX_REPLY_LENGTH) {
				reply = `${reply.slice(0, MAX_REPLY_LENGTH - 20)}\n...(truncated)`;
			}

			await interaction.editReply({ content: reply });
		} catch (error) {
			console.error("Medals bulk modal error:", error);
			const errorMessage = "There was an error while processing the bulk medal update.";
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content: errorMessage });
			} else {
				await interaction.reply({ content: errorMessage, flags: 64 });
			}
		}
	}
};
