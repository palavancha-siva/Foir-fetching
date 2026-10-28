import { BaseModel } from "../baseModel";
import { Model } from "objection";
import { Permission } from "./permission";

export class Role extends BaseModel {
    static get tableName() {
        return "roles";
    }

    name!: string;
    description?: string;
    active!: number;

    permissions?: Permission[];

    static get relationMappings() {
        return {
            permissions: {
                relation: Model.ManyToManyRelation,
                modelClass: Permission,
                join: {
                    from: "roles.id",
                    through: {
                        from: "role_permissions.role_id",
                        to: "role_permissions.permission_id"
                    },
                    to: "permissions.id"
                }
            }
        };
    }
}
