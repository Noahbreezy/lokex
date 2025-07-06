const mysql = require("mysql2");
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const { client: WebSocketClient } = require('websocket');

class Api {

    constructor(sql) {

        this.sql = sql;
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
        const response = await axios.post(url, body, config);

        return response;
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
            useProxy = true
        } = options;

        // Fetch proxies from the database if using proxy
        let proxyUrl = null;
        if (useProxy) {
            const proxies = await this.sql.getProxies();
            // proxies.push({ ip: null }); // Add a null option to possibly make a request without a proxy
            const randomIndex = Math.floor(Math.random() * proxies.length);
            proxyUrl = proxies[randomIndex].ip;
            // console.log(`Using proxy for WebSocket: ${proxyUrl}`);
        }

        // Set up the HTTPS proxy agent if a proxy URL is selected
        const agent = proxyUrl ? new HttpsProxyAgent(`http://${proxyUrl}:3128`) : null;

        // Create WebSocket client
        const wsClient = new WebSocketClient({
            ...(agent && { webSocketAgent: agent }) // Conditionally add the agent
        });

        return new Promise((resolve, reject) => {
            // Handle connection failure
            wsClient.on('connectFailed', (error) => {
                onError(error);
                reject(error);
            });

            // Handle successful connection
            wsClient.on('connect', (connection) => {
                onConnect(connection);

                // Set up event handlers
                connection.on('message', (message) => onMessage(message, connection));
                connection.on('error', (error) => onError(error, connection));
                connection.on('close', () => onClose(connection));

                resolve(connection);
            });

            // Initiate WebSocket connection
            wsClient.connect(url, null, null, headers);
        });
    }
}

module.exports = Api;
