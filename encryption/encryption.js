const Api = require("../general/api.js");
const mysql = require("mysql2");

class Encryption {

    constructor() {
    }

    async decryptBase64(input) {
        let buff = Buffer.from(input, 'base64');
        let text = buff.toString('latin1');
        return text;
    };

    async encryptBase64(input) {
        let buff = Buffer.from(input, 'utf8');
        let base64data = buff.toString('base64');
        return base64data;
    }

    async getPass(input) {
        let match = input.match(/-(.*?)-/);
        return match ? match[1] : null;
    }

    async decryptXor(input, password) {
        if (!input || !password) {
            throw new Error('Input or password is missing');
        }

        const xor_password_length = password.length;
        const encoded = [];

        for (let index = 0; index < input.length; index++) {
            const each_input = input.charCodeAt(index);
            const xor_char = password.charCodeAt(index % xor_password_length);
            encoded.push(each_input ^ xor_char);
        }

        return Buffer.from(encoded).toString('utf8');
    }

    async createXorMessage(plaintext, password) {
        const encryption = new Encryption();
    
        // Encrypt the message with XOR
        const xorEncrypted = await this.decryptXor(plaintext, password);
    
        // Encrypt the XOR encrypted message with Base64
        const base64Encrypted = await this.encryptBase64(xorEncrypted);
    
        return base64Encrypted;
    }

    async decryptXorMessage(message, password) {
        const encryption = new Encryption();
    
        // Decrypt the Base64 encrypted message
        const base64Decrypted = await this.decryptBase64(message);
    
        // Decrypt the message with XOR
        const xorDecrypted = await this.decryptXor(base64Decrypted, password);
    
        return xorDecrypted;
    }
}

module.exports = Encryption;

//example usage
async function runExample() {

    const connection = mysql.createConnection({
        host: ***REMOVED***,
        user: ***REMOVED***,
        password: ***REMOVED***,
        database: "c24"
    });

    connection.connect(function (err) {
        if (err) throw err;
        console.log("Connected!");
    });

    const xorPass = await new Promise((resolve, reject) => {
        connection.query("SELECT value FROM `utils` WHERE `id` = 1", (error, results) => {
            if (error) {
                reject(error);
            } else {
                resolve(results[0].value);
            }
        });
    });

    const encryption = new Encryption();
    const api = new Api();

    try {
        const profileResponse = await api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/my",
            {json: "VRg="},
            {
                "x-access-token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjMiLCJraW5nZG9tSWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjQiLCJ3b3JsZElkIjozOCwidmVyc2lvbiI6MTc3NSwiYXV0aFR5cGUiOiJnb29nbGUiLCJwbGF0Zm9ybSI6IndlYiIsInRpbWUiOjE3MjI2MzE1NDAwMDYsImNsaWVudFhvciI6IjAiLCJpcCI6IjEwOS4xMzYuMjQwLjEzIiwiaWF0IjoxNzIyNjMxNTQwLCJleHAiOjE3MjMyMzYzNDAsImlzcyI6Im5vZGdhbWVzLmNvbSIsInN1YiI6InVzZXJJbmZvIn0.mg87xAdbhPzMozpJFhFDtx1SzxgDy3t2v5asnQzFEug",
                "Content-Type": "application/json",
            });

        if (profileResponse.status === 200 && profileResponse.data) {
            const encryptedData = profileResponse.data;
            const decryptedData = await encryption.decryptXor(await encryption.decryptBase64(encryptedData), xorPass);
            console.log("data: ", decryptedData);
        } else {
            console.error("Error: Failed to retrieve profile data");
        }
    } catch (error) {
        console.error("Error:", error.response.data);
        const encryptedErrorData = error.response.data;
        console.log("started decrypting error data");
        const decryptedErrorData = await encryption.decryptXor(await encryption.decryptBase64(encryptedErrorData), xorPass);
        console.log(decryptedErrorData);
    }

    connection.end();

}

// runExample();