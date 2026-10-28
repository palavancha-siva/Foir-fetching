import { BaseModel } from "../baseModel";

export class CreditReportHistory extends BaseModel {
    static get tableName() {
        return "credit_report_history";
    }

    userId!: number;
    bureauName!: "CIBIL" | "EXPERIAN" | "CRIF" | "EQUIFAX";
    score!: number;
    reportDataJson!: any;
    pulledAt!: string;
}
