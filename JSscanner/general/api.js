const mysql = require("mysql2");
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const { client: WebSocketClient } = require('websocket');
const Encryption = require('../encryption/encryption.js');

class Api {

    constructor(sql) {

        this.sql = sql;
        this.usedIPs = new Map(); // legacy (unused now for selection)
        this.globalUsedIPs = new Set(); // new global pool of in-use proxies
        this.connectionToIP = new Map();
        this.proxyBlacklist = new Map(); // ip -> expiry timestamp (ms)

        // Proxy ranking (fastest-first) for websocket usage
        this.proxyRanking = []; // array of ip strings
        this.proxyRankingAt = 0; // ms timestamp

    }

    _rankingFresh(maxAgeMs = 15 * 60 * 1000) {
        return Array.isArray(this.proxyRanking) && this.proxyRanking.length > 0 && (Date.now() - this.proxyRankingAt) <= maxAgeMs;
    }

    async rankProxiesForWebSocket(urlBase, token, options = {}) {
        // Tests proxies by actually connecting to the websocket and completing: 0/40 handshake -> /field/enter/v3 -> /zone/enter/list/v4 -> /field/objects/v4
        // Stores fastest-first list in this.proxyRanking
        const {
            maxProxies = 25,
            timeoutMs = 20000,
            concurrency = 5,
            port = 3128,
            origin = 'https://play.leagueofkingdoms.com',
            userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0',
            xorPassword = null,
        } = options;
        if (!token) throw new Error('rankProxiesForWebSocket: missing token');
        const proxies = await this.sql.getProxies();
        const candidates = (proxies || []).map(p => p && p.ip).filter(Boolean).slice(0, maxProxies);
        if (candidates.length === 0) {
            this.proxyRanking = [];
            this.proxyRankingAt = Date.now();
            return [];
        }
        const url = `${urlBase}${urlBase.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
        const headers = {
            'Origin': origin,
            'User-Agent': userAgent,
            'Accept': '*/*',
        };
        const encryption = new Encryption();

        const testOne = async (ip) => {
            const agent = new HttpsProxyAgent(`http://${ip}:${port}`);
            const wsClient = new WebSocketClient({ webSocketAgent: agent });
            const t0 = Date.now();
            let tConnect = null;
            let tEnterSent = null;
            let tZonesSent = null;
            let worldId = null;
            let done = false;

            return await new Promise((resolve) => {
                let conn = null;
                const hard = setTimeout(() => {
                    if (done) return;
                    done = true;
                    try { conn && conn.close(); } catch (_) {}
                    resolve({ ip, ok: false, error: 'timeout' });
                }, timeoutMs);
                if (typeof hard.unref === 'function') hard.unref();

                wsClient.on('connectFailed', (error) => {
                    if (done) return;
                    done = true;
                    clearTimeout(hard);
                    resolve({ ip, ok: false, error: String(error && error.message || error) });
                });

                wsClient.on('connect', (connection) => {
                    conn = connection;
                    tConnect = Date.now();

                    connection.on('close', () => {
                        if (done) return;
                        done = true;
                        clearTimeout(hard);
                        resolve({ ip, ok: false, error: 'closed' });
                    });

                    connection.on('message', async (message) => {
                        if (done) return;
                        if (message.type !== 'utf8') return;
                        const s = message.utf8Data;

                        if (s.startsWith('0')) {
                            try { connection.sendUTF('40'); } catch (_) {}
                            return;
                        }
                        if (s === '2') {
                            try { connection.sendUTF('3'); } catch (_) {}
                            return;
                        }
                        if (s.startsWith('40')) {
                            if (!tEnterSent) {
                                tEnterSent = Date.now();
                                const enc = await encryption.createXorMessage({ token }, xorPassword);
                                try { connection.sendUTF(`42["/field/enter/v3", ${JSON.stringify(enc)}]`); } catch (_) {}
                            }
                            return;
                        }
                        if (!s.startsWith('42[')) return;
                        let parsed;
                        try { parsed = JSON.parse(s.substring(2)); } catch (_) { return; }
                        const [event, payload] = parsed;
                        if (event === '/field/enter/v3') {
                            // derive zonesX from map and pick a tiny 2x2 block in top-left
                            let zones = [0, 96, 1, 97];
                            worldId = null;
                            try {
                                const payloadStr = payload && payload.Payload;
                                const decoded = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : (payloadStr || null);
                                const loc0 = decoded && Array.isArray(decoded.loc) ? Number(decoded.loc[0]) : NaN;
                                if (Number.isFinite(loc0)) worldId = loc0;
                                const w = decoded && decoded.map && decoded.map.width;
                                const zx = Number(w) / 32;
                                if (Number.isInteger(zx) && zx > 0) {
                                    zones = [0, zx, 1, zx + 1];
                                }
                            } catch (_) {}
                            if (!Number.isFinite(worldId)) {
                                // If we can't parse a worldId, still attempt, but this proxy won't be considered "good" unless objects arrive.
                                worldId = 0;
                            }
                            const enc = await encryption.createXorMessage({ world: worldId, zones: JSON.stringify(zones) }, xorPassword);
                            tZonesSent = Date.now();
                            try { connection.sendUTF(`42["/zone/enter/list/v4", ${JSON.stringify(enc)}]`); } catch (_) {}
                            return;
                        }
                        if (event === '/field/objects/v4') {
                            let objectCount = null;
                            try {
                                let decoded = null;
                                if (payload && typeof payload.Payload === 'string') decoded = JSON.parse(payload.Payload);
                                else if (payload && payload.Payload && typeof payload.Payload === 'object') decoded = payload.Payload;
                                objectCount = Array.isArray(decoded && decoded.objects) ? decoded.objects.length : 0;
                            } catch (_) { objectCount = null; }
                            done = true;
                            clearTimeout(hard);
                            const tDone = Date.now();
                            try { connection.close(); } catch (_) {}
                            resolve({
                                ip,
                                ok: Number.isFinite(objectCount) && objectCount > 0,
                                connectMs: tConnect ? (tConnect - t0) : null,
                                enterMs: tEnterSent ? (tZonesSent - tEnterSent) : null,
                                objectsMs: tZonesSent ? (tDone - tZonesSent) : null,
                                objectCount,
                                worldId,
                            });
                        }
                    });
                });

                wsClient.connect(url, null, null, headers);
            });
        };

