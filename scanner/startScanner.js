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

const WEBSOCKET_BASE = 'wss://socf-lok-live.leagueofkingdoms.com/socket.io/?EIO=4&transport=websocket';

// Shared singletons (Scanner also creates its own, but we reuse for prefetch)
const sql = new Sql();
const api = new Api(sql); // eslint placeholder use
const accountInfo = new AccountInfo(sql, api);

async function launchAll() {
	try {
		// Optional: rank proxies by websocket performance and prefer fastest-first.
		// Enable with SCANNER_RANK_PROXIES=1 (requires a valid token in env).
		if (/^(1|true|yes)$/i.test(String(process.env.SCANNER_RANK_PROXIES || ''))) {
			const token = process.env.LOK_WS_TOKEN || process.env.SCANNER_TEST_TOKEN || process.env.TOKEN;
			if (token) {
				let xorPassword = null;
				try {
					const row = await sql.getXORPass();
					xorPassword = row && row[0] && row[0].value;
				} catch (_) {}
				xorPassword = xorPassword || process.env.XOR_PASS || null;
				const maxProxies = Number.isFinite(Number(process.env.SCANNER_RANK_PROXY_COUNT)) ? Number(process.env.SCANNER_RANK_PROXY_COUNT) : 25;
				const timeoutMs = Number.isFinite(Number(process.env.SCANNER_RANK_PROXY_TIMEOUT_MS)) ? Number(process.env.SCANNER_RANK_PROXY_TIMEOUT_MS) : 20000;
				const concurrency = Number.isFinite(Number(process.env.SCANNER_RANK_PROXY_CONCURRENCY)) ? Number(process.env.SCANNER_RANK_PROXY_CONCURRENCY) : 5;
				console.log(`[Manager] Ranking proxies against websocket (maxProxies=${maxProxies} timeoutMs=${timeoutMs} concurrency=${concurrency})`);
				try {
					const results = await api.rankProxiesForWebSocket(WEBSOCKET_BASE, token, { maxProxies, timeoutMs, concurrency, xorPassword });
					const ok = results
						.filter(r => r && r.ok && Number.isFinite(r.objectsMs))
						.sort((a, b) => a.objectsMs - b.objectsMs)
						.slice(0, 5);
					if (ok.length) {
						console.log('[Manager] Fastest proxies:', ok.map(r => `${r.ip}(${r.objectsMs}ms)`).join(', '));
					} else {
						console.log('[Manager] Proxy ranking produced no "good" proxies (will fall back to random selection).');
					}
				} catch (e) {
					console.error('[Manager] Proxy ranking failed:', e && e.message ? e.message : e);
				}
			} else {
				console.log('[Manager] SCANNER_RANK_PROXIES enabled but no token in env (LOK_WS_TOKEN/SCANNER_TEST_TOKEN/TOKEN).');
			}
		}

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
			new Scanner({ guildId, continent });
		}
		try { await sql.clearOldMines(); } catch (e) { console.error('[Manager] clearOldMines failed:', e); }
	} catch (e) {
		console.error('[Manager] launchAll fatal:', e);
	}
}

// Run at mm:10 and mm:40 every hour
cron.schedule('10,40 * * * *', async () => {
	console.log('[Manager] Scheduled launch (mm:10,40)');
	await launchAll();
});

// Immediate first run if time is already past :10? we start once at process start.
(async () => {
	await launchAll();
})();

process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
process.on('exit', () => { try { sql.closeConnection && sql.closeConnection(); } catch (_) {} });

