import db from "../../utils/dbUtil";
import { Company } from "../../models/companies/company";
import { CompanyBankMapping } from "../../models/companies/companyBankMapping";

export class CompanyService {
    async searchCompanies(query: string = ""): Promise<Array<{ id: number; name: string }>> {
        const cleanQuery = String(query || "").trim();
        const lower = cleanQuery.toLowerCase();
        const prefix = `${lower}%`;
        const wordBoundary1 = `% ${lower}%`;
        const wordBoundary2 = `%(${lower}%`;
        const wordBoundary3 = `%/${lower}%`;
        const wordBoundary4 = `%-${lower}%`;

        const hasCompanies = await db.schema.hasTable("companies");
        if (hasCompanies) {
            let qb = db("companies")
                .select("id", "name")
                .where("active", 1);

            if (cleanQuery) {
                if (cleanQuery.length < 3) {
                    qb = qb.andWhere(function () {
                        this.whereILike("name", prefix)
                            .orWhereILike("name", wordBoundary1)
                            .orWhereILike("name", wordBoundary2)
                            .orWhereILike("name", wordBoundary3)
                            .orWhereILike("name", wordBoundary4);
                    });
                } else {
                    qb = qb.andWhere(function () {
                        this.whereILike("name", `%${cleanQuery}%`)
                            .orWhereILike("normalized_name", `%${cleanQuery}%`);
                    });
                }

                qb = qb.orderByRaw(`
                    CASE
                        WHEN LOWER(name) = ? THEN 1
                        WHEN LOWER(name) LIKE ? THEN 2
                        WHEN LOWER(name) LIKE ? OR LOWER(name) LIKE ? OR LOWER(name) LIKE ? OR LOWER(name) LIKE ? THEN 3
                        ELSE 4
                    END ASC,
                    LENGTH(name) ASC,
                    name ASC
                `, [lower, prefix, wordBoundary1, wordBoundary2, wordBoundary3, wordBoundary4]);
            } else {
                qb = qb.orderBy("name", "asc");
            }

            const rows = await qb.limit(50);
            return rows.map(r => ({ id: Number(r.id), name: r.name }));
        }

        let qb = db("company_bank_mappings")
            .distinct("company_name as name")
            .where("active", 1);

        if (cleanQuery) {
            if (cleanQuery.length < 3) {
                qb = qb.andWhere(function () {
                    this.whereILike("company_name", prefix)
                        .orWhereILike("company_name", wordBoundary1)
                        .orWhereILike("company_name", wordBoundary2)
                        .orWhereILike("company_name", wordBoundary3)
                        .orWhereILike("company_name", wordBoundary4);
                });
            } else {
                qb = qb.andWhere(function () {
                    this.whereILike("company_name", `%${cleanQuery}%`);
                });
            }

            qb = qb.orderByRaw(`
                CASE
                    WHEN LOWER(company_name) = ? THEN 1
                    WHEN LOWER(company_name) LIKE ? THEN 2
                    WHEN LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? THEN 3
                    ELSE 4
                END ASC,
                LENGTH(company_name) ASC,
                company_name ASC
            `, [lower, prefix, wordBoundary1, wordBoundary2, wordBoundary3, wordBoundary4]);
        } else {
            qb = qb.orderBy("company_name", "asc");
        }

        const rows = await qb.limit(50);
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
