import { BaseModel } from "../baseModel";

export class ApprovalHierarchy extends BaseModel {
    static get tableName() {
        return "approval_hierarchies";
    }

    name!: string;
    description?: string;
    active!: number;
}

export class ApprovalStep extends BaseModel {
    static get tableName() {
        return "approval_steps";
    }

    hierarchyId!: number;
    stepOrder!: number;
    roleId!: number;
    minApprovalAmount?: number;
    maxApprovalAmount?: number;
}

export class ApprovalTransaction extends BaseModel {
    static get tableName() {
        return "approval_transactions";
    }

    applicationId!: number;
    hierarchyId!: number;
    currentStepOrder!: number;
    status!: "PENDING" | "APPROVED" | "REJECTED";
}

export class LoanTypeHierarchy extends BaseModel {
    static get tableName() {
        return "loan_type_hierarchies";
    }

    loanTypeId!: number;
    hierarchyId!: number;
}
