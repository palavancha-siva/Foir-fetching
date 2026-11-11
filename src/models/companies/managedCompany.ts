import { BaseModel } from "../baseModel";

export class ManagedCompany extends BaseModel {
    static get tableName() {
        return "managed_companies";
    }

    companyName!: string;
    active!: number;
}

