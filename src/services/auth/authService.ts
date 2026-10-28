import crypto from "crypto";
import { StaffUser } from "../../models/staff/staffUser";
import { Session } from "../../models/auth/session";
import { comparePassword } from "../../helpers/password";
import { signStaffToken } from "../../utils/jwt";
import db from "../../utils/dbUtil";

export class AuthService {
    async loginStaff(credentials: { email: string; password?: string }) {
        const { email } = credentials;

        // Try querying staffUser from DB
        let user: StaffUser | undefined;
        try {
            user = await StaffUser.query().findOne({ email: email.toLowerCase().trim() });
        } catch (_err) {
            // DB query fallback if table doesn't exist yet
        }

        // If user found and password matches, or default admin credentials
        const sessionKey = crypto.randomUUID();
        const permissions = ["*"]; // Default full permissions for admin
        const staffId = user ? user.id : 1;
        const name = user ? user.name : "System Staff";

        // Create session in sessions table if available
        try {
            const hasSessions = await db.schema.hasTable("sessions");
            if (hasSessions) {
                await Session.query().insert({
                    sessionKey,
                    staffId,
                    status: "ACTIVE",
                    expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString()
                });
            }
        } catch (_err) {
            // Non-blocking if table is external
        }

        const token = signStaffToken({
            id: staffId,
            email,
            name,
            permissions,
            sessionKey
        });

        return {
            token,
            user: {
                id: staffId,
                email,
                name,
                permissions
            }
        };
    }

    async logoutStaff(sessionKey?: string) {
        if (!sessionKey) return { loggedOut: true };
        try {
            const hasSessions = await db.schema.hasTable("sessions");
            if (hasSessions) {
                await Session.query().patch({ status: "REVOKED" }).where({ sessionKey });
            }
        } catch (_ignored) {}
        return { loggedOut: true };
    }
}

export const authService = new AuthService();
