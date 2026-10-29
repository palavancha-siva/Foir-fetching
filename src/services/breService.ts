import { Knex } from "knex";
import { db as defaultDb } from "../utils/dbUtil";
import { parseCsv } from "../utils/csvParser";
import { categoryMatches } from "../utils/categoryMatcher";

export class BreRuleError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number = 400) {
        super(message);
        this.name = "BreRuleError";
        this.statusCode = statusCode;
    }
}

function getKnex(dbOrPool?: any): Knex {
    if (dbOrPool && typeof dbOrPool === "function" && typeof dbOrPool.select === "function") {
        return dbOrPool as Knex;
    }
    return defaultDb;
}

let tableEnsured = false;

/**
 * Initializes the `bre_rules` table in PostgreSQL if it doesn't already exist.
 * Seeds initial dynamic data if the table was freshly created.
 */
export async function ensureBreRulesTable(k: Knex = defaultDb): Promise<void> {
    if (tableEnsured) return;

    const exists = await k.schema.hasTable("bre_rules");
    if (!exists) {
        await k.schema.createTable("bre_rules", (table) => {
            table.bigIncrements("id").primary();
            table.text("bank_name").notNullable();
            table.text("category").notNullable().defaultTo("CAT A");
            table.text("rule_name").notNullable();
            table.text("condition_type").notNullable().defaultTo("range");
            table.decimal("min_salary", 12, 2).notNullable().defaultTo(0);
            table.decimal("max_salary", 12, 2).notNullable().defaultTo(99999999);
            table.decimal("foir_percent", 5, 2).notNullable();
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(k.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(k.fn.now());
        });

        await k.raw(`
            CREATE INDEX IF NOT EXISTS idx_bre_rules_bank_cat_active
            ON bre_rules (LOWER(TRIM(bank_name)), LOWER(TRIM(category)), active, min_salary)
        `);
        // Table initialized with clean schema without hardcoded seed rules
    } else {
        // Ensure category column exists in existing table
        const hasCategory = await k.schema.hasColumn("bre_rules", "category");
        if (!hasCategory) {
            await k.schema.alterTable("bre_rules", (table) => {
                table.text("category").notNullable().defaultTo("CAT A");
            });
        }
    }

    try {
        await k.raw(`
            UPDATE bre_rules
            SET bank_name = 'ICICI'
            WHERE LOWER(TRIM(bank_name)) = 'icici bank'
              AND EXISTS (SELECT 1 FROM managed_banks WHERE LOWER(TRIM(bank_name)) = 'icici')
        `);
        await k.raw(`
            UPDATE bre_rules
            SET bank_name = 'HDFC'
            WHERE LOWER(TRIM(bank_name)) = 'hdfc bank'
              AND EXISTS (SELECT 1 FROM managed_banks WHERE LOWER(TRIM(bank_name)) = 'hdfc')
        `);
        await k.raw(`
            UPDATE bre_rules
            SET bank_name = 'Kotak Mahindra Bank'
            WHERE LOWER(TRIM(bank_name)) IN ('kotak', 'kotak mahindra')
              AND EXISTS (SELECT 1 FROM managed_banks WHERE LOWER(TRIM(bank_name)) = 'kotak mahindra bank')
        `);
        await k.raw(`
            UPDATE bre_rules
            SET bank_name = 'MUTHOOT FINANCE'
            WHERE LOWER(TRIM(bank_name)) = 'muthoot fin'
              AND EXISTS (SELECT 1 FROM managed_banks WHERE LOWER(TRIM(bank_name)) = 'muthoot finance')
        `);
    } catch {
        // Ignore
    }

    tableEnsured = true;
}

/**
 * Checks whether [minSalary, maxSalary] collides with an existing active rule for bankName & category.
 */
export async function findOverlappingRule(
    bankName: string,
    category: string,
    minSalary: number,
    maxSalary: number,
    excludeRuleId: number | null,
    k: Knex,
    ruleName?: string
) {
    // Two intervals [A, B] and [C, D] overlap if and only if A < D and B > C.
    // Touching endpoints (e.g. 50,000 to 75,000 and 75,000 to 100,000) are contiguous slabs, NOT overlaps.
    const qb = k("bre_rules")
        .select("id", "rule_name", "category", "min_salary", "max_salary", "foir_percent")
        .where("active", 1)
        .where((builder: any) => {
            const bankClean = bankName.toLowerCase().replace(/\s+bank$/i, "").trim();
            builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`])
                .orWhereRaw("LOWER(TRIM(bank_name)) LIKE ?", [`%${bankClean}%`])
                .orWhereRaw("LOWER(?) LIKE CONCAT('%', LOWER(TRIM(bank_name)), '%')", [bankName]);
        })
        .where("min_salary", "<", maxSalary)
        .where("max_salary", ">", minSalary);

    if (category) {
        qb.whereRaw("LOWER(TRIM(category)) = LOWER(TRIM(?))", [category]);
    }

    if (excludeRuleId) {
        qb.whereNot("id", excludeRuleId);
    }

    const candidates = await qb;
    if (!candidates || candidates.length === 0) return null;

    if (ruleName) {
        const isHl = /home\s*lo[ane]/i.test(ruleName);
        const match = candidates.find((c: any) => {
            const cHl = /home\s*lo[ane]/i.test(c.rule_name || "");
            return isHl === cHl;
        });
        return match || null;
    }

    return candidates[0];
}

/**
 * Lists all BRE rules for a bank (both active and inactive) ordered by category and min_salary.
 */
export async function listRulesByBank(bankName: string, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const bank = String(bankName || "").trim();
    if (!bank) {
        return [];
    }

    const rows = await k("bre_rules")
        .select(
            "id",
            "bank_name",
            "category",
            "rule_name",
            "condition_type",
            "min_salary",
            "max_salary",
            "foir_percent",
            "active",
            "created_at",
            "updated_at"
        )
        .where((builder: any) => {
            const bankClean = bank.toLowerCase().replace(/\s+bank$/i, "").trim();
            builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bank])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`])
                .orWhereRaw("LOWER(TRIM(bank_name)) LIKE ?", [`%${bankClean}%`])
                .orWhereRaw("LOWER(?) LIKE CONCAT('%', LOWER(TRIM(bank_name)), '%')", [bank]);
        })
        .orderBy("category", "asc")
        .orderBy("min_salary", "asc")
        .orderBy("id", "asc");

    return rows.map((r: any) => ({
        id: Number(r.id),
        bank_name: r.bank_name,
        category: r.category || "CAT A",
        rule_name: r.rule_name,
        condition_type: r.condition_type,
        min_salary: Number(r.min_salary),
        max_salary: Number(r.max_salary),
        foir_percent: Number(r.foir_percent),
        active: Number(r.active) === 1,
        created_at: r.created_at,
        updated_at: r.updated_at
    }));
}

