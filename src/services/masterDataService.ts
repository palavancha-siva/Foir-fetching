// @ts-nocheck
"use strict";

const { Knex } = require("knex");
const { db: defaultDb } = require("../utils/dbUtil");
const { parseCsv, normalizeCsvRow } = require("../utils/csvParser");
const { findMatchingBreCategory, categoryMatches } = require("../utils/categoryMatcher");

class MasterDataNotFoundError extends Error { }
class InvalidMasterDataInputError extends Error { }

function getKnex(dbOrPool) {
    if (dbOrPool && typeof dbOrPool === "function" && typeof dbOrPool.select === "function") {
        return dbOrPool;
    }
    return defaultDb;
}

async function inTransaction(dbOrPool, operation) {
    const k = getKnex(dbOrPool);
    return k.transaction(async (trx) => {
        return operation(trx);
    });
}

async function initializeMasterData(dbOrPool) {
    const k = getKnex(dbOrPool);

    await k.raw(`
        ALTER TABLE company_bank_mappings
        ADD COLUMN IF NOT EXISTS cc_obligation_percent
        NUMERIC(5,2) NOT NULL DEFAULT 2
    `);

    await k.raw(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'company_bank_cc_obligation_percent_range'
                  AND conrelid = 'company_bank_mappings'::regclass
            ) THEN
                ALTER TABLE company_bank_mappings
                ADD CONSTRAINT company_bank_cc_obligation_percent_range
                CHECK (cc_obligation_percent >= 0
                       AND cc_obligation_percent <= 100);
            END IF;
        END;
        $$
    `);

    await k.raw(`
        CREATE TABLE IF NOT EXISTS managed_companies (
            id BIGSERIAL PRIMARY KEY,
            company_name TEXT NOT NULL,
            active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await k.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_managed_companies_active_name
        ON managed_companies (LOWER(TRIM(company_name)))
        WHERE active = 1
    `);

    await k.raw(`
        CREATE TABLE IF NOT EXISTS bank_categories (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await k.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_bank_categories_active_name
        ON bank_categories (LOWER(TRIM(name)))
        WHERE active = 1
    `);

    await k.raw(`
        CREATE TABLE IF NOT EXISTS managed_banks (
            id BIGSERIAL PRIMARY KEY,
            bank_name TEXT NOT NULL,
            active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await k.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_managed_banks_active_name
        ON managed_banks (LOWER(TRIM(bank_name)))
        WHERE active = 1
    `);

    await k.raw(`
        INSERT INTO managed_companies (company_name)
        SELECT DISTINCT TRIM(company_name)
        FROM company_bank_mappings
        WHERE active = 1
        AND TRIM(company_name) <> ''
        ON CONFLICT DO NOTHING
    `);

    await k.raw(`
        INSERT INTO managed_banks (bank_name)
        SELECT DISTINCT TRIM(bank_name)
        FROM company_bank_mappings
        WHERE active = 1
        AND TRIM(bank_name) <> ''
        ON CONFLICT DO NOTHING
    `);

    await k.raw(`
        INSERT INTO bank_categories (name)
        SELECT DISTINCT TRIM(cat)
        FROM company_bank_mappings
        WHERE active = 1
        AND cat IS NOT NULL
        AND TRIM(cat) <> ''
        ON CONFLICT DO NOTHING
    `);

    await k.raw(`
        CREATE TABLE IF NOT EXISTS bank_employer_catalog (
            id BIGSERIAL PRIMARY KEY,
            bank_name TEXT NOT NULL,
            employer_id TEXT,
            employer_name TEXT NOT NULL,
            normalized_name TEXT,
            employer_category TEXT NOT NULL,
            active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await k.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_employer_catalog_bank_emp
        ON bank_employer_catalog (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_name)))
        WHERE active = 1
    `);

    await k.raw(`
        CREATE TABLE IF NOT EXISTS bank_policy_matrix (
            id BIGSERIAL PRIMARY KEY,
            bank_name TEXT NOT NULL,
            category TEXT NOT NULL,
            sub_category TEXT,
            min_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
            max_salary NUMERIC(12,2) NOT NULL DEFAULT 99999999,
            tenure_months INTEGER NOT NULL,
            multiplier NUMERIC(5,2) NOT NULL DEFAULT 0,
            foir_percent NUMERIC(5,2) NOT NULL DEFAULT 70,
            is_kicker BOOLEAN NOT NULL DEFAULT FALSE,
            active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_salary_range CHECK (max_salary >= min_salary),
            CONSTRAINT chk_foir_matrix_range CHECK (foir_percent >= 0 AND foir_percent <= 100)
        )
    `);

    await k.raw(`
        CREATE INDEX IF NOT EXISTS idx_bank_policy_matrix_lookup
        ON bank_policy_matrix (LOWER(TRIM(bank_name)), LOWER(TRIM(category)), min_salary, max_salary, tenure_months)
        WHERE active = 1
    `);
}

function normalizeName(name, label, options = {}) {
    if (typeof name !== "string") {
        throw new InvalidMasterDataInputError(`${label} must be a string.`);
    }

    const normalized = name
        .replace(/[\r\n\t]+/g, " ")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const maxLength = (options && typeof options.maxLength === "number")
        ? options.maxLength
        : 120;

    if (!normalized || normalized.length > maxLength) {
        throw new InvalidMasterDataInputError(
            `${label} must be between 1 and ${maxLength} characters.`
        );
    }
    if (/[\u0000-\u001f\u007f]/.test(normalized)) {
        throw new InvalidMasterDataInputError(
            `${label} contains unsupported characters.`
        );
    }

    return normalized;
}

function normalizeId(id) {
    const parsed = Number(id);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new InvalidMasterDataInputError("A valid record ID is required.");
    }
    return parsed;
}

function normalizeFoir(foir) {
    if (
        (typeof foir !== "number" && typeof foir !== "string") ||
        (typeof foir === "string" && !foir.trim())
    ) {
        throw new InvalidMasterDataInputError(
            "FOIR must be a number between 0 and 100."
        );
    }
    const parsed = Number(foir);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        throw new InvalidMasterDataInputError(
            "FOIR must be a number between 0 and 100."
        );
    }
    return parsed;
}

function normalizePercentage(value, label, defaultValue = 2) {
    if (value === undefined) return defaultValue;
    if (
        (typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && !value.trim())
    ) {
        throw new InvalidMasterDataInputError(
            `${label} must be a number between 0 and 100.`
        );
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        throw new InvalidMasterDataInputError(
            `${label} must be a number between 0 and 100.`
        );
    }
    return parsed;
}

async function ensureCategory(name, trx) {
    if (!name) return null;
    const trimmed = name.trim();
    const existing = await trx("bank_categories")
        .select("id")
        .where("active", 1)
        .whereRaw("LOWER(TRIM(name)) = LOWER(TRIM(?))", [trimmed])
        .first();

    if (!existing) {
        await trx("bank_categories")
            .insert({
                name: trimmed,
                active: 1
            })
            .onConflict(trx.raw("(LOWER(TRIM(name))) WHERE active = 1"))
            .ignore();
    }
    return trimmed;
}

async function getActiveCompany(companyId, trx) {
    const row = await trx("managed_companies")
        .select("company_name")
        .where("id", companyId)
        .where("active", 1)
        .forUpdate()
        .first();

    if (!row) {
        throw new MasterDataNotFoundError("Company was not found.");
    }
    return row.company_name;
}

async function listCompanyMappings(companyId, dbOrPool) {
    const id = normalizeId(companyId);
    const k = getKnex(dbOrPool);

    const rows = await k("company_bank_mappings as mapping")
        .select(
            "mapping.id",
            "mapping.company_name",
            "mapping.bank_name",
            "mapping.cat",
            "mapping.foir",
            "mapping.cc_obligation_percent"
        )
        .join("managed_companies as company", function () {
            this.on(
                k.raw("LOWER(TRIM(company.company_name))"),
                "=",
                k.raw("LOWER(TRIM(mapping.company_name))")
            );
        })
        .where("company.id", id)
        .where("company.active", 1)
        .where("mapping.active", 1)
        .orderBy("mapping.bank_name", "asc")
        .orderBy("mapping.cat", "asc");

    return rows.map((row) => ({
        id: Number(row.id),
        company_name: row.company_name,
        bank_name: row.bank_name,
        cat: row.cat,
        foir: Number(row.foir),
        cc_obligation_percent: Number(row.cc_obligation_percent)
    }));
}

async function addBankMapping(companyId, values, dbOrPool) {
    const id = normalizeId(companyId);
    const bankName = normalizeName(values.bank_name, "Bank name");
    const category = values.cat == null || values.cat === ""
        ? null
        : normalizeName(values.cat, "Category");
    const foir = normalizeFoir(values.foir);
    const ccObligationPercent = normalizePercentage(
        values.cc_obligation_percent,
        "CC obligation percentage"
    );

    return inTransaction(dbOrPool, async (trx) => {
        const companyName = await getActiveCompany(id, trx);
        await ensureCategory(category, trx);

        const [row] = await trx("company_bank_mappings")
            .insert({
                company_name: companyName,
                bank_name: bankName,
                cat: category,
                foir: foir,
                cc_obligation_percent: ccObligationPercent,
                active: 1
            })
            .returning([
                "id",
                "company_name",
                "bank_name",
                "cat",
                "foir",
                "cc_obligation_percent"
            ]);

        return {
            id: Number(row.id),
            company_name: row.company_name,
            bank_name: row.bank_name,
            cat: row.cat,
            foir: Number(row.foir),
            cc_obligation_percent: Number(row.cc_obligation_percent)
        };
    });
}

async function updateBankMapping(companyId, mappingId, values, dbOrPool) {
    const id = normalizeId(companyId);
    const mapping = normalizeId(mappingId);
    const bankName = normalizeName(values.bank_name, "Bank name");
    const category = values.cat == null || values.cat === ""
        ? null
        : normalizeName(values.cat, "Category");
    const foir = normalizeFoir(values.foir);
    const ccObligationPercent = normalizePercentage(
        values.cc_obligation_percent,
        "CC obligation percentage"
    );

    return inTransaction(dbOrPool, async (trx) => {
        const companyName = await getActiveCompany(id, trx);
        await ensureCategory(category, trx);

        const updated = await trx("company_bank_mappings")
            .where("id", mapping)
            .where("active", 1)
            .whereRaw("LOWER(TRIM(company_name)) = LOWER(TRIM(?))", [companyName])
            .update({
                bank_name: bankName,
                cat: category,
                foir: foir,
                cc_obligation_percent: ccObligationPercent,
                updated_at: trx.fn.now()
            })
            .returning([
                "id",
                "company_name",
                "bank_name",
                "cat",
                "foir",
                "cc_obligation_percent"
            ]);

        if (!updated || updated.length === 0) {
            throw new MasterDataNotFoundError("Bank mapping was not found.");
        }
        const row = updated[0];
        return {
            id: Number(row.id),
            company_name: row.company_name,
            bank_name: row.bank_name,
            cat: row.cat,
            foir: Number(row.foir),
            cc_obligation_percent: Number(row.cc_obligation_percent)
        };
    });
}

async function deleteBankMapping(companyId, mappingId, dbOrPool) {
    const id = normalizeId(companyId);
    const mapping = normalizeId(mappingId);

    return inTransaction(dbOrPool, async (trx) => {
        const companyName = await getActiveCompany(id, trx);
        const count = await trx("company_bank_mappings")
            .where("id", mapping)
            .where("active", 1)
            .whereRaw("LOWER(TRIM(company_name)) = LOWER(TRIM(?))", [companyName])
            .update({
                active: 0,
                updated_at: trx.fn.now()
            });

        if (count === 0) {
            throw new MasterDataNotFoundError("Bank mapping was not found.");
        }
    });
}

async function addCompany(name, dbOrPool) {
    const compName = normalizeName(name, "Company name");
    const k = getKnex(dbOrPool);

    const [row] = await k("managed_companies")
        .insert({
            company_name: compName,
            active: 1
        })
        .returning(["id", "company_name as name"]);

    return { id: Number(row.id), name: row.name };
}

async function updateCompany(id, name, dbOrPool) {
    const companyId = normalizeId(id);
    const companyName = normalizeName(name, "Company name");

    return inTransaction(dbOrPool, async (trx) => {
        const current = await trx("managed_companies")
            .select("company_name")
            .where("id", companyId)
            .where("active", 1)
            .forUpdate()
            .first();

        if (!current) {
            throw new MasterDataNotFoundError("Company was not found.");
        }

        const oldName = current.company_name;
        const [updated] = await trx("managed_companies")
            .where("id", companyId)
            .update({
                company_name: companyName,
                updated_at: trx.fn.now()
            })
            .returning(["id", "company_name as name"]);

        await trx("company_bank_mappings")
            .whereRaw("LOWER(TRIM(company_name)) = LOWER(TRIM(?))", [oldName])
            .update({
                company_name: companyName,
                updated_at: trx.fn.now()
            });

        return { id: Number(updated.id), name: updated.name };
    });
}

async function deleteCompany(id, dbOrPool) {
    const companyId = normalizeId(id);

    return inTransaction(dbOrPool, async (trx) => {
        const current = await trx("managed_companies")
            .select("company_name")
            .where("id", companyId)
            .where("active", 1)
            .forUpdate()
            .first();

        if (!current) {
            throw new MasterDataNotFoundError("Company was not found.");
        }

        await trx("company_bank_mappings")
            .whereRaw("LOWER(TRIM(company_name)) = LOWER(TRIM(?))", [current.company_name])
            .where("active", 1)
            .update({
                active: 0,
                updated_at: trx.fn.now()
            });

        await trx("managed_companies")
            .where("id", companyId)
            .update({
                active: 0,
                updated_at: trx.fn.now()
            });
    });
}

async function addCategory(name, dbOrPool) {
    const catName = normalizeName(name, "Category name");
    const k = getKnex(dbOrPool);

    const [row] = await k("bank_categories")
        .insert({
            name: catName,
            active: 1
        })
        .returning(["id", "name"]);

    return { id: Number(row.id), name: row.name };
}

async function updateCategory(id, name, dbOrPool) {
    const categoryId = normalizeId(id);
    const categoryName = normalizeName(name, "Category name");

    return inTransaction(dbOrPool, async (trx) => {
        const current = await trx("bank_categories")
            .select("name")
            .where("id", categoryId)
            .where("active", 1)
            .forUpdate()
            .first();

        if (!current) {
            throw new MasterDataNotFoundError("Category was not found.");
        }

        const oldName = current.name;
        const [updated] = await trx("bank_categories")
            .where("id", categoryId)
            .update({
                name: categoryName,
                updated_at: trx.fn.now()
            })
            .returning(["id", "name"]);

        await trx("company_bank_mappings")
            .whereRaw("LOWER(TRIM(cat)) = LOWER(TRIM(?))", [oldName])
            .update({
                cat: categoryName,
                updated_at: trx.fn.now()
            });

        return { id: Number(updated.id), name: updated.name };
    });
}

async function deleteCategory(id, dbOrPool) {
    const categoryId = normalizeId(id);

    return inTransaction(dbOrPool, async (trx) => {
        const current = await trx("bank_categories")
            .select("name")
            .where("id", categoryId)
            .where("active", 1)
            .forUpdate()
            .first();

        if (!current) {
            throw new MasterDataNotFoundError("Category was not found.");
        }

        await trx("company_bank_mappings")
            .whereRaw("LOWER(TRIM(cat)) = LOWER(TRIM(?))", [current.name])
            .update({
                cat: null,
                updated_at: trx.fn.now()
            });

        await trx("bank_categories")
            .where("id", categoryId)
            .update({
                active: 0,
                updated_at: trx.fn.now()
            });
    });
}

async function listBanks(dbOrPool) {
    const k = getKnex(dbOrPool);
    if (!k) {
        return [
            { id: 1, name: "Axis Bank", company_count: 0, bre_rule_count: 0 },
            { id: 2, name: "Bank of Baroda", company_count: 0, bre_rule_count: 0 },
            { id: 3, name: "Canara Bank", company_count: 0, bre_rule_count: 0 },
            { id: 4, name: "HDFC Bank", company_count: 0, bre_rule_count: 0 },
            { id: 5, name: "ICICI Bank", company_count: 0, bre_rule_count: 0 },
            { id: 6, name: "IDFC First Bank", company_count: 0, bre_rule_count: 0 },
            { id: 7, name: "IndusInd Bank", company_count: 0, bre_rule_count: 0 },
            { id: 8, name: "Kotak Mahindra", company_count: 0, bre_rule_count: 0 },
            { id: 9, name: "SBI", company_count: 0, bre_rule_count: 0 },
            { id: 10, name: "Yes Bank", company_count: 0, bre_rule_count: 0 }
        ];
    }

    try {
        await k.raw(`
            INSERT INTO managed_banks (bank_name)
            SELECT DISTINCT TRIM(bank_name)
            FROM (
                SELECT bank_name FROM company_bank_mappings WHERE active = 1 AND TRIM(bank_name) <> ''
                UNION
                SELECT bank_name FROM bre_rules WHERE active = 1 AND TRIM(bank_name) <> ''
            ) distinct_banks
            ON CONFLICT (LOWER(TRIM(bank_name))) WHERE active = 1 DO NOTHING
        `);
    } catch (_e) { }

    const compSubquery = k("company_bank_mappings")
        .select(k.raw("LOWER(TRIM(bank_name)) as bname"))
        .count("* as comp_count")
        .where("active", 1)
        .groupByRaw("LOWER(TRIM(bank_name))")
        .as("c");

    const breSubquery = k("bre_rules")
        .select(k.raw("LOWER(TRIM(bank_name)) as bname"))
        .count("* as bre_count")
        .where("active", 1)
        .groupByRaw("LOWER(TRIM(bank_name))")
        .as("r");

    const rows = await k("managed_banks as mb")
        .select(
            "mb.id",
            "mb.bank_name as name",
            k.raw("COALESCE(c.comp_count, 0)::int as company_count"),
            k.raw("COALESCE(r.bre_count, 0)::int as bre_rule_count")
        )
        .leftJoin(compSubquery, function () {
            this.on(k.raw("LOWER(TRIM(mb.bank_name))"), "=", "c.bname");
        })
        .leftJoin(breSubquery, function () {
            this.on(k.raw("LOWER(TRIM(mb.bank_name))"), "=", "r.bname")
                .orOn(k.raw("LOWER(TRIM(mb.bank_name))"), "=", k.raw("REPLACE(r.bname, ' bank', '')"))
                .orOn(k.raw("LOWER(TRIM(mb.bank_name)) || ' bank'"), "=", "r.bname");
        })
        .where("mb.active", 1)
        .orderBy("mb.bank_name", "asc");

    return rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        company_count: Number(row.company_count || 0),
        bre_rule_count: Number(row.bre_rule_count || 0)
    }));
}

async function addBank(name, dbOrPool) {
    const bankName = normalizeName(name, "Bank name");
    const k = getKnex(dbOrPool);
    if (!k) {
        return { id: 99, name: bankName };
    }

    const [row] = await k("managed_banks")
        .insert({
            bank_name: bankName,
            active: 1
        })
        .returning(["id", "bank_name as name"]);

    return { id: Number(row.id), name: row.name };
}

async function updateBank(id, input, dbOrPool) {
    const bankId = normalizeId(id);
    const bankName = typeof input === "object" && input !== null
        ? normalizeName(input.name, "Bank name")
        : normalizeName(input, "Bank name");

    const foir = typeof input === "object" && input !== null && input.foir !== undefined && input.foir !== "" && input.foir !== null
        ? normalizeFoir(input.foir)
        : null;

    const ccObligation = typeof input === "object" && input !== null && input.cc_obligation_percent !== undefined && input.cc_obligation_percent !== "" && input.cc_obligation_percent !== null
        ? normalizePercentage(input.cc_obligation_percent, "CC obligation percentage")
        : null;

    return inTransaction(dbOrPool, async (trx) => {
        const current = await trx("managed_banks")
            .select("bank_name")
            .where("id", bankId)
            .where("active", 1)
            .forUpdate()
            .first();

        if (!current) {
            throw new MasterDataNotFoundError("Bank was not found.");
        }

        const oldName = current.bank_name;
        if (oldName.toLowerCase().trim() !== bankName.toLowerCase().trim()) {
            const dup = await trx("managed_banks")
                .select("id")
                .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
                .where("id", "!=", bankId)
                .where("active", 1)
                .first();

            if (dup) {
                throw new InvalidMasterDataInputError(`A bank named "${bankName}" already exists.`);
            }
        }

        const [updated] = await trx("managed_banks")
            .where("id", bankId)
            .update({
                bank_name: bankName,
                updated_at: trx.fn.now()
            })
            .returning(["id", "bank_name as name"]);

        const updateData = {
            bank_name: bankName,
            updated_at: trx.fn.now()
        };
        if (foir !== null) {
            updateData.foir = foir;
        }
        if (ccObligation !== null) {
            updateData.cc_obligation_percent = ccObligation;
        }

        await trx("company_bank_mappings")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [oldName])
            .where("active", 1)
            .update(updateData);

        await trx("bank_employer_catalog")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [oldName])
            .where("active", 1)
            .update({
                bank_name: bankName,
                updated_at: trx.fn.now()
            })
            .catch(() => { });

        await trx("bank_policy_matrix")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [oldName])
            .where("active", 1)
            .update({
                bank_name: bankName,
                updated_at: trx.fn.now()
            })
            .catch(() => { });

        await trx("bre_rules")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [oldName])
            .update({
                bank_name: bankName,
                updated_at: trx.fn.now()
            })
            .catch(() => { });

        return {
            id: Number(updated.id),
            name: updated.name,
            foir,
            cc_obligation_percent: ccObligation
        };
    });
}

async function deleteBank(id, dbOrPool) {
    const bankId = normalizeId(id);

    return inTransaction(dbOrPool, async (trx) => {
        const current = await trx("managed_banks")
            .select("bank_name")
            .where("id", bankId)
            .where("active", 1)
            .forUpdate()
            .first();

        if (!current) {
            throw new MasterDataNotFoundError("Bank was not found.");
        }

        const bankName = current.bank_name;

        await trx("company_bank_mappings")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
            .where("active", 1)
            .update({
                active: 0,
                updated_at: trx.fn.now()
            });

        await trx("managed_banks")
            .where("id", bankId)
            .update({
                active: 0,
                updated_at: trx.fn.now()
            });

        await trx("bank_employer_catalog")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
            .update({
                active: 0,
                updated_at: trx.fn.now()
            })
            .catch(() => { });

        await trx("bank_policy_matrix")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
            .update({
                active: 0,
                updated_at: trx.fn.now()
            })
            .catch(() => { });

        await trx("bre_rules")
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
            .update({
                active: 0,
                updated_at: trx.fn.now()
            })
            .catch(() => { });
    });
}

function normalizeCategoryString(s) {
    return String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
}

function findMatchingBreSlabs(companyCat, slabsByCat, isIcici, universalSlabs) {
    if (!companyCat) return [];

    const target = normalizeCategoryString(companyCat);

    // 1. Exact match
    if (slabsByCat.has(target)) {
        return slabsByCat.get(target) || [];
    }

    // 2. Comprehensive token/composite category matching
    const ruleCategories = Array.from(slabsByCat.keys());
    const matchedCategory = findMatchingBreCategory(companyCat, ruleCategories);

    if (matchedCategory && slabsByCat.has(matchedCategory)) {
        return slabsByCat.get(matchedCategory) || [];
    }

    // 3. For ICICI or universal rules where category is 'ALL'
    if (isIcici && slabsByCat.has("CAT A")) {
        return slabsByCat.get("CAT A") || [];
    }
    if (universalSlabs.length > 0) {
        return universalSlabs;
    }

    return [];
}

async function listBankMappings(bankIdentifier, dbOrPool, options = {}) {
    if (!bankIdentifier) return [];
    const k = getKnex(dbOrPool);
    if (!k) {
        return [];
    }

    let bankName = String(bankIdentifier).trim();
    if (/^\d+$/.test(bankName)) {
        const bankRes = await k("managed_banks")
            .select("bank_name")
            .where("id", Number(bankName))
            .where("active", 1)
            .first();

        if (bankRes) {
            bankName = bankRes.bank_name;
        }
    }

    const search = options.search ? options.search.trim() : null;
    const limit = options.limit ? Number(options.limit) : null;
    const offset = options.offset ? Number(options.offset) : 0;
    const bankClean = bankName.toLowerCase().replace(/\s+bank$/i, "").trim();

    const bankMatchClause = function (builder) {
        builder
            .whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankName])
            .orWhereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [bankClean])
            .orWhereILike("bank_name", `%${bankClean}%`)
            .orWhereRaw("LOWER(?) LIKE '%' || LOWER(TRIM(bank_name)) || '%'", [bankName]);
    };

    let qb = k("company_bank_mappings")
        .select("id", "company_name", "bank_name", "cat", "foir", "cc_obligation_percent")
        .where("active", 1)
        .where(bankMatchClause);

    let countQb = k("company_bank_mappings")
        .count("* as total")
        .where("active", 1)
        .where(bankMatchClause);

    if (search) {
        qb = qb.whereILike("company_name", `%${search}%`);
        countQb = countQb.whereILike("company_name", `%${search}%`);
    }

    qb = qb.orderBy("company_name", "asc").orderBy("cat", "asc");

    if (limit && Number.isInteger(limit) && limit > 0) {
        qb = qb.limit(limit);
        if (offset && Number.isInteger(offset) && offset > 0) {
            qb = qb.offset(offset);
        }
    }

    const [rows, countRow] = await Promise.all([
        qb,
        countQb.first()
    ]);
    const totalRecords = Number(countRow?.total || 0);

    // Fetch active BRE rules for this bank to enrich mappings with live BRE FOIR slabs
    let breRules = [];
    try {
        breRules = await k("bre_rules")
            .select("id", "category", "rule_name", "condition_type", "min_salary", "max_salary", "foir_percent")
            .where("active", 1)
            .where(bankMatchClause)
            .orderBy("category", "asc")
            .orderBy("min_salary", "asc");
    } catch (_e) { }

    const slabsByCat = new Map();
    for (const rule of breRules) {
        const catKey = String(rule.category || "").trim().toUpperCase();
        if (!catKey) continue;
        if (!slabsByCat.has(catKey)) {
            slabsByCat.set(catKey, []);
        }
        slabsByCat.get(catKey).push({
            rule_name: rule.rule_name,
            condition_type: rule.condition_type,
            min_salary: Number(rule.min_salary),
            max_salary: Number(rule.max_salary),
            foir_percent: Number(rule.foir_percent)
        });
    }

    const isIcici = bankName.toLowerCase().includes("icici");
    const universalSlabs = slabsByCat.get("ALL") || [];

    const mappings = rows.map((row) => {
        const matchedSlabs = findMatchingBreSlabs(row.cat, slabsByCat, isIcici, universalSlabs);
        const hasBre = Boolean(matchedSlabs && matchedSlabs.length > 0);
        let breMinFoir = null;
        let breMaxFoir = null;
        if (hasBre) {
            const foirs = matchedSlabs.map(s => s.foir_percent);
            breMinFoir = Math.min(...foirs);
            breMaxFoir = Math.max(...foirs);
        }

        const fallbackFoir = (row.foir !== null && row.foir !== undefined && !Number.isNaN(Number(row.foir)))
            ? Number(row.foir)
            : 70;

        return {
            id: Number(row.id),
            company_name: row.company_name,
            bank_name: row.bank_name,
            cat: row.cat,
            foir: hasBre ? (breMinFoir === breMaxFoir ? breMinFoir : fallbackFoir) : fallbackFoir,
            cc_obligation_percent: Number(row.cc_obligation_percent ?? 5),
            bre_configured: hasBre,
            bre_min_foir: breMinFoir,
            bre_max_foir: breMaxFoir,
            bre_slabs: matchedSlabs || []
        };
    });

    return {
        total: totalRecords,
        count: mappings.length,
        mappings
    };
}

async function addCompanyToBankMapping(bankIdentifier, values, dbOrPool) {
    const k = getKnex(dbOrPool);
    let bankName = String(bankIdentifier).trim();
    if (!k) {
        return {
            id: 1,
            company_name: values.company_name,
            bank_name: bankName,
            cat: values.cat,
            foir: Number(values.foir),
            cc_obligation_percent: Number(values.cc_obligation_percent ?? 5)
        };
    }

    return inTransaction(dbOrPool, async (trx) => {
        if (/^\d+$/.test(bankName)) {
            const bankRes = await trx("managed_banks")
                .select("bank_name")
                .where("id", Number(bankName))
                .where("active", 1)
                .first();

            if (bankRes) {
                bankName = bankRes.bank_name;
            }
        }
        const normalizedBank = normalizeName(bankName, "Bank name");
        const companyName = normalizeName(values.company_name, "Company name", { maxLength: 300 });
        const category = values.cat == null || values.cat === ""
            ? null
            : normalizeName(values.cat, "Category");
        const foir = normalizeFoir(values.foir);
        const ccObligationPercent = normalizePercentage(
            values.cc_obligation_percent,
            "CC obligation percentage"
        );

        await trx("managed_banks")
            .insert({
                bank_name: normalizedBank,
                active: 1
            })
            .onConflict(trx.raw("(LOWER(TRIM(bank_name))) WHERE active = 1"))
            .ignore();

        await trx("managed_companies")
            .insert({
                company_name: companyName,
                active: 1
            })
            .onConflict(trx.raw("(LOWER(TRIM(company_name))) WHERE active = 1"))
            .ignore();

        await ensureCategory(category, trx);

        const [row] = await trx("company_bank_mappings")
            .insert({
                company_name: companyName,
                bank_name: normalizedBank,
                cat: category,
                foir: foir,
                cc_obligation_percent: ccObligationPercent,
                active: 1
            })
            .returning([
                "id",
                "company_name",
                "bank_name",
                "cat",
                "foir",
                "cc_obligation_percent"
            ]);

        return {
            id: Number(row.id),
            company_name: row.company_name,
            bank_name: row.bank_name,
            cat: row.cat,
            foir: Number(row.foir),
            cc_obligation_percent: Number(row.cc_obligation_percent)
        };
    });
}

async function updateBankMappingById(mappingId, values, dbOrPool) {
    const id = normalizeId(mappingId);
    const companyName = normalizeName(values.company_name, "Company name", { maxLength: 300 });
    const category = values.cat == null || values.cat === ""
        ? null
        : normalizeName(values.cat, "Category");
    const foir = normalizeFoir(values.foir);
    const ccObligationPercent = normalizePercentage(
        values.cc_obligation_percent,
        "CC obligation percentage"
    );

    return inTransaction(dbOrPool, async (trx) => {
        await trx("managed_companies")
            .insert({
                company_name: companyName,
                active: 1
            })
            .onConflict(trx.raw("(LOWER(TRIM(company_name))) WHERE active = 1"))
            .ignore();

        await ensureCategory(category, trx);

        const updated = await trx("company_bank_mappings")
            .where("id", id)
            .where("active", 1)
            .update({
                company_name: companyName,
                cat: category,
                foir: foir,
                cc_obligation_percent: ccObligationPercent,
                updated_at: trx.fn.now()
            })
            .returning([
                "id",
                "company_name",
                "bank_name",
                "cat",
                "foir",
                "cc_obligation_percent"
            ]);

        if (!updated || updated.length === 0) {
            throw new MasterDataNotFoundError("Bank mapping was not found.");
        }
        const row = updated[0];
        return {
            id: Number(row.id),
            company_name: row.company_name,
            bank_name: row.bank_name,
            cat: row.cat,
            foir: Number(row.foir),
            cc_obligation_percent: Number(row.cc_obligation_percent)
        };
    });
}

async function deleteBankMappingById(mappingId, dbOrPool) {
    const id = normalizeId(mappingId);
    return inTransaction(dbOrPool, async (trx) => {
        const count = await trx("company_bank_mappings")
            .where("id", id)
            .where("active", 1)
            .update({
                active: 0,
                updated_at: trx.fn.now()
            });

        if (count === 0) {
            throw new MasterDataNotFoundError("Bank mapping was not found.");
        }
    });
}

async function bulkImportMappings(csvText, defaultBank, dbOrPool) {
    if (!csvText || typeof csvText !== "string") {
        throw new InvalidMasterDataInputError("CSV content is required.");
    }
    const rawRows = parseCsv(csvText);
    if (rawRows.length === 0) {
        throw new InvalidMasterDataInputError("The uploaded CSV file is empty or missing data rows.");
    }

    const validatedRows = [];
    for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const normalized = normalizeCsvRow(row, defaultBank);
        const lineNum = i + 2;

        if (!normalized.bank_name) {
            throw new InvalidMasterDataInputError(
                `Row ${lineNum}: Bank name is required (or select a bank in the portal).`
            );
        }
        if (!normalized.company_name) {
            continue; // Skip empty rows (e.g. blank lines like row 644)
        }
        if (Number.isNaN(normalized.foir)) {
            normalized.foir = 70;
        } else if (normalized.foir < 0 || normalized.foir > 100) {
            throw new InvalidMasterDataInputError(
                `Row ${lineNum}: FOIR must be a valid number between 0 and 100.`
            );
        }
        if (Number.isNaN(normalized.cc_obligation_percent)) {
            normalized.cc_obligation_percent = 2;
        } else if (normalized.cc_obligation_percent < 0 || normalized.cc_obligation_percent > 100) {
            throw new InvalidMasterDataInputError(
                `Row ${lineNum}: CC obligation percentage must be between 0 and 100.`
            );
        }
        const compClean = normalized.company_name.length > 300
            ? normalized.company_name.slice(0, 300).trim()
            : normalized.company_name;

        validatedRows.push({
            bank_name: normalizeName(normalized.bank_name, "Bank name"),
            company_name: normalizeName(compClean, "Company name", { maxLength: 300 }),
            cat: normalized.cat ? normalizeName(normalized.cat, "Category") : null,
            foir: normalizeFoir(normalized.foir),
            cc_obligation_percent: normalizePercentage(normalized.cc_obligation_percent, "CC obligation percentage")
        });
    }

    const k = getKnex(dbOrPool);
    if (!k) {
        return {
            total: validatedRows.length,
            inserted: validatedRows.length,
            updated: 0,
            banks: Array.from(new Set(validatedRows.map(r => r.bank_name))),
            companies: Array.from(new Set(validatedRows.map(r => r.company_name)))
        };
    }

    return inTransaction(dbOrPool, async (trx) => {
        let insertedCount = 0;
        let updatedCount = 0;
        let unchangedCount = 0;
        const changedSamples = [];
        const bankNames = new Set();
        const companyNames = new Set();

        // Bulk ensure all unique banks once before batch processing
        const allUniqueBanks = Array.from(new Set(validatedRows.map(r => r.bank_name).filter(Boolean)));
        if (allUniqueBanks.length > 0) {
            await trx.raw(`
                INSERT INTO managed_banks (bank_name, active)
                SELECT DISTINCT b, 1 FROM UNNEST(?::text[]) AS b
                WHERE TRIM(b) <> ''
                ON CONFLICT (LOWER(TRIM(bank_name))) WHERE active = 1 DO NOTHING
            `, [allUniqueBanks]);
        }

        const CHUNK_SIZE = 5000;
        for (let i = 0; i < validatedRows.length; i += CHUNK_SIZE) {
            const chunk = validatedRows.slice(i, i + CHUNK_SIZE);
            const map = new Map();
            for (const item of chunk) {
                const key = `${item.bank_name.toLowerCase().trim()}|${item.company_name.toLowerCase().trim()}`;
                map.set(key, item);
            }
            const deduped = Array.from(map.values());

            const bNames = deduped.map(r => r.bank_name);
            const cNames = deduped.map(r => r.company_name);
            const cats = deduped.map(r => r.cat);
            const foirs = deduped.map(r => r.foir);
            const ccs = deduped.map(r => r.cc_obligation_percent);

            // Query existing categories to accurately identify status/category changes
            const existingRows = await trx("company_bank_mappings")
                .select(
                    trx.raw("LOWER(TRIM(company_name)) as c_name"),
                    trx.raw("LOWER(TRIM(bank_name)) as b_name"),
                    "cat"
                )
                .where("active", 1)
                .whereRaw("LOWER(TRIM(company_name)) = ANY(?::text[])", [cNames.map(c => c.toLowerCase().trim())])
                .whereRaw("LOWER(TRIM(bank_name)) = ANY(?::text[])", [bNames.map(b => b.toLowerCase().trim())]);

            const existingMap = new Map();
            for (const row of existingRows) {
                existingMap.set(`${row.b_name}|${row.c_name}`, row.cat);
            }

            for (const item of deduped) {
                const itemKey = `${item.bank_name.toLowerCase().trim()}|${item.company_name.toLowerCase().trim()}`;
                if (existingMap.has(itemKey)) {
                    const oldCat = existingMap.get(itemKey);
                    const oldClean = (oldCat || "").trim().toUpperCase();
                    const newClean = (item.cat || "").trim().toUpperCase();
                    if (oldClean !== newClean) {
                        updatedCount++;
                        if (changedSamples.length < 50) {
                            changedSamples.push({
                                company: item.company_name,
                                bank: item.bank_name,
                                oldCategory: oldCat || "None",
                                newCategory: item.cat || "None"
                            });
                        }
                    } else {
                        unchangedCount++;
                    }
                } else {
                    insertedCount++;
                }
            }

            // Bulk ensure companies
            await trx.raw(`
                INSERT INTO managed_companies (company_name, active)
                SELECT DISTINCT c, 1 FROM UNNEST(?::text[]) AS c
                WHERE TRIM(c) <> ''
                ON CONFLICT (LOWER(TRIM(company_name))) WHERE active = 1 DO NOTHING
            `, [cNames]);

            // Bulk in-place upsert on (company_name, bank_name)
            await trx.raw(`
                INSERT INTO company_bank_mappings (company_name, bank_name, cat, foir, cc_obligation_percent, active, updated_at)
                SELECT comp, bnk, c, f, cc, 1, NOW()
                FROM UNNEST(?::text[], ?::text[], ?::text[], ?::numeric[], ?::numeric[]) AS t(comp, bnk, c, f, cc)
                ON CONFLICT (LOWER(TRIM(company_name)), LOWER(TRIM(bank_name)))
                WHERE active = 1
                DO UPDATE SET 
                    cat = EXCLUDED.cat,
                    foir = EXCLUDED.foir, 
                    cc_obligation_percent = EXCLUDED.cc_obligation_percent, 
                    updated_at = NOW()
            `, [cNames, bNames, cats, foirs, ccs]);

            // Bulk insert into bank_employer_catalog
            const catMap = new Map();
            for (const item of deduped) {
                const key = `${item.bank_name.toLowerCase().trim()}|${item.company_name.toLowerCase().trim()}`;
                catMap.set(key, item);
            }
            const catDeduped = Array.from(catMap.values());
            await trx.raw(`
                INSERT INTO bank_employer_catalog (bank_name, employer_name, employer_category, active, updated_at)
                SELECT bnk, comp, COALESCE(c, 'CAT B'), 1, NOW()
                FROM UNNEST(?::text[], ?::text[], ?::text[]) AS t(bnk, comp, c)
                ON CONFLICT (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_name)))
                WHERE active = 1
                DO UPDATE SET employer_category = EXCLUDED.employer_category, updated_at = NOW()
            `, [catDeduped.map(r => r.bank_name), catDeduped.map(r => r.company_name), catDeduped.map(r => r.cat)]);

            for (const r of deduped) {
                bankNames.add(r.bank_name);
                companyNames.add(r.company_name);
            }
        }

        return {
            total: validatedRows.length,
            inserted: insertedCount,
            updated: updatedCount,
            unchanged: unchangedCount,
            changedSamples,
            banks: Array.from(bankNames),
            companies: Array.from(companyNames)
        };
    });
}

module.exports = {
    MasterDataNotFoundError,
    InvalidMasterDataInputError,
    initializeMasterData,
    normalizeName,
    normalizeId,
    normalizeFoir,
    normalizePercentage,
    listCompanyMappings,
    addBankMapping,
    updateBankMapping,
    deleteBankMapping,
    listBanks,
    addBank,
    updateBank,
    deleteBank,
    listBankMappings,
    addCompanyToBankMapping,
    updateBankMappingById,
    deleteBankMappingById,
    bulkImportMappings,
    addCompany,
    updateCompany,
    deleteCompany,
    addCategory,
    updateCategory,
    deleteCategory
};
