import { BaseModel } from "../baseModel";

export class ManagedBank extends BaseModel {
    static get tableName() {
        return "managed_banks";
    }

    bankName!: string;
    active!: number;
}

