// Scanner manager: launches scanners once per hour at mm:10
// Steps each run:
//  1. Skip if global pause active
//  2. Fetch continents with subscription=5 (getGuildContinentWithSubscription)
//  3. For each (guild, continent) start scanner (avoid duplicates – scanner handles)
//  4. Clear old mines (clearOldMines)
//  5. Everything else happens inside scanner instances

require('dotenv').config();
const cron = require('node-cron');
const Scanner = require('./scanner.js');
const Sql = require('../database/sql.js');
const Api = require('../general/api.js');
const AccountInfo = require('../general/accountInfo.js');

// Shared singletons (Scanner also creates its own, but we reuse for prefetch)
const sql = new Sql();
const api = new Api(sql); // eslint placeholder use
const accountInfo = new AccountInfo(sql, api);

async function launchAll() {
	try {
		if (Scanner.isPaused && Scanner.isPaused()) {
			console.log('[Manager] Global pause active; skipping launch cycle.');
			return;
		}
		let rows;
		try { rows = await sql.getGuildContinentWithSubscription('5'); }
		catch (e) { console.error('[Manager] Failed getGuildContinentWithSubscription:', e); return; }
		if (!Array.isArray(rows) || rows.length === 0) {
			console.log('[Manager] No subscribed guild continents found.');
		}
		let xorPass = '.bx0531adex71.';
		try { const xp = await sql.getXORPass(); if (xp && xp[0] && xp[0].value) xorPass = xp[0].value; } catch (_) {}
		for (const r of rows) {
			const guildId = r.guild_id || r.guildId || r.guild; // attempt variations
			const continent = r.continent;
			if (!guildId || continent === undefined || continent === null) continue;
			// Update scanner tokens for the guild
			const scanners = await sql.getScannerTokens(guildId);
			for (const scanner of scanners) {
				await accountInfo.updateSingleBotToken(scanner.kingdomId);
			}
			// Starting a new scanner is idempotent per (guild, continent)
			new Scanner({ guildId, continent, xorPassword: xorPass });
		}
		try { await sql.clearOldMines(); } catch (e) { console.error('[Manager] clearOldMines failed:', e); }
	} catch (e) {
		console.error('[Manager] launchAll fatal:', e);
	}
}

// Run at mm:10 every hour
cron.schedule('10 * * * *', async () => {
	console.log('[Manager] Scheduled launch (mm:10)');
	await launchAll();
});

// Immediate first run if time is already past :10? we start once at process start.
(async () => {
	await launchAll();
})();

process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
process.on('exit', () => { try { sql.closeConnection && sql.closeConnection(); } catch (_) {} });

