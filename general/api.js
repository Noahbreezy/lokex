const mysql = require("mysql2");
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');

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
}

module.exports = Api;

async function runExample() {
    try {
        const test = await new Api().request(
            "https://api-lok-live.leagueofkingdoms.com/api/kingdom/treasure/list",
            {
                "x-access-token": `eeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjMiLCJraW5nZG9tSWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjQiLCJ3b3JsZElkIjoyNCwidmVyc2lvbiI6MTc3NSwiYXV0aFR5cGUiOiJnb29nbGUiLCJwbGF0Zm9ybSI6IndlYiIsInRpbWUiOjE3MTk2OTIyMzg3OTcsImNsaWVudFhvciI6IjAiLCJpcCI6Ijk0LjIyNS42Ny4zIiwiaWF0IjoxNzE5NjkyMjM4LCJleHAiOjE3MjAyOTcwMzgsImlzcyI6Im5vZGdhbWVzLmNvbSIsInN1YiI6InVzZXJJbmZvIn0.1zYPyP5UiChJT1eJA6MiQMw2PWKNzPFM7Cfsdqk7N6U`,
                "Content-Type": "application/json",
            },
            { kingdomId: "617d60127e6b940dd780aa95" }
        );
        console.log(test.data);
    } catch (error) {
        console.error(error);
    }
}

// Call the async function
//runExample();