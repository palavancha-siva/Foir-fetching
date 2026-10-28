import { BaseModel } from "../baseModel";
import { Model } from "objection";
import { Role } from "./role";

export class StaffUser extends BaseModel {
    static get tableName() {
        return "staff_users";
    }

    email!: string;
    passwordHash!: string;
    name!: string;
    phone?: string;
    roleId?: number;
    active!: number;

    role?: Role;

    static get relationMappings() {
        return {
            role: {
                relation: Model.BelongsToOneRelation,
                modelClass: Role,
                join: {
                    from: "staff_users.role_id",
                    to: "roles.id"
                }
            }
        };
    }
}
