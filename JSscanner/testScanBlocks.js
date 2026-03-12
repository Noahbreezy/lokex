#!/usr/bin/env node

/*
Standalone websocket test script.

Purpose:
- Connect to the LOK websocket (optionally via a single proxy)
- Perform the socket.io handshake
- Send /field/enter/v3
- Request 2–3 zone blocks and log request + response (raw + decoded)

Usage examples:
  LOK_WS_TOKEN='...' LOK_WORLD=106 node lokex/scanner/testScanBlocks.js
  LOK_WS_TOKEN='...' LOK_WORLD=106 LOK_XOR_PASS='' node lokex/scanner/testScanBlocks.js
  LOK_WS_TOKEN='...' LOK_WORLD=106 LOK_PROXY='165.22.20.32:3128' node lokex/scanner/testScanBlocks.js

Optional env:
  LOK_ORIGIN='https://play.leagueofkingdoms.com'
  LOK_UA='Mozilla/5.0 ...'
  LOK_LOG_FILE='/tmp/lok-ws-test.log'
  LOK_FULL=1                       # dump full payload JSON
  LOK_BLOCKS='0,96,1,97;8937,9033,9129,8938,9034,9130,8939,9035,9131'
  LOK_BLOCK_TIMEOUT_MS=45000
  LOK_DELAY_MS=100
	LOK_SHOW_SENSITIVE=1             # log full outbound frames (includes base64 token)
	LOK_RAW=1                        # log every raw inbound frame (can be huge)
*/

const fs = require('fs');
const path = require('path');
const { client: WebSocketClient } = require('websocket');
const { HttpsProxyAgent } = require('https-proxy-agent');

const Encryption = require('../encryption/encryption.js');

const WEBSOCKET_BASE = 'wss://socf-lok-live.leagueofkingdoms.com/socket.io/?EIO=4&transport=websocket';

function envBool(value, defaultValue = false) {
	if (value === undefined || value === null || value === '') return defaultValue;
	return /^(1|true|yes)$/i.test(String(value));
}

