import db from "../../utils/dbUtil";

export class UserService {
    async listUsers(query: any = {}) {
        const hasUsers = await db.schema.hasTable("users");
        if (!hasUsers) {
            return [];
        }
        return db("users")
            .select("id", "phone", "email", "full_name as fullName", "active")
            .where("active", 1)
            .orderBy("id", "desc")
            .limit(50);
    }

    async createUser(data: { phone: string; fullName: string; email?: string; pan?: string }) {
        const [inserted] = await db("users")
            .insert({
                phone: data.phone.trim(),
                full_name: data.fullName.trim(),
                email: data.email?.toLowerCase().trim(),
                pan: data.pan?.toUpperCase().trim(),
                active: 1
            })
            .returning(["id", "phone", "full_name", "email", "active"]);

        return inserted;
    }
}

export const userService = new UserService();
