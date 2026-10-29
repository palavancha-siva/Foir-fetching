import { Knex } from "knex";
import { db as defaultDb } from "../utils/dbUtil";

function getKnex(dbOrPool?: any): Knex | null {
    if (dbOrPool && typeof dbOrPool === "function" && typeof dbOrPool.select === "function") {
        return dbOrPool as Knex;
    }
    if (dbOrPool) {
        return defaultDb;
    }
    if (dbOrPool === undefined) {
        return defaultDb;
    }
    return null;
}

export async function searchCompanies(search: string, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) return [];

    const clean = String(search || "").trim();
    if (!clean) return [];

    const lower = clean.toLowerCase();
    const prefix = `${lower}%`;
    const wordBoundary1 = `% ${lower}%`;
    const wordBoundary2 = `%(${lower}%`;
    const wordBoundary3 = `%/${lower}%`;
    const wordBoundary4 = `%-${lower}%`;

    let qb = k("managed_companies")
        .select("id", "company_name as name")
        .where("active", 1);

    // For short queries (1 or 2 letters like "t" or "tc"), strictly match companies starting with or having a word starting with the letters
    if (clean.length < 3) {
        qb = qb.andWhere(function () {
            this.whereILike("company_name", prefix)
                .orWhereILike("company_name", wordBoundary1)
                .orWhereILike("company_name", wordBoundary2)
                .orWhereILike("company_name", wordBoundary3)
                .orWhereILike("company_name", wordBoundary4);
        });
    } else {
        qb = qb.whereILike("company_name", `%${clean}%`);
    }

    const rows = await qb
        .orderByRaw(`
            CASE
                WHEN LOWER(company_name) = ? THEN 1
                WHEN LOWER(company_name) LIKE ? THEN 2
                WHEN LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? THEN 3
                ELSE 4
            END ASC,
            LENGTH(company_name) ASC,
            company_name ASC
        `, [lower, prefix, wordBoundary1, wordBoundary2, wordBoundary3, wordBoundary4])
        .limit(50);

    return rows.map((row: any) => ({
        id: Number(row.id),
        name: row.name
    }));
}

export async function listCompanies(search: string, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) return [];

    let qb = k("managed_companies")
        .select("id", "company_name as name")
        .where("active", 1);

    const clean = String(search || "").trim();
    if (clean !== "") {
        const lower = clean.toLowerCase();
        const prefix = `${lower}%`;
        const wordBoundary1 = `% ${lower}%`;
        const wordBoundary2 = `%(${lower}%`;
        const wordBoundary3 = `%/${lower}%`;
        const wordBoundary4 = `%-${lower}%`;

        if (clean.length < 3) {
            qb = qb.andWhere(function () {
                this.whereILike("company_name", prefix)
                    .orWhereILike("company_name", wordBoundary1)
                    .orWhereILike("company_name", wordBoundary2)
                    .orWhereILike("company_name", wordBoundary3)
                    .orWhereILike("company_name", wordBoundary4);
            });
        } else {
            qb = qb.whereILike("company_name", `%${clean}%`);
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

    const rows = await qb;

    return rows.map((row: any) => ({
        id: Number(row.id),
        name: row.name
    }));
}

export async function listCategories(search: string, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) return [];

    let qb = k("bank_categories")
        .select("id", "name")
        .where("active", 1);

    if (search && search.trim() !== "") {
        qb = qb.whereILike("name", `%${search.trim()}%`);
    }

    const rows = await qb.orderBy("name", "asc");

    return rows.map((row: any) => ({
        id: Number(row.id),
        name: row.name
    }));
}

export async function getCompanyMappings(companyName: string, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) return { rows: [] };

    const rows = await k("company_bank_mappings")
        .select(
            "id",
            "company_name",
            "bank_name",
            "cat",
            "foir",
            "cc_obligation_percent"
        )
        .where("active", 1)
        .whereRaw("LOWER(TRIM(company_name)) = LOWER(TRIM(?))", [companyName])
        .orderBy("foir", "desc")
        .orderBy("bank_name", "asc");

    return { rows };
}

export async function getCompanyMapping(companyName: string, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) return { rows: [] };

    const rows = await k("company_bank_mappings")
        .select(
            "company_name",
            "bank_name",
            "cat",
            "foir",
            "cc_obligation_percent"
        )
        .where("active", 1)
        .whereRaw("LOWER(TRIM(company_name)) = LOWER(TRIM(?))", [companyName])
        .orderBy("bank_name", "asc")
        .limit(1);

    return { rows };
}

module.exports = {
    searchCompanies,
    listCompanies,
    listCategories,
    getCompanyMappings,
    getCompanyMapping
};