/**
 * Normalizes input salary condition and bounds.
 */
function resolveSalaryBounds(data: any): { conditionType: string; minSal: number; maxSal: number } {
    const conditionType = String(data.condition_type || "range").trim().toLowerCase();
    let minSal = 0;
    let maxSal = 99999999;

    if (conditionType === "less_than") {
        const threshold = Number(data.threshold_salary ?? data.max_salary);
        if (!Number.isFinite(threshold) || threshold <= 0) {
            throw new BreRuleError("Threshold salary must be a positive number.");
        }
        minSal = 0;
        maxSal = threshold;
    } else if (conditionType === "greater_than") {
        const threshold = Number(data.threshold_salary ?? data.min_salary);
        if (!Number.isFinite(threshold) || threshold < 0) {
            throw new BreRuleError("Threshold salary must be a valid positive number.");
        }
        minSal = threshold;
        maxSal = 99999999;
    } else {
        // "range"
        minSal = Number(data.min_salary);
        maxSal = Number(data.max_salary);
        if (!Number.isFinite(minSal) || minSal < 0) {
            throw new BreRuleError("Minimum salary must be zero or a positive number.");
        }
        if (!Number.isFinite(maxSal) || maxSal <= minSal) {
            throw new BreRuleError("Maximum salary must be greater than minimum salary.");
        }
    }

    return { conditionType, minSal, maxSal };
}

