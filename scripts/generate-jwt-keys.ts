// @ts-nocheck
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function generateJwtKeys() {
    const keysDir = path.join(__dirname, "..", "keys");
    if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
    }

    const privateKeyPath = path.join(keysDir, "jwtRS256.key");
    const publicKeyPath = path.join(keysDir, "jwtRS256.key.pub");

    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
        console.log("JWT RS256 keys already exist in", keysDir);
        return;
    }

    console.log("Generating RS256 key pair (2048-bit RSA)...");
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: "spki",
            format: "pem"
        },
        privateKeyEncoding: {
            type: "pkcs8",
            format: "pem"
        }
    });

    fs.writeFileSync(privateKeyPath, privateKey, { encoding: "utf8", mode: 0o600 });
    fs.writeFileSync(publicKeyPath, publicKey, { encoding: "utf8" });

    console.log("Successfully generated RS256 keys at:");
    console.log(" - Private key:", privateKeyPath);
    console.log(" - Public key: ", publicKeyPath);
}

generateJwtKeys();

