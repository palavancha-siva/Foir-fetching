import { BaseModel } from "../baseModel";

export class Branch extends BaseModel {
    static get tableName() {
        return "branches";
    }

    name!: string;
    code!: string;
    city?: string;
    state?: string;
    active!: number;
}

export class Lender extends BaseModel {
    static get tableName() {
        return "lenders";
    }

    name!: string;
    code!: string;
    type?: string;
    active!: number;
}

export class LoanType extends BaseModel {
    static get tableName() {
        return "loan_types";
    }

    name!: string;
    code!: string;
    minAmount?: number;
    maxAmount?: number;
    active!: number;
}

export class LoanStatus extends BaseModel {
    static get tableName() {
        return "loan_statuses";
    }

    code!: string;
    label!: string;
    stageOrder!: number;
    active!: number;
}

export class NotificationRecipient extends BaseModel {
    static get tableName() {
        return "notification_recipients";
    }

    name!: string;
    email?: string;
    phone?: string;
    eventTrigger!: string;
    active!: number;
}