/**
 * Formats a salary range label for user feedback.
 */
function formatRangeLabel(min: number, max: number): string {
    if (min === 0 && max < 99999999) {
        return `< ₹${max.toLocaleString()}`;
    }
    if (max >= 99999999) {
        return `> ₹${min.toLocaleString()}`;
    }
    return `₹${min.toLocaleString()} - ₹${max.toLocaleString()}`;
}

/**
 * Adds a new BRE rule for a bank with non-overlapping range validation.
 */
export async function createRule(data: any, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const bankName = String(data.bank_name || "").trim();
    if (!bankName) {
        throw new BreRuleError("Bank name is required.");
    }

    const category = String(data.category || "CAT A").trim().toUpperCase() || "CAT A";
    const { conditionType, minSal, maxSal } = resolveSalaryBounds(data);

    const foirPercent = Number(data.foir_percent);
    if (!Number.isFinite(foirPercent) || foirPercent < 0 || foirPercent > 100) {
        throw new BreRuleError("Applicable FOIR percentage must be between 0 and 100.");
    }

    // Auto-generate rule name if not provided
    let ruleName = String(data.rule_name || "").trim();
    if (!ruleName) {
        const countRow = await k("bre_rules")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
            .whereRaw("LOWER(TRIM(category)) = LOWER(TRIM(?))", [category])
            .count("id as total")
            .first();
        const nextNum = Number(countRow?.total || 0) + 1;
        ruleName = `Rule ${nextNum}`;
    }

    // Overlap validation against active rules for the same bank and category
    const collision = await findOverlappingRule(bankName, category, minSal, maxSal, null, k, ruleName);
    if (collision) {
        const collisionLabel = formatRangeLabel(Number(collision.min_salary), Number(collision.max_salary));
        throw new BreRuleError(
            `Salary range ${formatRangeLabel(minSal, maxSal)} for ${category} overlaps with existing active ${collision.rule_name} (${collisionLabel}). Please adjust salary bounds.`
        );
    }

    const [created] = await k("bre_rules")
        .insert({
            bank_name: bankName,
            category: category,
            rule_name: ruleName,
            condition_type: conditionType,
            min_salary: minSal,
            max_salary: maxSal,
            foir_percent: foirPercent,
            active: 1
        })
        .returning([
            "id",
            "bank_name",
            "category",
            "rule_name",
            "condition_type",
            "min_salary",
            "max_salary",
            "foir_percent",
            "active",
            "created_at",
            "updated_at"
        ]);

    return {
        id: Number(created.id),
        bank_name: created.bank_name,
        category: created.category || "CAT A",
        rule_name: created.rule_name,
        condition_type: created.condition_type,
        min_salary: Number(created.min_salary),
        max_salary: Number(created.max_salary),
        foir_percent: Number(created.foir_percent),
        active: Number(created.active) === 1,
        created_at: created.created_at,
        updated_at: created.updated_at
    };
}

/**
 * Updates an existing BRE rule with validation.
 */
