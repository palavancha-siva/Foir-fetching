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
        // Ensure version_id column exists in existing table
        const hasVersionId = await k.schema.hasColumn("bre_rules", "version_id");
        if (!hasVersionId) {
            await k.schema.alterTable("bre_rules", (table) => {
                table.bigInteger("version_id").nullable();
            });
            await k.raw(`
                CREATE INDEX IF NOT EXISTS idx_bre_rules_version_id
                ON bre_rules (version_id)
            `);
        }
    }

    const versionsTableExists = await k.schema.hasTable("bre_rule_versions");
    if (!versionsTableExists) {
        await k.schema.createTable("bre_rule_versions", (table) => {
            table.bigIncrements("id").primary();
            table.text("bank_name").notNullable();
            table.integer("version_number").notNullable().defaultTo(1);
            table.text("version_tag").notNullable().defaultTo("v1");
            table.text("filename").notNullable().defaultTo("rules.csv");
            table.integer("rule_count").notNullable().defaultTo(0);
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamp("uploaded_at", { useTz: true }).notNullable().defaultTo(k.fn.now());
            table.text("uploaded_by").notNullable().defaultTo("Admin");
        });

        await k.raw(`
            CREATE INDEX IF NOT EXISTS idx_bre_rule_versions_bank_active
            ON bre_rule_versions (LOWER(TRIM(bank_name)), active, version_number DESC)
        `);
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

    // Baseline migration for existing legacy rules without a version_id
    try {
        const unversionedBanks = await k("bre_rules")
            .whereNull("version_id")
            .distinct("bank_name");

        for (const row of unversionedBanks) {
            const bName = row.bank_name;
            if (!bName) continue;

            let baselineVer = await k("bre_rule_versions")
                .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bName])
                .orderBy("version_number", "asc")
                .first();

            const countResult = await k("bre_rules")
                .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bName])
                .whereNull("version_id")
                .count("id as total")
                .first();
            const totalRules = Number(countResult?.total || 0);

            if (!baselineVer) {
                const [newVer] = await k("bre_rule_versions")
                    .insert({
                        bank_name: bName,
                        version_number: 1,
                        version_tag: "v1 (Baseline)",
                        filename: "initial_baseline.csv",
                        rule_count: totalRules,
                        active: 1,
                        uploaded_by: "System Initializer"
                    })
                    .returning("*");
                baselineVer = newVer;
            }

            if (baselineVer && baselineVer.id) {
                await k("bre_rules")
                    .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bName])
                    .whereNull("version_id")
                    .update({ version_id: baselineVer.id });
            }
        }
    } catch (migErr) {
        console.error("Migration baseline error in ensureBreRulesTable:", migErr);
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
 * Lists all uploaded rule versions for a partner bank ordered by version number descending.
 */
export async function listVersionsByBank(bankName: string, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const bank = String(bankName || "").trim();
    if (!bank) {
        return [];
    }

    const bankClean = bank.toLowerCase().replace(/\s+bank$/i, "").trim();

    const rows = await k("bre_rule_versions")
        .select(
            "id",
            "bank_name",
            "version_number",
            "version_tag",
            "filename",
            "rule_count",
            "active",
            "uploaded_at",
            "uploaded_by"
        )
        .where((builder: any) => {
            builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bank])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`])
                .orWhereRaw("LOWER(TRIM(bank_name)) LIKE ?", [`%${bankClean}%`])
                .orWhereRaw("LOWER(?) LIKE CONCAT('%', LOWER(TRIM(bank_name)), '%')", [bank]);
        })
        .orderBy("version_number", "desc");

    return rows.map((r: any) => ({
        id: Number(r.id),
        bank_name: r.bank_name,
        version_number: Number(r.version_number),
        version_tag: r.version_tag || `v${r.version_number}`,
        filename: r.filename,
        rule_count: Number(r.rule_count),
        active: Number(r.active) === 1,
        uploaded_at: r.uploaded_at,
        uploaded_by: r.uploaded_by
    }));
}

/**
 * Activates a specific rule version for a partner bank and atomically deactivates all other versions.
 * Also synchronizes the active status of rules in `bre_rules` for that bank.
 */
export async function activateVersion(versionId: any, dbOrPool?: any) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const vId = Number(versionId);
    if (!Number.isSafeInteger(vId) || vId <= 0) {
        throw new BreRuleError("A valid version ID is required.");
    }

    const targetVer = await k("bre_rule_versions").where("id", vId).first();
    if (!targetVer) {
        throw new BreRuleError(`Rule version #${vId} not found.`, 404);
    }

    const bankName = targetVer.bank_name;
    const bankClean = bankName.toLowerCase().replace(/\s+bank$/i, "").trim();

    return await k.transaction(async (trx) => {
        // 1. Mark all versions for this bank as Inactive
        await trx("bre_rule_versions")
            .where((builder: any) => {
                builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                    .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                    .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
            })
            .update({ active: 0 });

        // 2. Mark the targeted version as Active
        await trx("bre_rule_versions")
            .where("id", vId)
            .update({ active: 1 });

        // 3. Mark all rules for this bank as Inactive
        await trx("bre_rules")
            .where((builder: any) => {
                builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                    .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                    .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
            })
            .update({ active: 0 });

        // 4. Mark all rules belonging to this version as Active
        await trx("bre_rules")
            .where("version_id", vId)
            .update({ active: 1 });

        return {
            success: true,
            message: `Version ${targetVer.version_tag || ('v' + targetVer.version_number)} is now Active for ${bankName}. All previous versions have been set to Inactive for audit/rollback.`,
            version: {
                id: vId,
                bank_name: bankName,
                version_number: Number(targetVer.version_number),
                version_tag: targetVer.version_tag || `v${targetVer.version_number}`,
                filename: targetVer.filename,
                rule_count: Number(targetVer.rule_count),
                active: true
            }
        };
    });
}

