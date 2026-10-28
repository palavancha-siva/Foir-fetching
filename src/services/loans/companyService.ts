import db from "../../utils/dbUtil";
import { Company } from "../../models/companies/company";
import { CompanyBankMapping } from "../../models/companies/companyBankMapping";

export class CompanyService {
    async searchCompanies(query: string = ""): Promise<Array<{ id: number; name: string }>> {
        const cleanQuery = String(query || "").trim();
        const hasCompanies = await db.schema.hasTable("companies");
        if (hasCompanies) {
            const rows = await db("companies")
                .select("id", "name")
                .where("active", 1)
                .andWhere(function () {
                    if (cleanQuery) {
                        this.whereILike("name", `%${cleanQuery}%`)
                            .orWhereILike("normalized_name", `%${cleanQuery}%`);
                    }
                })
                .orderBy("name", "asc")
                .limit(50);
            return rows.map(r => ({ id: Number(r.id), name: r.name }));
        }

        const rows = await db("company_bank_mappings")
            .distinct("company_name as name")
            .where("active", 1)
            .andWhere(function () {
                if (cleanQuery) {
                    this.whereILike("company_name", `%${cleanQuery}%`);
                }
            })
            .orderBy("company_name", "asc")
            .limit(50);

        return rows.map((r, idx) => ({ id: idx + 1, name: r.name }));
    }

    async listCategories(query: string = ""): Promise<Array<{ id: number; name: string }>> {
        const clean = String(query || "").trim();
        const rows = await db("bank_categories")
            .select("id", "name")
            .where("active", 1)
            .andWhere(function () {
                if (clean) {
                    this.whereILike("name", `%${clean}%`);
                }
            })
            .orderBy("name", "asc");

        return rows.map(r => ({ id: Number(r.id), name: r.name }));
    }

    async getCompanyMappings(companyName: string): Promise<Array<any>> {
        const clean = String(companyName || "").trim();
        return db("company_bank_mappings")
            .select("id", "company_name as companyName", "bank_name as bankName", "cat", "foir", "cc_obligation_percent as ccObligationPercent")
            .where("active", 1)
            .andWhereRaw("LOWER(TRIM(company_name)) = LOWER(TRIM(?))", [clean])
            .orderBy("foir", "desc");
    }
}

export const companyService = new CompanyService();
