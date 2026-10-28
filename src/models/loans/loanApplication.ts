import { BaseModel } from "../baseModel";

export class LoanApplication extends BaseModel {
    static get tableName() {
        return "loan_applications";
    }

    applicationNumber!: string;
    userId?: number;
    companyName?: string;
    salary?: number;
    requestedAmount?: number;
    tenureMonths?: number;
    status!: string;
    branchId?: number;
    assignedStaffId?: number;
    metadata?: any;
}
