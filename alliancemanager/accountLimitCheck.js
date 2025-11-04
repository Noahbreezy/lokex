class AccountLimitCheck {
	constructor(sql) {
		this.sql = sql;
	}

	buildMemberSet(allianceMembers) {
		const ids = new Set();
		if (!Array.isArray(allianceMembers)) {
			return ids;
		}

		for (const roleGroup of allianceMembers) {
			if (!roleGroup || !Array.isArray(roleGroup.members)) {
				continue;
			}
			for (const member of roleGroup.members) {
				if (member && member.kingdomId) {
					ids.add(member.kingdomId);
				}
			}
		}

		return ids;
	}

	async hasReachedLimit(guildId, allianceId, linkedKingdoms, allianceMembers, presetMaxEntry = null) {
		if (!Array.isArray(linkedKingdoms) || linkedKingdoms.length === 0) {
			return { reached: false, maxEntry: null, activeCount: 0, matchingKingdoms: [] };
		}

		let maxEntry = presetMaxEntry;
		if (maxEntry === null || maxEntry === undefined) {
			const maxEntryRaw = await this.sql.getAllianceMaxEntry(allianceId, guildId);
			maxEntry = Number(maxEntryRaw);
		}

		if (!Number.isFinite(maxEntry) || maxEntry <= 0) {
			return { reached: false, maxEntry, activeCount: 0, matchingKingdoms: [] };
		}

		const memberSet = this.buildMemberSet(allianceMembers);
		const matchingKingdoms = linkedKingdoms.filter((kingdom) => memberSet.has(kingdom.kingdomId));
		const activeCount = matchingKingdoms.length;

		return {
			reached: activeCount >= maxEntry,
			maxEntry,
			activeCount,
			matchingKingdoms
		};
	}
}

module.exports = AccountLimitCheck;
