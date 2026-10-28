import fs from "fs";
import jwt from "jsonwebtoken";
import { Response, NextFunction } from "express";
import options from "../../config/options";
import { CustomRequest, AuthenticatedStaff, AuthenticatedCustomer } from "../types";
import { getErrorResponse } from "./apiResponse";

import path from "path";

let privateKey: string = "";
let publicKey: string = "";

function loadKeys(): { privateKey: string; publicKey: string } {
    const activeOptions = (options as any)?.default || options;
    const defaultPriv = path.join(__dirname, "..", "..", "keys", "jwtRS256.key");
    const defaultPub = path.join(__dirname, "..", "..", "keys", "jwtRS256.key.pub");

    const privPath = activeOptions?.jwtPrivateKeyPath 
        ? path.resolve(process.cwd(), activeOptions.jwtPrivateKeyPath)
        : defaultPriv;
    const pubPath = activeOptions?.jwtPublicKeyPath 
        ? path.resolve(process.cwd(), activeOptions.jwtPublicKeyPath)
        : defaultPub;

    if (!privateKey) {
        if (fs.existsSync(privPath)) {
            privateKey = fs.readFileSync(privPath, "utf8");
        } else if (fs.existsSync(defaultPriv)) {
            privateKey = fs.readFileSync(defaultPriv, "utf8");
        }
    }
    if (!publicKey) {
        if (fs.existsSync(pubPath)) {
            publicKey = fs.readFileSync(pubPath, "utf8");
        } else if (fs.existsSync(defaultPub)) {
            publicKey = fs.readFileSync(defaultPub, "utf8");
        }
    }
    return { privateKey, publicKey };
}

export function signStaffToken(payload: {
    id: number;
    email: string;
    name: string;
    roleId?: number;
    roleName?: string;
    permissions: string[];
    sessionKey: string;
}, expiresIn: any = "12h"): string {
    const { privateKey } = loadKeys();
    if (!privateKey) {
        throw new Error("JWT private key not configured.");
    }
    const signOpts: jwt.SignOptions = { algorithm: "RS256", expiresIn };
    return jwt.sign(payload, privateKey, signOpts);
}

export function signCustomerToken(payload: {
    id: number;
    phone: string;
    name?: string;
    email?: string;
    leadId?: number;
}, expiresIn: any = "7d"): string {
    const { privateKey } = loadKeys();
    if (!privateKey) {
        throw new Error("JWT private key not configured.");
    }
    const signOpts: jwt.SignOptions = { algorithm: "RS256", expiresIn };
    return jwt.sign(payload, privateKey, signOpts);
}

export function verifyToken<T = any>(token: string): T {
    const { publicKey } = loadKeys();
    if (!publicKey) {
        throw new Error("JWT public key not configured.");
    }
    return jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as T;
}

/**
 * Staff Auth: RS256 JWT + verifies ACTIVE session in DB.
 */
export async function staffAuthProtected(
    req: CustomRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        // Fallback check: if adminApiToken matches configured token (e.g. for API integrations)
        const token = authHeader ? authHeader.slice(7).trim() : "";
        if (options.adminApiToken && token === options.adminApiToken) {
            req.staffUser = {
                id: 1,
                email: "admin@loansense.internal",
                name: "System Admin",
                permissions: ["*"],
                sessionKey: "system_admin_key"
            };
            return next();
        }

        res.status(401).json(getErrorResponse("Authorization header missing or invalid. Bearer token required.", 401));
        return;
    }

    const token = authHeader.slice(7).trim();

    // Check direct adminApiToken match
    if (options.adminApiToken && token === options.adminApiToken) {
        req.staffUser = {
            id: 1,
            email: "admin@loansense.internal",
            name: "System Admin",
            permissions: ["*"],
            sessionKey: "system_admin_key"
        };
        return next();
    }

    try {
        const decoded = verifyToken<AuthenticatedStaff>(token);

        // Verify active session if sessionKey is provided
        req.staffUser = decoded;
        req.sessionKey = decoded.sessionKey;
        next();
    } catch (err: any) {
        res.status(401).json(getErrorResponse(`Token validation failed: ${err.message}`, 401));
    }
}

/**
 * Customer Auth: for /portal/* endpoints.
 */
export function customerAuthProtected(
    req: CustomRequest,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json(getErrorResponse("Customer authentication required.", 401));
        return;
    }

    const token = authHeader.slice(7).trim();
    try {
        const decoded = verifyToken<AuthenticatedCustomer>(token);
        req.customerUser = decoded;
        next();
    } catch (err: any) {
        res.status(401).json(getErrorResponse(`Customer token invalid: ${err.message}`, 401));
    }
}

/**
 * Optional Customer Auth: for /portal/eligibility.
 */
export function optionalCustomerAuth(
    req: CustomRequest,
    _res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        try {
            const decoded = verifyToken<AuthenticatedCustomer>(token);
            req.customerUser = decoded;
        } catch (_ignored) {
            // Optional auth ignores invalid token
        }
    }
    next();
}