export async function updateRule(id: any, data: any, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const ruleId = Number(id);
    if (!Number.isSafeInteger(ruleId) || ruleId <= 0) {
        throw new BreRuleError("A valid rule ID is required.");
    }

    const existing = await k("bre_rules").where("id", ruleId).first();
    if (!existing) {
        throw new BreRuleError("BRE rule not found.", 404);
    }

    const bankName = String(data.bank_name || existing.bank_name).trim();
    const category = String(data.category || existing.category || "CAT A").trim().toUpperCase() || "CAT A";
    const { conditionType, minSal, maxSal } = resolveSalaryBounds(data);

    const foirPercent = Number(data.foir_percent);
    if (!Number.isFinite(foirPercent) || foirPercent < 0 || foirPercent > 100) {
        throw new BreRuleError("Applicable FOIR percentage must be between 0 and 100.");
    }

    const ruleName = String(data.rule_name || existing.rule_name).trim() || existing.rule_name;

    // Check collision against other active rules for same bank & category (excluding this rule)
    if (Number(existing.active) === 1) {
        const collision = await findOverlappingRule(bankName, category, minSal, maxSal, ruleId, k, ruleName);
        if (collision) {
            const collisionLabel = formatRangeLabel(Number(collision.min_salary), Number(collision.max_salary));
            throw new BreRuleError(
                `Salary range ${formatRangeLabel(minSal, maxSal)} for ${category} overlaps with existing active ${collision.rule_name} (${collisionLabel}). Please adjust salary bounds.`
            );
        }
    }

    const [updated] = await k("bre_rules")
        .where("id", ruleId)
        .update({
            bank_name: bankName,
            category: category,
            rule_name: ruleName,
            condition_type: conditionType,
            min_salary: minSal,
            max_salary: maxSal,
            foir_percent: foirPercent,
            updated_at: k.fn.now()
        })
        .returning([
            "id",
            "bank_name",
            "category",
            "rule_name",
            "condition_type",
            "min_salary",
            "max_salary",
            "foir_percent",
            "active",
            "created_at",
            "updated_at"
        ]);

    return {
        id: Number(updated.id),
        bank_name: updated.bank_name,
        category: updated.category || "CAT A",
        rule_name: updated.rule_name,
        condition_type: updated.condition_type,
        min_salary: Number(updated.min_salary),
        max_salary: Number(updated.max_salary),
        foir_percent: Number(updated.foir_percent),
        active: Number(updated.active) === 1,
        created_at: updated.created_at,
        updated_at: updated.updated_at
    };
}

/**
 * Toggles a rule's active/inactive status.
 * If activating, verifies it will not collide with an active rule.
 */
export async function toggleRuleStatus(id: any, active: boolean, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const ruleId = Number(id);
    if (!Number.isSafeInteger(ruleId) || ruleId <= 0) {
        throw new BreRuleError("A valid rule ID is required.");
    }

    const existing = await k("bre_rules").where("id", ruleId).first();
    if (!existing) {
        throw new BreRuleError("BRE rule not found.", 404);
    }

    const nextActive = active ? 1 : 0;

    // If activating, verify no overlap with current active rules for same bank & category
    if (nextActive === 1) {
        const collision = await findOverlappingRule(
            existing.bank_name,
            existing.category || "CAT A",
            Number(existing.min_salary),
            Number(existing.max_salary),
            ruleId,
            k,
            existing.rule_name
        );
        if (collision) {
            const collisionLabel = formatRangeLabel(Number(collision.min_salary), Number(collision.max_salary));
            throw new BreRuleError(
                `Cannot activate ${existing.rule_name}: range overlaps with active ${collision.rule_name} (${collisionLabel}) in ${existing.category || 'CAT A'}.`
            );
        }
    }

    const [updated] = await k("bre_rules")
        .where("id", ruleId)
        .update({
            active: nextActive,
            updated_at: k.fn.now()
        })
        .returning([
            "id",
            "bank_name",
            "category",
            "rule_name",
            "condition_type",
            "min_salary",
            "max_salary",
            "foir_percent",
            "active",
            "created_at",
            "updated_at"
        ]);

    return {
        id: Number(updated.id),
        bank_name: updated.bank_name,
        category: updated.category || "CAT A",
        rule_name: updated.rule_name,
        condition_type: updated.condition_type,
        min_salary: Number(updated.min_salary),
        max_salary: Number(updated.max_salary),
        foir_percent: Number(updated.foir_percent),
        active: Number(updated.active) === 1,
        created_at: updated.created_at,
        updated_at: updated.updated_at
    };
}

/**
 * Deletes a rule from PostgreSQL.
 */
