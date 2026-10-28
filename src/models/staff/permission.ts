import { BaseModel } from "../baseModel";

export class Permission extends BaseModel {
    static get tableName() {
        return "permissions";
    }

    name!: string;
    description?: string;
    category?: string;
}
