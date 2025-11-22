const mysql = require("mysql2");
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const { client: WebSocketClient } = require('websocket');

class Api {

    constructor(sql) {

        this.sql = sql;
        this.usedIPs = new Map(); // legacy (unused now for selection)
        this.globalUsedIPs = new Set(); // new global pool of in-use proxies
        this.connectionToIP = new Map();
        this.proxyBlacklist = new Map(); // ip -> expiry timestamp (ms)

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
            let available = proxies.filter(p => p && p.ip && !this.globalUsedIPs.has(p.ip) && !this._isBlacklisted(p.ip));
            if (available.length === 0 && proxies.length > 0) {
                // recycle used set but still respect blacklist
                this.globalUsedIPs.clear();
                available = proxies.filter(p => p && p.ip && !this._isBlacklisted(p.ip));
            }
            if (available.length > 0) {
                const idx = Math.floor(Math.random() * available.length);
                candidateProxy = available[idx].ip;
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
                const wrappedOnClose = () => {
                    const ip = this.connectionToIP.get(connection);
                    if (ip) {
                        this.globalUsedIPs.delete(ip);
                        this.connectionToIP.delete(connection);
                    }
                    onClose(connection);
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
