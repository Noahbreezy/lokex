const Api = require("../general/api.js");
const mysql = require("mysql2");
const zlib = require('zlib');
require('dotenv').config();

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
