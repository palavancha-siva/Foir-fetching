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

    const rows = await k("managed_companies")
        .select("id", "company_name as name")
        .where("active", 1)
        .whereILike("company_name", `%${search}%`)
        .orderBy("company_name", "asc")
        .limit(30);

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

    if (search && search.trim() !== "") {
        qb = qb.whereILike("company_name", `%${search.trim()}%`);
    }

    const rows = await qb.orderBy("company_name", "asc");

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
