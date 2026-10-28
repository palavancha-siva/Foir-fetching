import { BaseModel } from "../baseModel";

export class CompanyBankMapping extends BaseModel {
    static get tableName() {
        return "company_bank_mappings";
    }

    companyName!: string;
    bankName!: string;
    cat!: string;
    foir!: number;
    ccObligationPercent!: number;
    active!: number;
}