export async function deleteRule(id: any, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const ruleId = Number(id);
    if (!Number.isSafeInteger(ruleId) || ruleId <= 0) {
        throw new BreRuleError("A valid rule ID is required.");
    }

    const affected = await k("bre_rules").where("id", ruleId).delete();
    if (!affected) {
        throw new BreRuleError("BRE rule not found.", 404);
    }

    return { success: true, message: "Rule deleted successfully." };
}

/**
 * Bulk imports BRE rules from CSV content.
 * Automatically persists to PostgreSQL bre_rules and registers banks in managed_banks.
 */
function cleanNumber(val: any): number | null {
    if (val === undefined || val === null) return null;
    let s = String(val).trim();
    if (!s) return null;
    s = s.replace(/[₹$€£\s,/\\]/g, "");
    if (/^(\d+(?:\.\d+)?)[kK]$/.test(s)) {
        const m = s.match(/^(\d+(?:\.\d+)?)[kK]$/);
        return m ? Math.round(parseFloat(m[1]) * 1000) : null;
    }
    if (/^(\d+(?:\.\d+)?)(?:[lL]|lakh|lac)$/i.test(s)) {
        const m = s.match(/^(\d+(?:\.\d+)?)(?:[lL]|lakh|lac)$/i);
        return m ? Math.round(parseFloat(m[1]) * 100000) : null;
    }
    const num = parseFloat(s);
    return Number.isFinite(num) ? num : null;
}

function cleanFoir(val: any): number | null {
    if (val === undefined || val === null) return null;
    let s = String(val).trim();
    if (!s) return null;

    // Check for ranges such as "40% – 45%", "40% - 45%", or "40 to 45%"
    const rangeMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:%|pct)?\s*(?:to|-|–|—)\s*(\d+(?:\.\d+)?)\s*%/i) ||
        s.match(/(\d+(?:\.\d+)?)\s*(?:to|-|–|—)\s*(\d+(?:\.\d+)?)/);
    if (rangeMatch) {
        const high = parseFloat(rangeMatch[2]);
        if (Number.isFinite(high) && high >= 0 && high <= 100) return high;
    }

    s = s.replace(/%/g, "").trim().replace(/,/g, "");
    const num = parseFloat(s);
    if (!Number.isFinite(num)) return null;
    if (num > 0 && num <= 1.0) {
        return Math.round(num * 100 * 100) / 100;
    }
    if (num >= 0 && num <= 100) {
        return num;
    }
    return null;
}

