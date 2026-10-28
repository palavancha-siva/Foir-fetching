import { Knex } from "knex";
import { db as defaultDb } from "../utils/dbUtil";
import { parseCsv } from "../utils/csvParser";

export class PolicyMatrixError extends Error { }

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

/**
 * Dynamically queries PostgreSQL `bank_policy_matrix` via Knex query builder
 * for the exact matching Category + Salary Slab FOIR and Multiplier.
 */
export async function getDynamicFoirFromDb(category: string, salary: number, dbOrPool?: any, bankName: string = "ALL") {
    const sal = Number(salary) || 0;
    const cat = String(category || "").trim();
    const k = getKnex(dbOrPool);

    if (!k) {
        return {
            foir: 70,
            salarySlab: "Default",
            multiplier: 0,
            category: cat || "DEFAULT"
        };
    }

    try {
        const row = await k("bank_policy_matrix")
            .select(
                "foir_percent",
                "multiplier",
                "min_salary",
                "max_salary",
                "category",
                "bank_name"
            )
            .where("active", 1)
            .where((builder) => {
                builder
                    .whereRaw("LOWER(TRIM(category)) = LOWER(TRIM(?))", [cat])
                    .orWhereRaw("REPLACE(REPLACE(LOWER(TRIM(category)), ' ', ''), '-', '') = REPLACE(REPLACE(LOWER(TRIM(?)), ' ', ''), '-', '')", [cat])
                    .orWhereRaw("LOWER(TRIM(category)) = 'default'");
            })
            .where("min_salary", "<=", sal)
            .where("max_salary", ">", sal)
            .orderByRaw(`
                CASE 
                    WHEN LOWER(TRIM(category)) = LOWER(TRIM(?)) THEN 0 
                    WHEN REPLACE(REPLACE(LOWER(TRIM(category)), ' ', ''), '-', '') = REPLACE(REPLACE(LOWER(TRIM(?)), ' ', ''), '-', '') THEN 1
                    ELSE 2 
                END
            `, [cat, cat])
            .orderByRaw("CASE WHEN LOWER(TRIM(bank_name)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END", [bankName])
            .orderBy("min_salary", "desc")
            .first();

        if (row) {
            const minK = Math.round(Number(row.min_salary) / 1000);
            const maxK = Math.round(Number(row.max_salary) / 1000);

            let salarySlab = "";
            if (minK === 0) {
                salarySlab = `< ${maxK}K`;
            } else if (Number(row.max_salary) > 10000000) {
                salarySlab = `> ${minK}K`;
            } else {
                salarySlab = `${minK}K – ${maxK}K`;
            }

            return {
                foir: Number(row.foir_percent),
                salarySlab,
                multiplier: Number(row.multiplier || 0),
                category: row.category
            };
        }
    } catch (err: any) {
        console.error("Database policy matrix lookup error:", err.message);
    }

    return {
        foir: 70,
        salarySlab: "Standard",
        multiplier: 0,
        category: cat || "DEFAULT"
    };
}

export async function listMatrixRules(dbOrPool?: any, filters: any = {}) {
    const k = getKnex(dbOrPool);
    if (!k) return [];

    let qb = k("bank_policy_matrix")
        .select(
            "id",
            "bank_name",
            "category",
            "sub_category",
            "min_salary",
            "max_salary",
            "tenure_months",
            "multiplier",
            "foir_percent",
            "active",
            "updated_at"
        )
        .where("active", 1);

    if (filters.category) {
        const catFilter = filters.category.trim();
        qb = qb.where((b) => {
            b.whereRaw("LOWER(TRIM(category)) ILIKE ?", [`%${catFilter}%`])
                .orWhereRaw("REPLACE(REPLACE(LOWER(TRIM(category)), ' ', ''), '-', '') ILIKE ?", [`%${catFilter}%`]);
        });
    }
    if (filters.bank) {
        const bankFilter = filters.bank.trim();
        qb = qb.whereRaw("LOWER(TRIM(bank_name)) ILIKE ?", [`%${bankFilter}%`]);
    }

    const rows = await qb
        .orderBy("category", "asc")
        .orderBy("min_salary", "asc")
        .orderBy("tenure_months", "asc");

    return rows.map((row: any) => {
        const minK = Math.round(Number(row.min_salary) / 1000);
        const maxK = Math.round(Number(row.max_salary) / 1000);
        let salarySlab = "";
        if (minK === 0) {
            salarySlab = `< ${maxK}K`;
        } else if (Number(row.max_salary) > 10000000) {
            salarySlab = `> ${minK}K`;
        } else {
            salarySlab = `${minK}K – ${maxK}K`;
        }

        return {
            id: Number(row.id),
            bank_name: row.bank_name,
            category: row.category,
            sub_category: row.sub_category,
            min_salary: Number(row.min_salary),
            max_salary: Number(row.max_salary),
            tenure_months: Number(row.tenure_months),
            multiplier: Number(row.multiplier),
            foir_percent: Number(row.foir_percent),
            salary_slab: salarySlab
        };
    });
}