function maskToken(t) {
	if (!t) return 'null';
	const s = String(t);
	if (s.length <= 8) return `***${s}`;
	return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function nowIso() {
	return new Date().toISOString();
}

function safeJsonStringify(obj) {
	try {
		return JSON.stringify(obj);
	} catch (_) {
		return '[unstringifiable]';
	}
}

function parseBlocks(blocksStr) {
	// Format: "0,96,1,97;8937,9033,9129"
	if (!blocksStr) return null;
	return String(blocksStr)
		.split(';')
		.map(s => s.trim())
		.filter(Boolean)
		.map(group => group.split(',').map(n => Number(n.trim())).filter(Number.isFinite));
}

function makeLogger(logFilePath) {
	let stream = null;
	if (logFilePath) {
		const abs = path.isAbsolute(logFilePath) ? logFilePath : path.join(process.cwd(), logFilePath);
		stream = fs.createWriteStream(abs, { flags: 'a' });
	}
	return {
		line(msg) {
			const out = `${nowIso()} ${msg}`;
			console.log(out);
			if (stream) stream.write(out + '\n');
		},
		close() {
			try { stream && stream.end(); } catch (_) {}
		}
	};
}

async function main() {
	const token = process.env.LOK_WS_TOKEN || process.env.SCANNER_TEST_TOKEN || process.env.TOKEN;
	const world = Number(process.env.LOK_WORLD || process.env.WORLD || process.env.CONTINENT);
	const xorPass = (process.env.LOK_XOR_PASS !== undefined)
		? process.env.LOK_XOR_PASS
		: (process.env.XOR_PASS !== undefined ? process.env.XOR_PASS : '');

	if (!token) {
		console.error('Missing token. Set LOK_WS_TOKEN.');
		process.exit(2);
	}
	if (!Number.isFinite(world)) {
		console.error('Missing/invalid world. Set LOK_WORLD to a number.');
		process.exit(2);
	}

	const full = envBool(process.env.LOK_FULL, false);
	const raw = envBool(process.env.LOK_RAW, false);
	const showSensitive = envBool(process.env.LOK_SHOW_SENSITIVE, false);
	const log = makeLogger(process.env.LOK_LOG_FILE);
	const delayMs = Number.isFinite(Number(process.env.LOK_DELAY_MS)) ? Number(process.env.LOK_DELAY_MS) : 100;
	const blockTimeoutMs = Number.isFinite(Number(process.env.LOK_BLOCK_TIMEOUT_MS)) ? Number(process.env.LOK_BLOCK_TIMEOUT_MS) : 45000;

	const proxy = process.env.LOK_PROXY; // e.g. "165.22.20.32:3128" (or with scheme)
	const origin = process.env.LOK_ORIGIN || 'https://play.leagueofkingdoms.com';
	const userAgent = process.env.LOK_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0';

	const url = `${WEBSOCKET_BASE}&token=${token}`;
	log.line(`[test] Starting. world=${world} token=${maskToken(token)} xor=${xorPass ? 'yes' : 'no'} urlBase=${WEBSOCKET_BASE}`);

	const headers = {
		'User-Agent': userAgent,
		'Origin': origin,
		'Accept': '*/*',
	};

	let agent = null;
	if (proxy) {
		const proxyUrl = proxy.includes('://') ? proxy : `http://${proxy}`;
		agent = new HttpsProxyAgent(proxyUrl);
		log.line(`[test] Using proxy: ${proxyUrl}`);
	} else {
		log.line('[test] No proxy.');
	}

	const wsClient = new WebSocketClient({ ...(agent && { webSocketAgent: agent }) });
	const encryption = new Encryption();

	let connection = null;
	let sentSocketIoOpen = false;
	let entered = false;
	let zonesX = null;
	let zonesY = null;

	let currentBlockIndex = -1;
	let blocks = parseBlocks(process.env.LOK_BLOCKS);
	let awaitingObjectsForBlock = false;
	let blockTimer = null;

	function clearBlockTimer() {
		if (blockTimer) {
			clearTimeout(blockTimer);
			blockTimer = null;
		}
	}

	function startBlockTimer() {
		clearBlockTimer();
		blockTimer = setTimeout(() => {
			log.line(`[timeout] No /field/objects/v4 within ${blockTimeoutMs}ms. Closing.`);
			try { connection && connection.close(); } catch (_) {}
		}, blockTimeoutMs);
		if (typeof blockTimer.unref === 'function') blockTimer.unref();
	}

	function redactOutboundFrame(frame) {
		if (showSensitive) return frame;
		// Redact base64 payloads in the two event types that contain the token.
		// 42["/field/enter/v3", "<base64>"]
		// 42["/zone/enter/list/v4", "<base64>"]
		const m = frame.match(/^42\["(\/field\/enter\/v3|\/zone\/enter\/list\/v4)",\s*(".*")\]$/);
		if (m) {
			try {
				const base64 = JSON.parse(m[2]);
				if (typeof base64 === 'string') {
					return `42["${m[1]}", "<base64 len=${base64.length}>" ]`;
				}
			} catch (_) {}
		}
		return frame;
	}

	function recvPreview(str) {
		if (raw || full) return str;
		if (!str || str.length <= 800) return str;
		return str.slice(0, 800) + '...';
	}

	function sendUtf(frame, label) {
		log.line(`[send] ${label}: ${redactOutboundFrame(frame)}`);
		connection.sendUTF(frame);
	}

	async function delay(ms) {
		return new Promise(r => setTimeout(r, ms));
	}

	async function sendEnter() {
		const enc = await encryption.createXorMessage({ token }, xorPass || null);
		const frame = `42["/field/enter/v3", ${JSON.stringify(enc)}]`;
		log.line(`[info] enter payload len=${String(enc).length} (base64)`);
		sendUtf(frame, '/field/enter/v3');
		entered = true;
	}

	function computeDefaultBlocks() {
		if (!Number.isFinite(zonesX) || !Number.isFinite(zonesY)) return [];
		// Single deterministic block: top-left 3x3.
		return [block(zonesX, 0, 0, 3)];
	}

	function block(zx, x0, y0, size) {
		const out = [];
		for (let dy = 0; dy < size; dy++) {
			for (let dx = 0; dx < size; dx++) {
				out.push((x0 + dx) + zx * (y0 + dy));
			}
		}
		return out;
	}

	async function sendLeave(zones) {
		const payload = safeJsonStringify({ world, zones: safeJsonStringify(zones) });
		const frame = `42["/zone/leave/list/v2", ${payload}]`;
		sendUtf(frame, '/zone/leave/list/v2');
	}

	async function sendEnterZones(zones) {
		const payloadObj = { world, zones: safeJsonStringify(zones) };
		const enc = await encryption.createXorMessage(payloadObj, xorPass || null);
		const frame = `42["/zone/enter/list/v4", ${JSON.stringify(enc)}]`;
		log.line(`[info] enter/list payload len=${String(enc).length} zones=${zones.length}`);
		sendUtf(frame, '/zone/enter/list/v4');
		awaitingObjectsForBlock = true;
		startBlockTimer();
	}

	async function advanceBlock() {
		// This script intentionally requests ONLY ONE block.
		if (!blocks || blocks.length === 0) return;
		currentBlockIndex += 1;
		if (currentBlockIndex >= 1) {
			log.line('[test] Completed single requested block. Closing.');
			try { connection && connection.close(); } catch (_) {}
			return;
		}
		const zones = blocks[0];
		log.line(`[test] Requesting single block: zones=${zones.join(',')}`);
		await sendEnterZones(zones);
	}

	wsClient.on('connectFailed', (error) => {
		log.line(`[ws] connectFailed: ${String(error && error.message || error)}`);
		log.close();
		process.exit(1);
	});

	wsClient.on('connect', (conn) => {
		connection = conn;
		log.line('[ws] connected');

		connection.on('error', (err) => {
			log.line(`[ws] error: ${String(err && err.message || err)}`);
		});

		connection.on('close', (code, desc) => {
			log.line(`[ws] close: code=${code} desc=${desc || ''}`);
			clearBlockTimer();
			log.close();
			process.exit(0);
		});

		connection.on('message', async (message) => {
			if (message.type !== 'utf8') {
				log.line(`[recv] non-utf8 type=${message.type}`);
				return;
			}
			const dataStr = message.utf8Data;
			log.line(`[recv] ${recvPreview(dataStr)}`);

			if (dataStr.startsWith('0')) {
				try {
					const open = JSON.parse(dataStr.slice(1));
					log.line(`[info] engine.io open: pingInterval=${open.pingInterval} pingTimeout=${open.pingTimeout} maxPayload=${open.maxPayload}`);
				} catch (_) {}
				if (!sentSocketIoOpen) {
					sendUtf('40', 'socket.io open');
					sentSocketIoOpen = true;
				}
				return;
			}

			if (dataStr === '2') {
				// ping
				sendUtf('3', 'pong');
				return;
			}

			if (dataStr.startsWith('40')) {
				// socket.io open/ack
				if (!entered) {
					await sendEnter();
				}
				return;
			}

			if (!dataStr.startsWith('42[')) return;

			let parsed;
			try {
				parsed = JSON.parse(dataStr.substring(2));
			} catch (e) {
				log.line(`[err] failed to parse event frame: ${String(e)}`);
				return;
			}

			const [event, payload] = parsed;
			log.line(`[event] ${event} payloadType=${typeof payload}`);

			if (event === '/field/enter/v3') {
				// decode enter payload to compute map and default blocks
				try {
					const payloadStr = payload && payload.Payload;
					const decoded = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : (payloadStr || null);
					const w = decoded && decoded.map && decoded.map.width;
					const h = decoded && decoded.map && decoded.map.height;
					zonesX = Number(w) / 32;
					zonesY = Number(h) / 32;
					log.line(`[enter] map width=${w} height=${h} zonesX=${zonesX} zonesY=${zonesY}`);
				} catch (e) {
					log.line(`[enter] decode failed: ${String(e)}`);
				}

				if (!blocks || blocks.length === 0) {
					blocks = computeDefaultBlocks();
					log.line(`[test] Using default single block: [${blocks[0].join(',')}]`);
				} else {
					// If multiple blocks are provided, we only use the first.
					blocks = [blocks[0]];
					log.line(`[test] Using LOK_BLOCKS (first block only): [${blocks[0].join(',')}]`);
				}

				await delay(delayMs);
				await sendLeave([]);
				await delay(delayMs);
				await advanceBlock();
				return;
			}

			if (event === '/field/objects/v4') {
				// decode objects
				clearBlockTimer();
				awaitingObjectsForBlock = false;

				let decoded = null;
				try {
					if (payload && typeof payload.Payload === 'string') {
						decoded = JSON.parse(payload.Payload);
					} else if (payload && payload.Payload && typeof payload.Payload === 'object') {
						decoded = payload.Payload;
					} else if (payload && typeof payload === 'object' && payload.objects) {
						decoded = payload;
					}
				} catch (e) {
					log.line(`[objects] decode failed: ${String(e)}`);
				}

				const objects = (decoded && decoded.objects) ? decoded.objects : null;
				const count = Array.isArray(objects) ? objects.length : null;
				log.line(`[objects] decodedObjects=${count === null ? 'n/a' : count} blockIndex=${currentBlockIndex + 1}`);

				if (Array.isArray(objects) && objects.length > 0) {
					const first = objects[0];
					log.line(`[objects] first: _id=${first._id} loc=${safeJsonStringify(first.loc)} code=${first.code} level=${first.level}`);
				}

				if (full) {
					log.line(`[objects] decoded: ${safeJsonStringify(decoded)}`);
				} else {
					// If Payload is a giant JSON string, log a preview.
					if (payload && typeof payload.Payload === 'string') {
						log.line(`[objects] payloadPreview: ${payload.Payload.slice(0, 400)}${payload.Payload.length > 400 ? '...' : ''}`);
					}
				}

				// Leave the block we just entered, then close.
				const currentZones = blocks && blocks[currentBlockIndex];
				if (Array.isArray(currentZones)) {
					await delay(delayMs);
					await sendLeave(currentZones);
				}
				await delay(delayMs);
				log.line('[test] Done. Closing after single block.');
				try { connection && connection.close(); } catch (_) {}
				return;
			}

			if (event === '/march/objects' || event === '/march/object/update') {
				// not relevant for this test
				return;
			}
		});

		// Kickstart by sending socket.io open immediately (some servers accept this before 0{...}).
		try {
			sendUtf('40', 'socket.io open (eager)');
			sentSocketIoOpen = true;
		} catch (_) {}
	});

	wsClient.connect(url, null, null, headers);
}

main().catch((e) => {
	console.error('Fatal:', e);
	process.exit(1);
});