function parseSalaryFromRow(row: Record<string, string>): { minSal: number; maxSal: number; conditionType: string } | null {
    const rawMin = row.minsalary ?? row.min ?? row.minsal ?? row.salaryfrom ?? row.from ?? row.minimumsalary ?? row.minimum ?? row.minincome;
    const rawMax = row.maxsalary ?? row.max ?? row.maxsal ?? row.salaryto ?? row.to ?? row.maximumsalary ?? row.maximum ?? row.maxincome;

    const parsedMin = cleanNumber(rawMin);
    const parsedMax = cleanNumber(rawMax);

    if (parsedMin !== null && parsedMax !== null) {
        let cond = String(row.conditiontype ?? row.type ?? row.condition ?? "range").trim().toLowerCase();
        if (parsedMin === 0 && parsedMax < 99999999) {
            cond = "less_than";
        } else if (parsedMax >= 99999999) {
            cond = "greater_than";
        } else {
            cond = "range";
        }
        return { minSal: parsedMin, maxSal: parsedMax, conditionType: cond };
    }

    const rangeCandidate = row.condition ?? row.conditiontext ?? row.conditiondesc ?? row.salarycondition ?? row.salaryrange ?? row.salaryslab ?? row.slab ?? row.salarybracket ?? row.salary ?? row.monthlyincome ?? row.incomerange ?? row.income ?? row.netsalary ?? row.grosssalary ?? row.netmonthlyincome ?? row.salaryband ?? row.band ?? rawMin ?? rawMax ?? "";

    if (typeof rangeCandidate === "string" && rangeCandidate.trim()) {
        const s = rangeCandidate.trim();

        const lessMatch = s.match(/(?:<|<=|upto|up\s*to|below|less\s*than)\s*([₹$]?[0-9,]+(?:\.[0-9]+)?\s*[kKlL]?)/i);
        if (lessMatch) {
            const val = cleanNumber(lessMatch[1]);
            if (val !== null && val > 0) {
                return { minSal: 0, maxSal: val, conditionType: "less_than" };
            }
        }

        const greaterMatch = s.match(/(?:>|>=|above|greater\s*than|more\s*than)\s*([₹$]?[0-9,]+(?:\.[0-9]+)?\s*[kKlL]?)/i) ||
            s.match(/([₹$]?[0-9,]+(?:\.[0-9]+)?\s*[kKlL]?)\s*(?:\+|and\s*above|and\s*more|above)/i);
        if (greaterMatch) {
            const val = cleanNumber(greaterMatch[1]);
            if (val !== null && val > 0) {
                return { minSal: val, maxSal: 99999999, conditionType: "greater_than" };
            }
        }

        const rangeMatch = s.match(/([₹$]?[0-9,]+(?:\.[0-9]+)?\s*[kKlL]?)\s*(?:-|–|—|to)\s*([₹$]?[0-9,]+(?:\.[0-9]+)?\s*[kKlL]?)/i);
        if (rangeMatch) {
            const low = cleanNumber(rangeMatch[1]);
            const high = cleanNumber(rangeMatch[2]);
            if (low !== null && high !== null) {
                if (low === 0) {
                    return { minSal: 0, maxSal: high, conditionType: "less_than" };
                }
                if (high >= 99999999) {
                    return { minSal: low, maxSal: 99999999, conditionType: "greater_than" };
                }
                return { minSal: low, maxSal: high, conditionType: "range" };
            }
        }

        const singleVal = cleanNumber(s);
        if (singleVal !== null) {
            const cond = String(row.conditiontype ?? row.type ?? row.condition ?? "range").trim().toLowerCase();
            if (cond === "greater_than") {
                return { minSal: singleVal, maxSal: 99999999, conditionType: "greater_than" };
            } else {
                return { minSal: 0, maxSal: singleVal, conditionType: "less_than" };
            }
        }
    }

    return null;
}

function parseFoirFromRow(row: Record<string, string>): number | null {
    const rawFoir = row.foir ?? row.foirpercent ?? row.foirpct ?? row.foirpercentage ?? row.applicablefoir ?? row.maxfoir ?? row.foirlimit ?? row.foirratio ?? row.ratio ?? row.percentage ?? row.percent ?? row.limit ?? row.foirvalue;
    return cleanFoir(rawFoir);
}

/**
 * Bulk imports BRE rules from CSV content.
 * Automatically persists to PostgreSQL bre_rules and registers banks in managed_banks.
 */
