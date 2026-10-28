import { BaseModel } from "../baseModel";

export class Session extends BaseModel {
    static get tableName() {
        return "sessions";
    }

    sessionKey!: string;
    staffId?: number;
    userId?: number;
    status!: "ACTIVE" | "REVOKED" | "EXPIRED";
    ipAddress?: string;
    userAgent?: string;
    expiresAt!: string;
}
