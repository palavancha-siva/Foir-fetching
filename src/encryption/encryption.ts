import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import options from "../../config/options";
import { ApiResponseEnvelope, CustomRequest } from "../types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard GCM IV length

const activeOptions = (options as any)?.default || options;
const DEFAULT_ENCRYPTION_KEY = activeOptions?.encryptionKey || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function getKeyBuffer(keyHexOrPlain: string = DEFAULT_ENCRYPTION_KEY): Buffer {
    const keyStr = String(keyHexOrPlain || DEFAULT_ENCRYPTION_KEY);
    if (keyStr.length === 64) {
        return Buffer.from(keyStr, "hex");
    }
    // Pad or hash to 32 bytes
    return crypto.createHash("sha256").update(keyStr).digest();
}

export function encrypt(plainText: string, keyString: string = DEFAULT_ENCRYPTION_KEY): string {
    const key = getKeyBuffer(keyString);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, "utf8", "base64");
    encrypted += cipher.final("base64");
    const authTag = cipher.getAuthTag();

    // Packed format: iv:authTag:ciphertext (all base64)
    return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decrypt(cipherString: string, keyString: string = options.encryptionKey): string {
    const parts = cipherString.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted payload format (expected iv:authTag:cipher).");
    }

    const [ivB64, authTagB64, encryptedB64] = parts;
    const key = getKeyBuffer(keyString);
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedB64, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

/**
 * Incoming request decryption middleware:
 * { data: "<cipher>" } -> plain req.body
 * Skipped if header `x-api-encrypt: false`
 */
export function decryptionMiddleware(req: CustomRequest, _res: Response, next: NextFunction): void {
    const skipHeader = req.headers["x-api-encrypt"];
    if (skipHeader === "false" || skipHeader === "0") {
        return next();
    }

    if (req.body && typeof req.body.data === "string") {
        try {
            const decryptedString = decrypt(req.body.data);
            req.body = JSON.parse(decryptedString);
            req.isEncryptedPayload = true;
        } catch (err: any) {
            return next(new Error(`Failed to decrypt request body: ${err.message}`));
        }
    }

    next();
}

/**
 * Response encryption wrapper:
 * Encrypts response `data` field unless client sent `x-api-encrypt: false`.
 */
export function encryptionMiddleware(req: CustomRequest, res: Response, next: NextFunction): void {
    const originalJson = res.json.bind(res);

    res.json = function (body: any): Response {
        const skipHeader = req.headers["x-api-encrypt"];
        const forceEncrypt = req.headers["x-api-encrypt"] === "true" || req.isEncryptedPayload === true;

        if (skipHeader === "false" || skipHeader === "0" || !forceEncrypt || !body || typeof body !== "object") {
            return originalJson(body);
        }

        // If body has a data field and no error, encrypt data
        if (body.data !== undefined && body.data !== null && !body.error) {
            try {
                const plainJson = JSON.stringify(body.data);
                const cipher = encrypt(plainJson);
                body.data = cipher;
            } catch (err: any) {
                console.error("Response encryption failed:", err.message);
            }
        }

        return originalJson(body);
    };

    next();
}