/**
 * Lists BRE rules for a bank. If versionId is provided, returns rules for that version.
 * Otherwise returns rules for the currently active version (or all baseline rules if unversioned).
 */
export async function listRulesByBank(bankName: string, dbOrPool?: any, versionId?: any) {
    const k = getKnex(dbOrPool);
    await ensureBreRulesTable(k);

    const bank = String(bankName || "").trim();
    if (!bank) {
        return [];
    }

    const bankClean = bank.toLowerCase().replace(/\s+bank$/i, "").trim();

    const qb = k("bre_rules")
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
            "version_id",
            "created_at",
            "updated_at"
        )
        .where((builder: any) => {
            builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bank])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`])
                .orWhereRaw("LOWER(TRIM(bank_name)) LIKE ?", [`%${bankClean}%`])
                .orWhereRaw("LOWER(?) LIKE CONCAT('%', LOWER(TRIM(bank_name)), '%')", [bank]);
        });

    const parsedVerId = Number(versionId);
    if (Number.isSafeInteger(parsedVerId) && parsedVerId > 0) {
        qb.where("version_id", parsedVerId);
    } else {
        // By default, filter by the active version if an active version exists
        const activeVer = await k("bre_rule_versions")
            .select("id")
            .where("active", 1)
            .where((builder: any) => {
                builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bank])
                    .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                    .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
            })
            .first();

        if (activeVer) {
            qb.where("version_id", activeVer.id);
        }
    }

    const rows = await qb
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
        version_id: r.version_id ? Number(r.version_id) : null,
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

    // Attach to active version for this bank if present, or create baseline v1
    let activeVer = await k("bre_rule_versions")
        .where("active", 1)
        .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
        .first();

    if (!activeVer) {
        const [createdVer] = await k("bre_rule_versions")
            .insert({
                bank_name: bankName,
                version_number: 1,
                version_tag: "v1",
                filename: `${bankName.toLowerCase().replace(/\s+/g, "_")}_rules_v1.csv`,
                rule_count: 0,
                active: 1,
                uploaded_by: "Admin"
            })
            .returning("*");
        activeVer = createdVer;
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
            active: 1,
            version_id: activeVer ? activeVer.id : null
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
            "version_id",
            "created_at",
            "updated_at"
        ]);

    if (activeVer && activeVer.id) {
        try {
            await k("bre_rule_versions").where("id", activeVer.id).increment("rule_count", 1);
        } catch {
            // Ignore
        }
    }

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

    const existingRule = await k("bre_rules").where("id", ruleId).first();
    if (!existingRule) {
        throw new BreRuleError("BRE rule not found.", 404);
    }

    await k("bre_rules").where("id", ruleId).delete();

    if (existingRule.version_id) {
        try {
            await k("bre_rule_versions")
                .where("id", existingRule.version_id)
                .where("rule_count", ">", 0)
                .decrement("rule_count", 1);
        } catch {
            // Ignore
        }
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
 * Bulk imports BRE rules from CSV content into a new version.
 * Does NOT overwrite or delete existing rules or versions.
 * Previous versions are preserved as Inactive for audit and rollback.
 * The newly uploaded version becomes the single Active version for the bank.
 */
export async function bulkImportBreRules(
    csvContent: string,
    defaultBank: string = "",
    dbOrPool?: any,
    overrideBank: boolean = false,
    filename: string = "uploaded_rules.csv",
    uploadedBy: string = "Admin"
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
        const banksSet = new Set<string>();

        let managedBanksList: Array<{ bank_name: string }> = [];
        try {
            managedBanksList = await trx("managed_banks").select("bank_name");
        } catch {
            // Ignore if managed_banks unavailable
        }

        // 1. Parse and validate all rows
        const parsedItems: Array<{
            bankName: string;
            category: string;
            ruleName: string;
            conditionType: string;
            minSal: number;
            maxSal: number;
            foir: number;
            activeVal: number;
        }> = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rawBank = (overrideBank && defaultBank)
                ? defaultBank
                : String(row.bank || row.bankname || row.lender || row.partnerbank || row._titlebank || defaultBank || "").trim();
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

            parsedItems.push({
                bankName,
                category,
                ruleName,
                conditionType: salaryParsed.conditionType,
                minSal: salaryParsed.minSal,
                maxSal: salaryParsed.maxSal,
                foir,
                activeVal
            });
        }

        if (parsedItems.length === 0) {
            throw new BreRuleError("No valid rules could be parsed from the CSV. Please ensure the CSV contains salary columns (e.g. 'Min Salary, Max Salary' or 'Salary Range') and a 'FOIR' column.");
        }

        // 2. Group parsed rules by bank
        const bankGroups = new Map<string, typeof parsedItems>();
        for (const item of parsedItems) {
            const key = item.bankName.toLowerCase();
            if (!bankGroups.has(key)) {
                bankGroups.set(key, []);
            }
            bankGroups.get(key)!.push(item);
        }

        const createdVersions: any[] = [];

        for (const [_bKey, bItems] of bankGroups) {
            const bankName = bItems[0].bankName;
            const bankClean = bankName.toLowerCase().replace(/\s+bank$/i, "").trim();

            // Find current max version number for this bank
            const maxVerRow = await trx("bre_rule_versions")
                .where((builder: any) => {
                    builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                        .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                        .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
                })
                .max("version_number as max_ver")
                .first();

            const nextVersionNum = (Number(maxVerRow?.max_ver) || 0) + 1;
            const versionTag = `v${nextVersionNum}`;
            const safeFilename = filename && filename.trim()
                ? filename.trim()
                : `${bankName.toLowerCase().replace(/\s+/g, "_")}_rules_${versionTag}.csv`;

            // Mark all prior versions for this bank as Inactive (retained for audit/rollback)
            await trx("bre_rule_versions")
                .where((builder: any) => {
                    builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                        .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                        .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
                })
                .update({ active: 0 });

            // Mark all existing rules for this bank as Inactive
            await trx("bre_rules")
                .where((builder: any) => {
                    builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                        .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                        .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
                })
                .update({ active: 0 });

            // Insert new version record as the sole Active version
            const [newVer] = await trx("bre_rule_versions")
                .insert({
                    bank_name: bankName,
                    version_number: nextVersionNum,
                    version_tag: versionTag,
                    filename: safeFilename,
                    rule_count: bItems.length,
                    active: 1,
                    uploaded_by: uploadedBy || "Admin",
                    uploaded_at: trx.fn.now()
                })
                .returning([
                    "id",
                    "bank_name",
                    "version_number",
                    "version_tag",
                    "filename",
                    "rule_count",
                    "active",
                    "uploaded_at",
                    "uploaded_by"
                ]);

            createdVersions.push({
                id: Number(newVer.id),
                bank_name: newVer.bank_name,
                version_number: Number(newVer.version_number),
                version_tag: newVer.version_tag,
                filename: newVer.filename,
                rule_count: Number(newVer.rule_count),
                active: Number(newVer.active) === 1,
                uploaded_at: newVer.uploaded_at,
                uploaded_by: newVer.uploaded_by
            });

            // Insert each rule into bre_rules linked to this new version_id and active = 1
            for (const item of bItems) {
                await trx("bre_rules").insert({
                    bank_name: bankName,
                    category: item.category,
                    rule_name: item.ruleName,
                    condition_type: item.conditionType,
                    min_salary: item.minSal,
                    max_salary: item.maxSal,
                    foir_percent: item.foir,
                    active: item.activeVal,
                    version_id: newVer.id
                });
                inserted++;
            }
        }

        return {
            total: parsedItems.length,
            inserted,
            updated: 0,
            versions: createdVersions,
            version: createdVersions[0] || null,
            banks: Array.from(banksSet)
        };
    });
}

/**
 * Resolves the applicable FOIR for an applicant dynamically from active BRE rules.
 * Strictly scopes rule evaluation to the single ACTIVE version for the specified bank.
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

    // Query active version for this bank
    const activeVer = await k("bre_rule_versions")
        .select("id")
        .where("active", 1)
        .where((builder: any) => {
            builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bank])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
        })
        .first();

    const rulesForSalQb = k("bre_rules")
        .select("rule_name", "category", "foir_percent", "min_salary", "max_salary")
        .where("active", 1)
        .where((builder: any) => {
            builder.whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bank])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
                .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [`${bankClean} bank`]);
        })
        .where("min_salary", "<=", sal)
        .where("max_salary", ">=", sal);

    if (activeVer) {
        rulesForSalQb.where("version_id", activeVer.id);
    }

    const rulesForSal = await rulesForSalQb.orderBy("min_salary", "desc");

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
    listVersionsByBank,
    activateVersion,
    createRule,
    updateRule,
    toggleRuleStatus,
    deleteRule,
    bulkImportBreRules,
    resolveBreFoir
};