export async function addMatrixRule(data: any, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) throw new PolicyMatrixError("Database connection required.");

    const bankName = String(data.bank_name || "ALL").trim();
    const category = String(data.category || "").trim().toUpperCase();
    const minSalary = Number(data.min_salary) || 0;
    const maxSalary = Number(data.max_salary) || 99999999;
    const foirPercent = Number(data.foir_percent);
    const multiplier = Number(data.multiplier) || 0;
    const tenureMonths = Number(data.tenure_months) || 60;

    if (!category) {
        throw new PolicyMatrixError("Category is required.");
    }
    if (!Number.isFinite(foirPercent) || foirPercent < 0 || foirPercent > 100) {
        throw new PolicyMatrixError("FOIR percentage must be between 0 and 100.");
    }
    if (minSalary < 0 || maxSalary <= minSalary) {
        throw new PolicyMatrixError("Max salary must be greater than min salary.");
    }

    const [row] = await k("bank_policy_matrix")
        .insert({
            bank_name: bankName,
            category,
            min_salary: minSalary,
            max_salary: maxSalary,
            tenure_months: tenureMonths,
            multiplier,
            foir_percent: foirPercent,
            active: 1
        })
        .returning([
            "id",
            "bank_name",
            "category",
            "min_salary",
            "max_salary",
            "tenure_months",
            "multiplier",
            "foir_percent"
        ]);

    return row;
}

export async function updateMatrixRule(id: any, data: any, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) throw new PolicyMatrixError("Database connection required.");
    const ruleId = Number(id);
    if (!Number.isSafeInteger(ruleId) || ruleId <= 0) {
        throw new PolicyMatrixError("A valid rule ID is required.");
    }

    const category = String(data.category || "").trim().toUpperCase();
    const minSalary = Number(data.min_salary) || 0;
    const maxSalary = Number(data.max_salary) || 99999999;
    const foirPercent = Number(data.foir_percent);
    const multiplier = Number(data.multiplier) || 0;
    const tenureMonths = Number(data.tenure_months) || 60;
    const bankName = String(data.bank_name || "ALL").trim();

    if (!category) {
        throw new PolicyMatrixError("Category is required.");
    }
    if (!Number.isFinite(foirPercent) || foirPercent < 0 || foirPercent > 100) {
        throw new PolicyMatrixError("FOIR percentage must be between 0 and 100.");
    }
    if (minSalary < 0 || maxSalary <= minSalary) {
        throw new PolicyMatrixError("Max salary must be greater than min salary.");
    }

    const [row] = await k("bank_policy_matrix")
        .where({ id: ruleId, active: 1 })
        .update({
            bank_name: bankName,
            category,
            min_salary: minSalary,
            max_salary: maxSalary,
            tenure_months: tenureMonths,
            multiplier,
            foir_percent: foirPercent,
            updated_at: k.fn.now()
        })
        .returning([
            "id",
            "bank_name",
            "category",
            "min_salary",
            "max_salary",
            "tenure_months",
            "multiplier",
            "foir_percent"
        ]);

    if (!row) {
        throw new PolicyMatrixError("Matrix rule not found.");
    }

    return row;
}

export async function deleteMatrixRule(id: any, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) throw new PolicyMatrixError("Database connection required.");
    const ruleId = Number(id);

    const affected = await k("bank_policy_matrix")
        .where({ id: ruleId, active: 1 })
        .update({
            active: 0,
            updated_at: k.fn.now()
        });

    if (!affected) {
        throw new PolicyMatrixError("Matrix rule not found.");
    }
    return { success: true };
}

export async function bulkImportMatrixRules(csvContent: string, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    if (!k) throw new PolicyMatrixError("Database connection required.");
    if (typeof csvContent !== "string" || !csvContent.trim()) {
        throw new PolicyMatrixError("CSV content is required.");
    }

    const rows = parseCsv(csvContent);
    if (rows.length === 0) {
        throw new PolicyMatrixError("No valid rows found in CSV.");
    }

    return await k.transaction(async (trx) => {
        let inserted = 0;
        let updated = 0;

        for (const row of rows) {
            const cat = String(row.category || row.cat || row.tier || row.employercatg || "").trim().toUpperCase();
            if (!cat) continue;

            const minSal = Number(row.minsalary ?? row.min ?? row.minsal ?? 0) || 0;
            const maxSal = Number(row.maxsalary ?? row.max ?? row.maxsal ?? 99999999) || 99999999;
            const foir = Number(row.foirpercent ?? row.foir ?? row.foirpct ?? row.dynamicfoir);
            const mult = Number(row.multiplier ?? row.mult ?? 0) || 0;
            const tenure = Number(row.tenure ?? row.tenuremonths ?? row.months ?? 60) || 60;
            const bankName = String(row.bank ?? row.bankname ?? "STANDARD").trim() || "STANDARD";

            if (!Number.isFinite(foir) || foir < 0 || foir > 100) continue;
            if (maxSal <= minSal) continue;

            const existing = await trx("bank_policy_matrix")
                .select("id")
                .where("active", 1)
                .whereRaw("LOWER(TRIM(category)) = LOWER(TRIM(?))", [cat])
                .where("min_salary", minSal)
                .where("max_salary", maxSal)
                .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                .first();

            if (existing) {
                await trx("bank_policy_matrix")
                    .where("id", existing.id)
                    .update({
                        foir_percent: foir,
                        multiplier: mult,
                        tenure_months: tenure,
                        updated_at: trx.fn.now()
                    });
                updated++;
            } else {
                await trx("bank_policy_matrix").insert({
                    bank_name: bankName,
                    category: cat,
                    min_salary: minSal,
                    max_salary: maxSal,
                    tenure_months: tenure,
                    multiplier: mult,
                    foir_percent: foir,
                    active: 1
                });
                inserted++;
            }
        }

        return { total: rows.length, inserted, updated };
    });
}

module.exports = {
    PolicyMatrixError,
    getDynamicFoirFromDb,
    listMatrixRules,
    addMatrixRule,
    updateMatrixRule,
    deleteMatrixRule,
    bulkImportMatrixRules
};
