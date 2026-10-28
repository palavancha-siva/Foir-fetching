import db from "../../utils/dbUtil";
import { StaffUser } from "../../models/staff/staffUser";
import { hashPassword } from "../../helpers/password";

export class StaffService {
    async listStaff(query: any = {}) {
        const hasStaff = await db.schema.hasTable("staff_users");
        if (!hasStaff) {
            return [];
        }
        return db("staff_users")
            .select("id", "name", "email", "phone", "role_id as roleId", "active")
            .where("active", 1)
            .orderBy("id", "desc");
    }

    async createStaff(data: { name: string; email: string; phone?: string; password?: string; roleId?: number }) {
        const passwordHash = await hashPassword(data.password || "TempPass@123");
        const [inserted] = await db("staff_users")
            .insert({
                name: data.name.trim(),
                email: data.email.toLowerCase().trim(),
                phone: data.phone,
                role_id: data.roleId,
                password_hash: passwordHash,
                active: 1
            })
            .returning(["id", "name", "email", "phone", "role_id", "active"]);

        return inserted;
    }
}

export const staffService = new StaffService();
