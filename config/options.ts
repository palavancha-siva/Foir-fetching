import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load backend/.env first if present, then standard dotenv fallback
const backendEnvPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(backendEnvPath)) {
    dotenv.config({ path: backendEnvPath });
}
dotenv.config();

export interface AppOptions {
    port: number;
    nodeEnv: string;
    databaseUrl: string;
    postgresSslMode: string;
    adminApiToken: string;
    encryptionKey: string;
    internalApiKey: string;
    jwtPrivateKeyPath: string;
    jwtPublicKeyPath: string;
    corsOrigin: string;
}

const port = Number(process.env.PORT || 5104);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port number.");
}

function resolveKeyPath(configuredPath?: string, defaultFileName = "jwtRS256.key"): string {
    if (!configuredPath) {
        return path.resolve(__dirname, "..", "keys", defaultFileName);
    }
    if (path.isAbsolute(configuredPath)) {
        return configuredPath;
    }
    const cwdPath = path.resolve(process.cwd(), configuredPath);
    if (fs.existsSync(cwdPath)) return cwdPath;
    const backendRel = path.resolve(__dirname, "..", configuredPath);
    if (fs.existsSync(backendRel)) return backendRel;
    return cwdPath;
}

const options: AppOptions = {
    port,
    nodeEnv: process.env.NODE_ENV || "development",
    databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/foir_data",
    postgresSslMode: process.env.PGSSLMODE || "disable",
    adminApiToken: process.env.ADMIN_API_TOKEN || "",
    encryptionKey: process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    internalApiKey: process.env.INTERNAL_API_KEY || "fin_internal_secret_key_crm_2026",
    jwtPrivateKeyPath: resolveKeyPath(process.env.JWT_PRIVATE_KEY_PATH, "jwtRS256.key"),
    jwtPublicKeyPath: resolveKeyPath(process.env.JWT_PUBLIC_KEY_PATH, "jwtRS256.key.pub"),
    corsOrigin: process.env.CORS_ORIGIN || "*"
};

module.exports = options;
(module.exports as any).default = options;
export default options;