        const results = [];
        const queue = candidates.filter(ip => ip && !this._isBlacklisted(ip));
        const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
            while (queue.length) {
                const ip = queue.shift();
                // eslint-disable-next-line no-await-in-loop
                const r = await testOne(ip);
                results.push(r);
            }
        });
        await Promise.all(workers);

        const ok = results
            .filter(r => r && r.ok && Number.isFinite(r.objectsMs))
            .sort((a, b) => a.objectsMs - b.objectsMs);

        this.proxyRanking = ok.map(r => r.ip);
        this.proxyRankingAt = Date.now();
        return results;
    }

    // Remove expired blacklist entries and report if still active
    _isBlacklisted(ip) {
        if (!ip) return false;
        const exp = this.proxyBlacklist.get(ip);
        if (!exp) return false;
        if (Date.now() > exp) {
            this.proxyBlacklist.delete(ip);
            return false;
        }
        return true;
    }

    _blacklist(ip, msDuration) {
        if (!ip) return;
        this.proxyBlacklist.set(ip, Date.now() + msDuration);
    }

    resetProxyUsage(options = {}) {
        const { includeBlacklist = false } = options;
        this.globalUsedIPs.clear();
        if (includeBlacklist) this.proxyBlacklist.clear();
        console.log(`Proxy usage reset${includeBlacklist ? ' (including blacklist)' : ''}.`);
    }

    async request(url, body, header) {
        // Fetch proxies from the database
        const proxies = await this.sql.getProxies();
        proxies.push({ ip: null }); // Add a null option to possibly make a request without a proxy

        // Randomly select a proxy from the list
        const randomIndex = Math.floor(Math.random() * proxies.length);
        const proxyUrl = proxies[randomIndex].ip;
        // console.log(`Using proxy: ${proxyUrl}`);

        // Set up the HTTPS proxy agent if a proxy URL is selected
        const httpsAgent = proxyUrl ? new HttpsProxyAgent(`http://${proxyUrl}:3128`) : null;

        // Configure the request headers and proxy agent if applicable
        const config = {
            headers: header,
            ...(httpsAgent && { httpsAgent }) // Conditionally add the httpsAgent if it exists
        };

        // Make the Axios POST request
        let response;
        try {
            response = await axios.post(url, body, config);
            if (response.status !== 200) {
            console.error(`Request with IP ${proxyUrl} failed with status ${response.status}`);
            }
        } catch (error) {
            console.error(`Request with IP ${proxyUrl} threw`, error);
            throw error;
        }

        return response;
    }

    async requestNoProxy(url, body, header) {
        const config = {
            headers: header
        };

        try {
            const response = await axios.post(url, body, config);
            if (response.status !== 200) {
                console.error(`Request without proxy failed with status ${response.status}`);
            }
            return response;
        } catch (error) {
            console.error('Request without proxy threw', error);
            throw error;
        }
    }

    async requestIgnore403(url, body, header) {
        const proxies = await this.sql.getProxies();
        proxies.push({ ip: null });

        const randomIndex = Math.floor(Math.random() * proxies.length);
        const proxyUrl = proxies[randomIndex].ip;
        const httpsAgent = proxyUrl ? new HttpsProxyAgent(`http://${proxyUrl}:3128`) : null;
        const config = {
            headers: header,
            ...(httpsAgent && { httpsAgent })
        };

        try {
            const response = await axios.post(url, body, config);
            if (response.status !== 200) {
                console.error(`Request with IP ${proxyUrl} failed with status ${response.status}`);
            }
            return response;
        } catch (error) {
            if (error && error.response && error.response.status === 403) {
                return null;
            }
            console.error(`Request with IP ${proxyUrl} threw`, error);
            throw error;
        }
    }

    async get(url, header) {
        // Fetch proxies from the database
        const proxies = await this.sql.getProxies();
        proxies.push({ ip: null }); // Add a null option to possibly make a request without a proxy

        // Randomly select a proxy from the list
        const randomIndex = Math.floor(Math.random() * proxies.length);
        const proxyUrl = proxies[randomIndex].ip;
        // console.log(`Using proxy: ${proxyUrl}`);

        // Set up the HTTPS proxy agent if a proxy URL is selected
        const httpsAgent = proxyUrl ? new HttpsProxyAgent(`http://${proxyUrl}:3128`) : null;

        // Configure the request headers and proxy agent if applicable
        const config = {
            method: 'get',
            url: url,
            headers: header,
            ...(httpsAgent && { httpsAgent })
        };

        // Make the Axios GET request
        const response = await axios(config);
        return response;
    }

    async getStream(url, header) {
        // Fetch proxies from the database
        const proxies = await this.sql.getProxies();
        proxies.push({ ip: null }); // Add a null option to possibly make a request without a proxy

        // Randomly select a proxy from the list
        const randomIndex = Math.floor(Math.random() * proxies.length);
        const proxyUrl = proxies[randomIndex].ip;
        // console.log(`Using proxy: ${proxyUrl} for stream`);

        // Set up the HTTPS proxy agent if a proxy URL is selected
        const httpsAgent = proxyUrl ? new HttpsProxyAgent(`http://${proxyUrl}:3128`) : null;

        // Configure the request for a GET stream
        const config = {
            method: 'get',
            url: url,
            headers: header,
            responseType: 'stream', // Ensure the response is a stream
            ...(httpsAgent && { httpsAgent }) // Conditionally add the httpsAgent if it exists
        };

        // Make the Axios GET request with stream response
        const response = await axios(config);

        return response;
    }

    async connectWebSocket(url, options = {}) {
        const {
            headers = {},
            onConnect = () => {},
            onMessage = () => {},
            onError = () => {},
            onClose = () => {},
            useProxy = true,
            guild
        } = options;
        // Select proxy only after successful connect (avoid leaking on failed handshakes)
        let proxyUrl = null;
        let agent = null;
        let candidateProxy = null;
        if (useProxy) {
            const proxies = await this.sql.getProxies();
            const allIps = (proxies || []).map(p => p && p.ip).filter(Boolean);

            const pickFromList = (ips) => {
                for (const ip of ips) {
                    if (!ip) continue;
                    if (this.globalUsedIPs.has(ip)) continue;
                    if (this._isBlacklisted(ip)) continue;
                    return ip;
                }
                return null;
            };

            // Prefer ranked proxies if we have a fresh ranking.
            if (this._rankingFresh()) {
                candidateProxy = pickFromList(this.proxyRanking);
            }

            // Otherwise (or if ranked proxies are all in use), pick from any available.
            if (!candidateProxy) {
                let available = allIps.filter(ip => !this.globalUsedIPs.has(ip) && !this._isBlacklisted(ip));
                if (available.length === 0 && allIps.length > 0) {
                    // recycle used set but still respect blacklist
                    this.globalUsedIPs.clear();
                    available = allIps.filter(ip => !this._isBlacklisted(ip));
                }
                if (available.length > 0) {
                    const idx = Math.floor(Math.random() * available.length);
                    candidateProxy = available[idx];
                }
            }

            if (candidateProxy) {
                agent = new HttpsProxyAgent(`http://${candidateProxy}:3128`);
            }
        }
        const wsClient = new WebSocketClient({ ...(agent && { webSocketAgent: agent }) });

        return new Promise((resolve, reject) => {
            // Handle connection failure
            wsClient.on('connectFailed', (error) => {
                // Blacklist only on 403 (Forbidden), NOT on 502 or others
                if (candidateProxy && /\b403\b/.test(String(error && error.message))) {
                    this._blacklist(candidateProxy, 2 * 60 * 60 * 1000); // 2 hours
                    console.log(`Blacklisting proxy ${candidateProxy} for 2h due to 403.`);
                }
                onError(error);
                reject(error);
            });

            // Handle successful connection
            wsClient.on('connect', (connection) => {
                // mark proxy as used only now (successful)
                if (candidateProxy) {
                    proxyUrl = candidateProxy;
                    this.globalUsedIPs.add(proxyUrl);
                    this.connectionToIP.set(connection, proxyUrl);
                }
                onConnect(connection, proxyUrl || null);

                // Set up event handlers
                connection.on('message', (message) => onMessage(message, connection));
                connection.on('error', (error) => onError(error, connection));
                const wrappedOnClose = (code, description) => {
                    const ip = this.connectionToIP.get(connection);
                    if (ip) {
                        this.globalUsedIPs.delete(ip);
                        this.connectionToIP.delete(connection);
                    }
                    try {
                        onClose(connection, code, description);
                    } catch (_) {
                        // Fallback for older callsites
                        try { onClose(connection); } catch (__){ /* noop */ }
                    }
                };
                connection.on('close', wrappedOnClose);

                resolve(connection);
            });

            // Initiate WebSocket connection
            wsClient.connect(url, null, null, headers);
        });
    }
}

module.exports = Api;
