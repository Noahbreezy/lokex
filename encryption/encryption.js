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
        if (!this.shouldUseXor(password)) {
            // No XOR required for this environment/endpoint.
            // Return the plaintext that callers would normally obtain after decrypting.
            return text;
        }

        // Encrypt the message with XOR
        const xorEncrypted = await this.decryptXor(text, password);

        // Encrypt the XOR encrypted message with Base64
        const base64Encrypted = await this.encryptBase64(xorEncrypted);

        return base64Encrypted;
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

        if (!this.shouldUseXor(password)) {
            // Response is already plaintext. Normalize to string so existing
            // call sites that do JSON.parse(...) keep working.
            return this._toJsonString(message);
        }

        // Decrypt the Base64 encrypted message
        const base64Decrypted = await this.decryptBase64(message);

        // Decrypt the message with XOR
        const xorDecrypted = await this.decryptXor(base64Decrypted, password);

        return xorDecrypted;
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
