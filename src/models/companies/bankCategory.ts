import { BaseModel } from "../baseModel";

export class BankCategory extends BaseModel {
    static get tableName() {
        return "bank_categories";
    }

    name!: string;
    active!: number;
}

