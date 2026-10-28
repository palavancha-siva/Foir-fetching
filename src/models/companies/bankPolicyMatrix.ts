import { BaseModel } from "../baseModel";

export class BankPolicyMatrix extends BaseModel {
    static get tableName() {
        return "bank_policy_matrix";
    }

    bankName!: string;
    category!: string;
    minSalary!: number;
    maxSalary!: number;
    tenureMonths!: number;
    multiplier!: number;
    foirPercent!: number;
    active!: number;
}
