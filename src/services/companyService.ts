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

// Common Indian corporate aliases and acronyms
export const KNOWN_ALIASES: Record<string, string> = {
    "tcs": "TATA CONSULTANCY SERVICES LIMITED",
    "tata consultancy": "TATA CONSULTANCY SERVICES LIMITED",
    "tata consultancy services": "TATA CONSULTANCY SERVICES LIMITED",
    "wipro": "WIPRO LIMITED",
    "infosys": "INFOSYS LIMITED",
    "accenture": "ACCENTURE SOLUTIONS PRIVATE LIMITED",
    "capgemini": "CAPGEMINI TECHNOLOGY SERVICES INDIA LIMITED",
    "cognizant": "COGNIZANT TECHNOLOGY SOLUTIONS INDIA PRIVATE LIMITED",
    "cts": "COGNIZANT TECHNOLOGY SOLUTIONS INDIA PRIVATE LIMITED",
    "hcl": "HCL TECHNOLOGIES LIMITED",
    "hcl tech": "HCL TECHNOLOGIES LIMITED",
    "hcl technologies": "HCL TECHNOLOGIES LIMITED",
    "l&t": "LARSEN AND TOUBRO LIMITED",
    "l and t": "LARSEN AND TOUBRO LIMITED",
    "larsen & toubro": "LARSEN AND TOUBRO LIMITED",
    "larsen and toubro": "LARSEN AND TOUBRO LIMITED",
    "reliance": "RELIANCE INDUSTRIES LIMITED",
    "ril": "RELIANCE INDUSTRIES LIMITED",
    "maruti": "MARUTI SUZUKI INDIA LIMITED",
    "maruti suzuki": "MARUTI SUZUKI INDIA LIMITED",
    "tech mahindra": "TECH MAHINDRA LIMITED",
    "mahindra": "MAHINDRA & MAHINDRA LIMITED",
    "m&m": "MAHINDRA & MAHINDRA LIMITED",
    "sbi": "STATE BANK OF INDIA",
    "bharti airtel": "BHARTI AIRTEL LIMITED",
    "airtel": "BHARTI AIRTEL LIMITED"
};

