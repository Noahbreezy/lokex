const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} = require("discord.js");

const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;

function formatOptionsField(options) {
	if (!options.length) {
		return "No options configured.";
	}

	return options
		.map((option, index) => {
			const count = Number(option.vote_count || 0);
			return `${index + 1}. ${option.option_text} - Votes: ${count}`;
		})
		.join("\n");
}

function valueToBoolean(value) {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "number") {
		return value === 1;
	}
	if (typeof value === "string") {
		return value === "1" || value.toLowerCase() === "true";
	}
	return false;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName("vote")
		.setDescription("Manage server polls")
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("create")
				.setDescription("Create a new poll with voting buttons")
				.addStringOption((option) =>
					option
						.setName("question")
						.setDescription("Question or prompt for the poll")
						.setRequired(true)
						.setMaxLength(255)
				)
				.addStringOption((option) =>
					option
						.setName("option1")
						.setDescription("First answer option")
						.setRequired(true)
						.setMaxLength(255)
				)
				.addStringOption((option) =>
					option
						.setName("option2")
						.setDescription("Second answer option")
						.setRequired(true)
						.setMaxLength(255)
				)
				.addStringOption((option) =>
					option
						.setName("option3")
						.setDescription("Third answer option (optional)")
						.setRequired(false)
						.setMaxLength(255)
				)
				.addStringOption((option) =>
					option
						.setName("option4")
						.setDescription("Fourth answer option (optional)")
						.setRequired(false)
						.setMaxLength(255)
				)
				.addStringOption((option) =>
					option
						.setName("option5")
						.setDescription("Fifth answer option (optional)")
						.setRequired(false)
						.setMaxLength(255)
				)
				.addStringOption((option) =>
					option
						.setName("option6")
						.setDescription("Sixth answer option (optional)")
						.setRequired(false)
						.setMaxLength(255)
				)
				.addStringOption((option) =>
					option
						.setName("option7")
						.setDescription("Seventh answer option (optional)")
						.setRequired(false)
						.setMaxLength(255)
				)
				.addStringOption((option) =>
					option
						.setName("option8")
						.setDescription("Eighth answer option (optional)")
						.setRequired(false)
						.setMaxLength(255)
				)
				.addIntegerOption((option) =>
					option
						.setName("points")
						.setDescription("Optional shop points award for first-time voters")
						.setRequired(false)
						.setMinValue(0)
						.setMaxValue(100000)
				)
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("close")
				.setDescription("Close an active poll and prevent further voting")
				.addIntegerOption((option) =>
					option
						.setName("poll")
						.setDescription("Poll ID shown in the poll footer")
						.setRequired(true)
				)
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === "create") {
			await this.handleCreate(interaction);
		} else if (subcommand === "close") {
			await this.handleClose(interaction);
		}
	},

	async handleCreate(interaction) {
		const sql = module.exports.sql;

		if (!interaction.guildId || !interaction.channel || !interaction.channel.isTextBased()) {
			await interaction.reply({ content: "This command can only be used inside a server text channel.", flags: 64 });
			return;
		}

		await interaction.deferReply({ flags: 64 });

		const question = interaction.options.getString("question", true).trim();
		if (!question) {
			await interaction.editReply({ content: "Please provide a valid question for the poll." });
			return;
		}

		const pointsOption = interaction.options.getInteger("points");
		const rewardPoints = pointsOption != null ? pointsOption : 0;

		const collectedOptions = [];
		for (let i = 1; i <= MAX_OPTIONS; i += 1) {
			const optionText = interaction.options.getString(`option${i}`);
			if (typeof optionText === "string") {
				const trimmed = optionText.trim();
				if (trimmed.length > 0) {
					collectedOptions.push(trimmed);
				}
			}
		}

		if (collectedOptions.length < MIN_OPTIONS) {
			await interaction.editReply({ content: "Please provide at least two answer options." });
			return;
		}

		if (collectedOptions.length > MAX_OPTIONS) {
			await interaction.editReply({ content: `You can provide at most ${MAX_OPTIONS} options for a poll.` });
			return;
		}

		const uniqueOptions = [];
		const seen = new Set();
		for (const optionText of collectedOptions) {
			const normalized = optionText.toLowerCase();
			if (seen.has(normalized)) {
				await interaction.editReply({ content: "Duplicate options are not allowed. Please make sure every option is unique." });
				return;
			}
			seen.add(normalized);
			uniqueOptions.push(optionText);
		}

		let pollId;
		try {
			pollId = await sql.createPoll(
				interaction.guildId,
				interaction.channelId,
				0,
				question,
				interaction.user.id,
				pointsOption != null ? pointsOption : null
			);

			const optionsWithIds = [];
			for (const optionText of uniqueOptions) {
				const optionId = await sql.addPollOption(pollId, optionText);
				optionsWithIds.push({ id: optionId, option_text: optionText, vote_count: 0 });
			}

			const pollRecord = {
				id: pollId,
				guild_id: interaction.guildId,
				channel_id: interaction.channelId,
				message_id: 0,
				question,
				discord_id: interaction.user.id,
				created_at: new Date(),
				is_active: true,
				points: rewardPoints,
			};

			const embed = this.buildPollEmbed(pollRecord, optionsWithIds);
			const components = this.buildPollComponents(pollId, optionsWithIds, false);

			const pollMessage = await interaction.channel.send({
				embeds: [embed],
				components,
			});

			await sql.updatePollMessageId(pollId, pollMessage.id);

			const successMessage = rewardPoints > 0
				? `Poll created successfully. First-time voters earn ${rewardPoints} shop points.`
				: "Poll created successfully.";
			await interaction.editReply({ content: successMessage });
		} catch (error) {
			console.error("Poll creation error:", error);
			if (pollId) {
				try {
					await sql.deletePoll(pollId);
				} catch (cleanupError) {
					console.error("Failed to clean up incomplete poll:", cleanupError);
				}
			}

			await interaction.editReply({ content: "Unable to create the poll. Please try again later." });
		}
	},

	async handleClose(interaction) {
		const sql = module.exports.sql;
		await interaction.deferReply({ flags: 64 });

		const pollId = interaction.options.getInteger("poll", true);

		try {
			const pollRows = await sql.getPollById(pollId);
			if (!pollRows.length) {
				await interaction.editReply({ content: "No poll found with that ID." });
				return;
			}

			const poll = pollRows[0];

			if (String(poll.guild_id) !== String(interaction.guildId || "")) {
				await interaction.editReply({ content: "This poll belongs to a different server." });
				return;
			}

			const isActive = valueToBoolean(poll.is_active ?? true);
			if (!isActive) {
				await interaction.editReply({ content: "That poll is already closed." });
				return;
			}

			await sql.deactivatePoll(pollId);
			poll.is_active = false;

			const optionsWithCounts = await sql.getPollOptionsWithCounts(pollId);

			let messageUpdated = false;
			try {
				const channel = await interaction.client.channels.fetch(String(poll.channel_id));
				if (channel && channel.isTextBased()) {
					const message = await channel.messages.fetch(String(poll.message_id));
					const embed = this.buildPollEmbed(poll, optionsWithCounts);
					const components = this.buildPollComponents(pollId, optionsWithCounts, true);
					await message.edit({ embeds: [embed], components });
					messageUpdated = true;
				}
			} catch (messageError) {
				console.error("Failed to update poll message while closing:", messageError);
			}

			const responseText = messageUpdated
				? "Poll closed and message updated successfully."
				: "Poll closed. The message could not be updated (missing access or message removed).";

			await interaction.editReply({ content: responseText });
		} catch (error) {
			console.error("Poll close error:", error);
			await interaction.editReply({ content: "Unable to close the poll. Please try again later." });
		}
	},

	buildPollEmbed(poll, options) {
		const totalVotes = options.reduce((sum, option) => sum + Number(option.vote_count || 0), 0);
		const isActive = valueToBoolean(poll.is_active ?? true);
		const statusText = isActive ? "Open" : "Closed";
		let rewardPoints = poll.points == null ? 0 : Number(poll.points);
		if (!Number.isFinite(rewardPoints)) {
			rewardPoints = 0;
		}

		let description = `**${poll.question}**`;
		if (!isActive) {
			description += "\n\nThis poll is now closed.";
		}
		const statusEmoji = isActive ? "🟢" : "🔴";
		description += `\n\nStatus: ${statusEmoji} ${statusText}`;

		const embed = new EmbedBuilder()
			.setColor(isActive ? 0x57f287 : 0xed4245)
			.setTitle("Poll")
			.setDescription(description)
			.setTimestamp(poll.created_at ? new Date(poll.created_at) : new Date())
			.setFooter({ text: `Poll ID ${poll.id} | Status: ${statusText} | Total votes: ${totalVotes}` });

		if (rewardPoints > 0) {
			embed.addFields({ name: "Reward", value: `${rewardPoints} shop points (first vote only)`, inline: true });
		}

		const optionsText = formatOptionsField(options);
		if (optionsText.length <= 1024) {
			embed.addFields({ name: "Options", value: optionsText });
		} else {
			let chunk = "";
			const lines = optionsText.split("\n");
			let chunkIndex = 1;
			for (const line of lines) {
				const candidate = chunk ? `${chunk}\n${line}` : line;
				if (candidate.length > 1024) {
					embed.addFields({ name: `Options (${chunkIndex})`, value: chunk });
					chunk = line;
					chunkIndex += 1;
				} else {
					chunk = candidate;
				}
			}
			if (chunk) {
				embed.addFields({ name: `Options (${chunkIndex})`, value: chunk });
			}
		}

		return embed;
	},

	buildPollComponents(pollId, options, disabled = false) {
		const rows = [];
		let currentRow = new ActionRowBuilder();

		options.forEach((option, index) => {
			if (index > 0 && index % 5 === 0) {
				rows.push(currentRow);
				currentRow = new ActionRowBuilder();
			}

			const button = new ButtonBuilder()
				.setCustomId(`poll_vote:${pollId}:${option.id}`)
				.setLabel(String(index + 1))
				.setStyle(ButtonStyle.Primary)
				.setDisabled(disabled);

			currentRow.addComponents(button);
		});

		if (currentRow.components.length > 0) {
			rows.push(currentRow);
		}

		return rows;
	},

	async handleButtonInteraction(interaction) {
		const sql = module.exports.sql;

		const [prefix, pollIdRaw, optionIdRaw] = interaction.customId.split(":");
		if (prefix !== "poll_vote") {
			return;
		}

		const pollId = Number.parseInt(pollIdRaw, 10);
		const optionId = Number.parseInt(optionIdRaw, 10);
		if (Number.isNaN(pollId) || Number.isNaN(optionId)) {
			if (!interaction.replied && !interaction.deferred) {
				try {
					await interaction.reply({ content: "Invalid poll button.", flags: 64 });
				} catch (replyError) {
					console.error("Poll vote invalid button reply error:", replyError);
				}
			}
			return;
		}

		let deferred = false;
		if (!interaction.deferred && !interaction.replied) {
			try {
				await interaction.deferReply({ flags: 64 });
				deferred = true;
			} catch (deferError) {
				console.error("Poll vote defer error:", deferError);
			}
		} else if (interaction.deferred) {
			deferred = true;
		}

		const respond = async (content) => {
			try {
				if (deferred) {
					await interaction.editReply({ content });
				} else if (!interaction.replied) {
					await interaction.reply({ content, flags: 64 });
				} else {
					await interaction.followUp({ content, flags: 64 });
				}
			} catch (responseError) {
				console.error("Poll vote response error:", responseError);
			}
		};

		try {
			const pollRows = await sql.getPollById(pollId);
			if (!pollRows.length) {
				await respond("This poll no longer exists.");
				return;
			}

			const poll = pollRows[0];
			const isActive = valueToBoolean(poll.is_active ?? true);
			if (!isActive) {
				await respond("This poll is closed.");
				return;
			}
			poll.is_active = isActive;

			let rewardPoints = poll.points == null ? 0 : Number(poll.points);
			if (!Number.isFinite(rewardPoints) || rewardPoints < 0) {
				rewardPoints = 0;
			}

			if (String(poll.guild_id) !== String(interaction.guildId || "")) {
				await respond("You cannot vote on polls from another server.");
				return;
			}

			const optionRows = await sql.getPollOptionById(optionId);
			if (!optionRows.length || String(optionRows[0].poll_id) !== String(pollId)) {
				await respond("Invalid poll option.");
				return;
			}

			try {
				const verifiedKingdoms = await sql.checkVerifiedKingdoms(interaction.user.id, interaction.guildId);
				if (!Array.isArray(verifiedKingdoms) || verifiedKingdoms.length === 0) {
					await respond("You need a verified kingdom to vote in polls. Please verify one with `/verify` first.");
					return;
				}
			} catch (kingdomError) {
				console.error("Poll verified kingdom check error:", kingdomError);
				await respond("We could not confirm your verification status. Please try again later.");
				return;
			}

			const existingVote = await sql.getPollVoteByUser(pollId, interaction.user.id);
			const previousOptionId = existingVote.length ? Number(existingVote[0].option_id) : null;
			if (previousOptionId === optionId) {
				await respond("You already voted for this option.");
				return;
			}

			await sql.upsertPollVote(pollId, optionId, interaction.user.id);

			let rewardMessage = "";
			if (rewardPoints > 0 && previousOptionId === null && interaction.guildId) {
				const rewardReason = "voted";
				try {
					await sql.addUserPoints(interaction.user.id, interaction.guildId, rewardPoints, rewardReason);
					rewardMessage = ` You earned ${rewardPoints} shop points.`;
					try {
						const logChannelId = await sql.getGuildDSTNotificationChannel(interaction.guildId);
						if (logChannelId) {
							const logChannel = await interaction.client.channels.fetch(String(logChannelId)).catch(() => null);
							if (logChannel && logChannel.isTextBased()) {
								const pointsLabel = rewardPoints.toLocaleString();
								const pollQuestion = typeof poll.question === "string" && poll.question.length > 0 ? poll.question : "Poll question unavailable";
								const questionField = pollQuestion.length > 1024 ? `${pollQuestion.slice(0, 1021)}...` : pollQuestion;
								const rewardEmbed = new EmbedBuilder()
									.setColor(0x00ff00)
									.setTitle("🗳️ Poll Reward Granted")
									.setDescription(`<@${interaction.user.id}> earned **${pointsLabel}** shop points for voting.`)
									.addFields(
										{ name: "Poll Question", value: questionField, inline: false },
										{ name: "Points Awarded", value: `${pointsLabel} points`, inline: true }
									)
									.setTimestamp();

								const footerData = { text: `Awarded to ${interaction.user.username}` };
								if (typeof interaction.user.displayAvatarURL === "function") {
									footerData.iconURL = interaction.user.displayAvatarURL();
								}
								rewardEmbed.setFooter(footerData);

								await logChannel.send({ embeds: [rewardEmbed] });
							}
						}
					} catch (logError) {
						console.error("Poll reward logging error:", logError);
					}
				} catch (awardError) {
					console.error("Poll reward points error:", awardError);
					rewardMessage = " We could not award shop points. Please contact an admin.";
				}
			}

			const optionsWithCounts = await sql.getPollOptionsWithCounts(pollId);
			const embed = this.buildPollEmbed(poll, optionsWithCounts);
			const components = this.buildPollComponents(pollId, optionsWithCounts);

			try {
				await interaction.message.edit({ embeds: [embed], components });
			} catch (editError) {
				console.error("Failed to update poll message:", editError);
			}

			let responseText = previousOptionId ? "Your vote has been updated." : "Your vote has been recorded.";
			responseText += rewardMessage;
			await respond(responseText.trim());
		} catch (error) {
			console.error("Poll vote handler error:", error);
			await respond("Unable to record your vote. Please try again later.");
		}
	},
};