export async function bulkImportBreRules(
    csvContent: string,
    defaultBank: string = "",
    dbOrPool?: any
) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    if (typeof csvContent !== "string" || !csvContent.trim()) {
        throw new BreRuleError("CSV content is required.");
    }

    const rows = parseCsv(csvContent);
    if (rows.length === 0) {
        throw new BreRuleError("No valid rows found in CSV.");
    }

    return await k.transaction(async (trx) => {
        let inserted = 0;
        let updated = 0;
        const banksSet = new Set<string>();

        let managedBanksList: Array<{ bank_name: string }> = [];
        try {
            managedBanksList = await trx("managed_banks").select("bank_name");
        } catch {
            // Ignore if managed_banks unavailable
        }

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rawBank = String(row.bank || row.bankname || row.lender || row.partnerbank || row._titlebank || defaultBank || "").trim();
            if (!rawBank) continue;

            // Resolve bank name against managed_banks (e.g. ICICI Bank <=> ICICI)
            let bankName = rawBank;
            const matched = managedBanksList.find((m: any) => {
                const mn = String(m.bank_name).toLowerCase();
                const rn = rawBank.toLowerCase();
                return mn === rn || mn === rn.replace(/\s+bank$/i, "") || `${mn} bank` === rn;
            });
            if (matched) {
                bankName = matched.bank_name;
            }

            banksSet.add(bankName);

            const isIcici = bankName.toLowerCase().includes("icici");
            const rawCat = row.category || row.cat || row.categoryname || row.tier || (isIcici ? "ALL" : "CAT A");
            const category = String(rawCat).trim().toUpperCase() || (isIcici ? "ALL" : "CAT A");

            const salaryParsed = parseSalaryFromRow(row);
            if (!salaryParsed) continue;

            const foir = parseFoirFromRow(row);
            if (foir === null) continue;

            let ruleName = String(row.rulename || row.rule || row.ruleid || row.name || row.sno || row.srno || row.serialno || row.ruleno || "").trim();
            const conditionRaw = String(row.condition || row.conditiontype || row.salaryrange || "").trim();
            const hasHomeLoan = /home\s*lo[ane]/i.test(conditionRaw) || /home\s*lo[ane]/i.test(ruleName);

            if (ruleName) {
                if (/^\d+$/.test(ruleName)) {
                    ruleName = `Rule ${ruleName}`;
                }
                if (hasHomeLoan && !/home\s*lo[ane]/i.test(ruleName)) {
                    ruleName = `${ruleName} (With Home Loan)`;
                }
            } else {
                if (hasHomeLoan) {
                    ruleName = `Salary >= ₹${salaryParsed.minSal.toLocaleString()} + Home Loan`;
                } else if (salaryParsed.conditionType === "less_than") {
                    ruleName = `Salary <= ₹${salaryParsed.maxSal.toLocaleString()}`;
                } else if (salaryParsed.conditionType === "greater_than") {
                    ruleName = `Salary >= ₹${salaryParsed.minSal.toLocaleString()}`;
                } else {
                    ruleName = `₹${salaryParsed.minSal.toLocaleString()} - ₹${salaryParsed.maxSal.toLocaleString()}`;
                }
            }

            const activeVal = row.active !== undefined && String(row.active).trim() !== ""
                ? (String(row.active).toLowerCase() === "true" || String(row.active) === "1" ? 1 : 0)
                : 1;

            if (salaryParsed.maxSal <= salaryParsed.minSal) continue;

            // Check if rule exists by bank_name, category and rule_name
            const existing = await trx("bre_rules")
                .select("id")
                .where((builder: any) => {
                    const bClean = bankName.toLowerCase().replace(/\s+bank$/i, "");
                    builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                        .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bClean])
                        .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bClean} bank`]);
                })
                .whereRaw("LOWER(TRIM(category)) = LOWER(TRIM(?))", [category])
                .whereRaw("LOWER(TRIM(rule_name)) = LOWER(TRIM(?))", [ruleName])
                .first();

            if (existing) {
                await trx("bre_rules")
                    .where("id", existing.id)
                    .update({
                        bank_name: bankName,
                        category: category,
                        rule_name: ruleName,
                        condition_type: salaryParsed.conditionType,
                        min_salary: salaryParsed.minSal,
                        max_salary: salaryParsed.maxSal,
                        foir_percent: foir,
                        active: activeVal,
                        updated_at: trx.fn.now()
                    });
                updated++;
            } else {
                await trx("bre_rules").insert({
                    bank_name: bankName,
                    category: category,
                    rule_name: ruleName,
                    condition_type: salaryParsed.conditionType,
                    min_salary: salaryParsed.minSal,
                    max_salary: salaryParsed.maxSal,
                    foir_percent: foir,
                    active: activeVal
                });
                inserted++;
            }
        }

        if (inserted === 0 && updated === 0) {
            throw new BreRuleError("No valid rules could be parsed from the CSV. Please ensure the CSV contains salary columns (e.g. 'Min Salary, Max Salary' or 'Salary Range') and a 'FOIR' column.");
        }

        return {
            total: rows.length,
            inserted,
            updated,
            banks: Array.from(banksSet)
        };
    });
}

/**
 * Resolves the applicable FOIR for an applicant dynamically from active BRE rules.
 * If bank is ICICI, resolves uniformly across categories.
 * Accurately matches Home Loan condition rules when applicant has a Home Loan.
 */
export async function resolveBreFoir(
    bankName: string,
    category: string,
    monthlySalary: number,
    optionsOrDb?: any,
    maybeDb?: any
): Promise<{ foir_percent: number; foirPercent: number; rule_name: string; matched: boolean } | null> {
    let hasHomeLoan = false;
    let dbOrPool = maybeDb;

    if (typeof optionsOrDb === "boolean") {
        hasHomeLoan = optionsOrDb;
    } else if (optionsOrDb && typeof optionsOrDb === "object") {
        if ("hasHomeLoan" in optionsOrDb) {
            hasHomeLoan = Boolean(optionsOrDb.hasHomeLoan);
            dbOrPool = optionsOrDb.dbOrPool ?? maybeDb;
        } else {
            dbOrPool = optionsOrDb;
        }
    } else if (typeof optionsOrDb === "function") {
        dbOrPool = optionsOrDb;
    }

    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const bank = String(bankName || "").trim();
    const cat = String(category || "CAT A").trim().toUpperCase();
    const sal = Number(monthlySalary) || 0;
    const isIcici = bank.toLowerCase().includes("icici");

    const bankClean = bank.toLowerCase().replace(/\s+bank$/i, "").trim();

    const rulesForSal = await k("bre_rules")
        .select("rule_name", "category", "foir_percent", "min_salary", "max_salary")
        .where("active", 1)
        .where((builder: any) => {
            builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bank])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
        })
        .where("min_salary", "<=", sal)
        .where("max_salary", ">=", sal)
        .orderBy("min_salary", "desc");

    if (!rulesForSal || rulesForSal.length === 0) {
        return null;
    }

    // Rank rules by category match specificity
    const scoredRules: Array<{ rule: any; score: number }> = [];

    for (const r of rulesForSal) {
        const rCat = String(r.category || "").trim().toUpperCase();
        if (rCat === cat) {
            scoredRules.push({ rule: r, score: 0 }); // exact match
        } else if (categoryMatches(cat, rCat)) {
            scoredRules.push({ rule: r, score: 1 }); // composite / token match
        } else if (isIcici && rCat === "CAT A") {
            scoredRules.push({ rule: r, score: 2 }); // icici fallback
        } else if (rCat === "ALL") {
            scoredRules.push({ rule: r, score: 3 }); // universal fallback
        } else if (rCat === "DEFAULT") {
            scoredRules.push({ rule: r, score: 4 }); // default fallback
        }
    }

    scoredRules.sort((a, b) => a.score - b.score);

    if (scoredRules.length === 0) {
        return null;
    }

    const bestScore = scoredRules[0].score;
    const candidateRules = scoredRules.filter(s => s.score === bestScore).map(s => s.rule);

    let matched = null;

    if (hasHomeLoan) {
        // Prefer rules specifically accounting for Home Loan
        const hlRule = candidateRules.find((r: any) => /home\s*lo[ane]/i.test(r.rule_name));
        matched = hlRule || candidateRules[0];
    } else {
        // Exclude Home Loan specific rules when applicant does not have a Home Loan
        const nonHlRule = candidateRules.find((r: any) => !/home\s*lo[ane]/i.test(r.rule_name));
        matched = nonHlRule || candidateRules[0];
    }

    if (matched) {
        return {
            foir_percent: Number(matched.foir_percent),
            foirPercent: Number(matched.foir_percent),
            rule_name: matched.rule_name,
            matched: true
        };
    }

    return null;
}

export default {
    BreRuleError,
    ensureBreRulesTable,
    listRulesByBank,
    createRule,
    updateRule,
    toggleRuleStatus,
    deleteRule,
    bulkImportBreRules,
    resolveBreFoir
};
