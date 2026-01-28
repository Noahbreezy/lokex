const Api = require("../general/api.js");
const mysql = require("mysql2");
const zlib = require('zlib');
require('dotenv').config();

class Encryption {

    constructor() {
    }

    shouldUseXor(password) {
        return typeof password === 'string' && password.length > 0;
    }

    _toJsonString(input) {
        if (typeof input === 'string') return input;
        if (input === undefined) return '';
        try {
            return JSON.stringify(input);
        } catch (_) {
            return String(input);
        }
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
        const text = this._toJsonString(plaintext);

        // Websocket payloads in this project expect a base64 string.
        // If XOR is enabled, we XOR first then base64.
        // If XOR is not enabled, we base64 the plaintext JSON.
        if (this.shouldUseXor(password)) {
            const xorEncrypted = await this.decryptXor(text, password);
            return this.encryptBase64(xorEncrypted);
        }

        return this.encryptBase64(text);
    }

    async decryptXorMessage(message, password) {
        // If the server already returned JSON (object or JSON string), bypass XOR.
        if (message && typeof message === 'object') {
            return this._toJsonString(message);
        }
        if (typeof message === 'string') {
            const trimmed = message.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                return message;
            }
        }


        // Decrypt the Base64 layer first (always present for websocket payloads)
        const base64Decrypted = await this.decryptBase64(message);

        // If XOR is disabled, base64-decoded text is the plaintext JSON.
        if (!this.shouldUseXor(password)) {
            return base64Decrypted;
        }

        // Otherwise, XOR-decrypt after base64.
        return this.decryptXor(base64Decrypted, password);
    }

    async buildRequestBody(payload, password) {
        // For XOR-enabled endpoints, the API expects { json: "<base64>" }.
        // For non-XOR environments (empty/absent password), the API expects plain JSON.
        if (this.shouldUseXor(password)) {
            const encrypted = await this.createXorMessage(payload, password);
            return { json: encrypted };
        }

        if (payload && typeof payload === 'object') return payload;
        if (typeof payload === 'string') {
            try {
                return JSON.parse(payload);
            } catch (_) {
                return {};
            }
        }
        return {};
    }

    async decodeGunzip(payload) {
        return new Promise((resolve, reject) => {
            zlib.gunzip(Buffer.from(payload, 'base64'), (err, buffer) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(buffer.toString());
                }
            });
        });
    }
}

module.exports = Encryption;
