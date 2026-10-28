import { BaseModel } from "../baseModel";

export class EligibilityCheck extends BaseModel {
    static get tableName() {
        return "eligibility_checks";
    }

    applicationId?: number;
    userId?: number;
    salary!: number;
    companyName!: string;
    existingEmi!: number;
    creditCardOutstanding!: number;
    eligibleLendersJson!: any;
}
