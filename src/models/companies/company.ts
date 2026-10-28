import { BaseModel } from "../baseModel";
import { Model } from "objection";
import { CompanyBankMapping } from "./companyBankMapping";

export class Company extends BaseModel {
    static get tableName() {
        return "companies";
    }

    name!: string;
    normalizedName?: string;
    active!: number;

    mappings?: CompanyBankMapping[];

    static get relationMappings() {
        return {
            mappings: {
                relation: Model.HasManyRelation,
                modelClass: CompanyBankMapping,
                join: {
                    from: "companies.name",
                    to: "company_bank_mappings.company_name"
                }
            }
        };
    }
}
