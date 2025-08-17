const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('unverify')
		.setDescription('Unverify one of your (or another user\'s) verified kingdoms')
		.addUserOption(opt => opt
			.setName('user')
			.setDescription('Target user (admin only)')
			.setRequired(false)
		),

	async execute(interaction) {
		const sql = module.exports.sql;
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used inside a server.', flags: 64 });
			return;
		}

		const guildId = interaction.guild.id;
		const invokingUserId = interaction.user.id;
		const targetUser = interaction.options.getUser('user') || interaction.user;
		const targetUserId = targetUser.id;

		const ephemeralFlag = await sql.getEphemeral(guildId);
		const ephemeral = ephemeralFlag ? { flags: 64 } : {};

		// Permission: only admins can act on someone else
		if (targetUserId !== invokingUserId) {
			if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
				await interaction.reply({ content: 'You do not have permission to unverify other users.', ...ephemeral });
				return;
			}
		}

		try {
			const kingdoms = await sql.checkVerifiedKingdoms(targetUserId, guildId);
			if (!kingdoms || kingdoms.length === 0) {
				await interaction.reply({ content: targetUserId === invokingUserId ? 'You have no verified kingdoms.' : 'That user has no verified kingdoms.', ...ephemeral });
				return;
			}

			// Direct unverify when only one kingdom
			if (kingdoms.length === 1) {
				await sql.setKingdomStatusToZero(kingdoms[0].kingdomId, guildId);
				await postUnverifyCleanup(interaction, sql, targetUserId, kingdoms[0].kingdomName, guildId, invokingUserId !== targetUserId);
				await interaction.reply({ content: `Kingdom **${kingdoms[0].kingdomName}** has been unverified.`, ...ephemeral });
				return;
			}

			const select = new StringSelectMenuBuilder()
				.setCustomId(`unverify_select_${targetUserId}_${Date.now()}`)
				.setPlaceholder('Select a kingdom to unverify')
				.addOptions(
					kingdoms.slice(0, 25).map(k => ({
						label: k.kingdomName.substring(0, 100),
						value: String(k.kingdomId),
						description: `ID: ${k.kingdomId}`.substring(0, 100)
					}))
				);

			await interaction.reply({
				content: targetUserId === invokingUserId ? 'Select the kingdom you want to unverify:' : `Select the kingdom of ${targetUser.tag} to unverify:`,
				components: [new ActionRowBuilder().addComponents(select)],
				...ephemeral
			});

			const message = await interaction.fetchReply();
			const filter = i => i.customId.startsWith('unverify_select_') && i.user.id === invokingUserId;
			const collector = message.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60_000, max: 1 });

			collector.on('collect', async (i) => {
				const kingdomId = i.values[0];
				const selected = kingdoms.find(k => String(k.kingdomId) === String(kingdomId));
				if (!selected) {
					await i.update({ content: 'Selected kingdom not found.', components: [], ...ephemeral });
					return;
				}
				await sql.setKingdomStatusToZero(selected.kingdomId, guildId);
				await postUnverifyCleanup(interaction, sql, targetUserId, selected.kingdomName, guildId, invokingUserId !== targetUserId);
				await i.update({ content: `Kingdom **${selected.kingdomName}** has been unverified.`, components: [], ...ephemeral });
			});

			collector.on('end', async (collected) => {
				if (collected.size === 0) {
					try { await interaction.editReply({ content: 'Timed out. No kingdom selected.', components: [], ...ephemeral }); } catch {}
				}
			});
		} catch (err) {
			console.error('Unverify command error:', err);
			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({ content: 'An error occurred while unverifying.', flags: 64 });
			} else {
				await interaction.reply({ content: 'An error occurred while unverifying.', flags: 64 });
			}
		}
	}
};

async function postUnverifyCleanup(interaction, sql, targetUserId, kingdomName, guildId, isAdminAction) {
	try {
		const remaining = await sql.checkVerifiedKingdoms(targetUserId, guildId);
		if (!remaining || remaining.length === 0) {
			const roleSettings = await sql.getGuildVerificationRole(guildId);
			if (roleSettings[0]?.verified_role) {
				try {
					const member = await interaction.guild.members.fetch(targetUserId);
					if (member.roles.cache.has(roleSettings[0].verified_role)) {
						await member.roles.remove(roleSettings[0].verified_role).catch(() => {});
					}
				} catch (e) {
					console.error('Failed to remove verified role:', e);
				}
			}
		}

		const logChannels = await sql.getGuildLogChannels(guildId);
		if (logChannels[0]?.accept_log_channel) {
			try {
				const logChannel = await interaction.client.channels.fetch(logChannels[0].accept_log_channel);
				if (logChannel) {
					await logChannel.send(`${kingdomName} was unverified ${isAdminAction ? `by <@${interaction.user.id}>` : 'by owner'}${isAdminAction ? ` (target <@${targetUserId}>)` : ''}`);
				}
			} catch (e) { console.error('Failed to log unverify:', e); }
		}

		if (isAdminAction) {
			try {
				const targetUser = await interaction.client.users.fetch(targetUserId);
				await targetUser.send(`Your kingdom **${kingdomName}** has been unverified by an administrator in **${interaction.guild.name}**.`);
			} catch (e) { /* ignore DM errors */ }
		}
	} catch (e) {
		console.error('postUnverifyCleanup error:', e);
	}
}

