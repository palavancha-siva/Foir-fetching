import { BaseModel } from "../baseModel";

export class LoanStatusHistory extends BaseModel {
    static get tableName() {
        return "loan_status_history";
    }

    applicationId!: number;
    previousStatus?: string;
    newStatus!: string;
    changedByStaffId?: number;
    remarks?: string;
}

export class LoanComment extends BaseModel {
    static get tableName() {
        return "loan_comments";
    }

    applicationId!: number;
    staffId?: number;
    comment!: string;
    isInternal!: number;
}

export class LoanLogin extends BaseModel {
    static get tableName() {
        return "loan_logins";
    }

    applicationId!: number;
    lenderId?: number;
    lenderName!: string;
    loginDate!: string;
    referenceNumber?: string;
    status!: string;
}
