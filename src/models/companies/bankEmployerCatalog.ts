import { BaseModel } from "../baseModel";

export class BankEmployerCatalog extends BaseModel {
    static get tableName() {
        return "bank_employer_catalog";
    }

    bankName!: string;
    employerId?: string;
    employerName!: string;
    normalizedName?: string;
    employerCategory!: string;
    active!: number;
}