export function normalizeCompanyName(name: string): string {
    if (!name) return "";
    return name
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function getLegalVariations(rawName: string): { clean: string; root: string; variations: string[] } {
    const clean = normalizeCompanyName(rawName);
    const variations = new Set<string>();
    if (clean) variations.add(clean);

    const rawTrim = rawName.trim().toLowerCase();
    if (rawTrim) variations.add(rawTrim);

    // Swap '&' and 'and'
    if (rawTrim.includes("&")) {
        variations.add(rawTrim.replace(/&/g, "and").replace(/\s+/g, " ").trim());
    }
    if (rawTrim.includes(" and ")) {
        variations.add(rawTrim.replace(/\band\b/g, "&").replace(/\s+/g, " ").trim());
    }

    // Check alias
    if (KNOWN_ALIASES[clean]) {
        const target = KNOWN_ALIASES[clean].toLowerCase();
        variations.add(target);
        variations.add(normalizeCompanyName(target));
    }

    // Strip common legal corporate suffixes to extract root brand
    const suffixPattern = /\b(private limited|pvt ltd|p ltd|pvt limited|private ltd|limited|ltd|llp|inc|corp|corporation|co|company|india|services|technologies|solutions)\b/gi;
    const root = clean.replace(suffixPattern, " ").replace(/\s+/g, " ").trim();

    if (root && root.length >= 3) {
        variations.add(root);
        variations.add(`${root} limited`);
        variations.add(`${root} ltd`);
        variations.add(`${root} private limited`);
        variations.add(`${root} pvt ltd`);
        variations.add(`${root} india limited`);
        variations.add(`${root} india private limited`);
        variations.add(`${root} technology services india limited`);
        variations.add(`${root} solutions private limited`);
        variations.add(`${root} technologies limited`);
        variations.add(`${root} enterprises private limited`);
    }

    return { clean, root, variations: Array.from(variations) };
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

    // Check if search has an alias expansion
    const aliasTarget = KNOWN_ALIASES[lower] || "";
    const aliasLower = aliasTarget.toLowerCase();

    let qb = k("managed_companies")
        .select("id", "company_name as name")
        .where("active", 1);

    if (clean.length < 3) {
        qb = qb.andWhere(function () {
            this.whereILike("company_name", prefix)
                .orWhereILike("company_name", wordBoundary1)
                .orWhereILike("company_name", wordBoundary2)
                .orWhereILike("company_name", wordBoundary3)
                .orWhereILike("company_name", wordBoundary4);

            if (aliasLower) {
                this.orWhereILike("company_name", `%${aliasLower}%`);
            }
        });
    } else {
        qb = qb.andWhere(function () {
            this.whereILike("company_name", `%${clean}%`);
            if (aliasLower) {
                this.orWhereILike("company_name", `%${aliasLower}%`);
            }
        });
    }

    const rows = await qb
        .orderByRaw(`
            CASE
                WHEN LOWER(company_name) = ? THEN 1
                WHEN LOWER(company_name) = ? THEN 2
                WHEN LOWER(company_name) LIKE ? THEN 3
                WHEN LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(company_name) LIKE ? THEN 4
                ELSE 5
            END ASC,
            CASE
                WHEN LOWER(company_name) LIKE '% limited' OR LOWER(company_name) LIKE '% pvt ltd' OR LOWER(company_name) LIKE '% private limited' THEN 1
                ELSE 2
            END ASC,
            LENGTH(company_name) ASC,
            company_name ASC
        `, [lower, aliasLower, prefix, wordBoundary1, wordBoundary2, wordBoundary3, wordBoundary4])
        .limit(50);

    return rows.map((row: any) => ({
        id: Number(row.id),
        name: row.name
    }));
}

export async function listCompanies(search: string, dbOrPool?: any) {
    return searchCompanies(search, dbOrPool);
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

    const raw = String(companyName || "").trim();
    if (!raw) return { rows: [] };

    const { clean, root, variations } = getLegalVariations(raw);
    const bankMap = new Map<string, any>();

    // 1. Exact matches first
    const exactRows = await k("company_bank_mappings")
        .select(
            "id",
            "company_name",
            "bank_name",
            "cat",
            "foir",
            "cc_obligation_percent"
        )
        .where("active", 1)
        .whereRaw("LOWER(TRIM(company_name)) = LOWER(TRIM(?))", [raw])
        .orderBy("foir", "desc")
        .orderBy("bank_name", "asc");

    for (const r of exactRows) {
        const bKey = String(r.bank_name || "").toUpperCase().trim();
        if (!bankMap.has(bKey)) {
            bankMap.set(bKey, r);
        }
    }

    // 2. Legal suffix permutations & aliases (e.g., Ltd vs Limited, Pvt Ltd vs Private Limited, & vs and)
    if (variations.length > 0) {
        const varRows = await k("company_bank_mappings")
            .select(
                "id",
                "company_name",
                "bank_name",
                "cat",
                "foir",
                "cc_obligation_percent"
            )
            .where("active", 1)
            .whereRaw("LOWER(TRIM(company_name)) = ANY(?::text[])", [variations])
            .orderBy("foir", "desc")
            .orderBy("bank_name", "asc");

        for (const r of varRows) {
            const bKey = String(r.bank_name || "").toUpperCase().trim();
            if (!bankMap.has(bKey)) {
                bankMap.set(bKey, r);
            }
        }
    }

    // 3. Root entity matching for banks that haven't been resolved yet
    if (root && root.length >= 3) {
        const rootPattern = `${root}%`;
        const wordPattern = `% ${root}%`;
        const rootRows = await k("company_bank_mappings")
            .select(
                "id",
                "company_name",
                "bank_name",
                "cat",
                "foir",
                "cc_obligation_percent"
            )
            .where("active", 1)
            .andWhere(function () {
                this.whereILike("company_name", rootPattern)
                    .orWhereILike("company_name", wordPattern);
            })
            .orderByRaw(`
                CASE 
                    WHEN LOWER(TRIM(company_name)) LIKE ? THEN 1
                    WHEN LOWER(TRIM(company_name)) LIKE ? THEN 2
                    ELSE 3
                END ASC,
                foir DESC,
                bank_name ASC
            `, [`${root} limited%`, `${root} %`])
            .limit(100);

        for (const r of rootRows) {
            const bKey = String(r.bank_name || "").toUpperCase().trim();
            if (!bankMap.has(bKey)) {
                bankMap.set(bKey, r);
            }
        }
    }

    // Sort resulting banks by FOIR % descending, then bank name
    const rows = Array.from(bankMap.values()).sort((a, b) => {
        const diff = (Number(b.foir) || 0) - (Number(a.foir) || 0);
        if (diff !== 0) return diff;
        return String(a.bank_name || "").localeCompare(String(b.bank_name || ""));
    });

    return { rows };
}

export async function getCompanyMapping(companyName: string, dbOrPool?: any) {
    const result = await getCompanyMappings(companyName, dbOrPool);
    return { rows: result.rows.slice(0, 1) };
}

module.exports = {
    searchCompanies,
    listCompanies,
    listCategories,
    getCompanyMappings,
    getCompanyMapping,
    KNOWN_ALIASES,
    normalizeCompanyName,
    getLegalVariations
};
