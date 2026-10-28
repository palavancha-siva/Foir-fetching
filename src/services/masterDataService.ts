// @ts-nocheck
"use strict";

const { parseCsv, normalizeCsvRow } = require("../utils/csvParser");
const { findMatchingBreCategory, categoryMatches } = require("../utils/categoryMatcher");

class MasterDataNotFoundError extends Error { }
class InvalidMasterDataInputError extends Error { }

async function initializeMasterData(pool) {
    await pool.query(`
        ALTER TABLE company_bank_mappings
        ADD COLUMN IF NOT EXISTS cc_obligation_percent
        NUMERIC(5,2) NOT NULL DEFAULT 2
    `);
    await pool.query(`
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
    await pool.query(`
        CREATE TABLE IF NOT EXISTS managed_companies (
            id BIGSERIAL PRIMARY KEY,
            company_name TEXT NOT NULL,
            active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_managed_companies_active_name
        ON managed_companies (LOWER(TRIM(company_name)))
        WHERE active = 1
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS bank_categories (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_bank_categories_active_name
        ON bank_categories (LOWER(TRIM(name)))
        WHERE active = 1
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS managed_banks (
            id BIGSERIAL PRIMARY KEY,
            bank_name TEXT NOT NULL,
            active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_managed_banks_active_name
        ON managed_banks (LOWER(TRIM(bank_name)))
        WHERE active = 1
    `);
    await pool.query(`
        INSERT INTO managed_companies (company_name)
        SELECT DISTINCT TRIM(company_name)
        FROM company_bank_mappings
        WHERE active = 1
        AND TRIM(company_name) <> ''
        ON CONFLICT DO NOTHING
    `);
    await pool.query(`
        INSERT INTO managed_banks (bank_name)
        SELECT DISTINCT TRIM(bank_name)
        FROM company_bank_mappings
        WHERE active = 1
        AND TRIM(bank_name) <> ''
        ON CONFLICT DO NOTHING
    `);
    await pool.query(`
        INSERT INTO bank_categories (name)
        SELECT DISTINCT TRIM(cat)
        FROM company_bank_mappings
        WHERE active = 1
        AND cat IS NOT NULL
        AND TRIM(cat) <> ''
        ON CONFLICT DO NOTHING
    `);
    await pool.query(`
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
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_employer_catalog_bank_emp
        ON bank_employer_catalog (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_name)))
        WHERE active = 1
    `);
    await pool.query(`
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
    await pool.query(`
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

async function ensureCategory(name, client) {
    if (!name) return null;
    await client.query(
        `INSERT INTO bank_categories (name)
         SELECT $1
         WHERE NOT EXISTS (
             SELECT 1 FROM bank_categories
             WHERE active = 1 AND LOWER(TRIM(name)) = LOWER(TRIM($1))
         )
         ON CONFLICT DO NOTHING`,
        [name]
    );
    return name;
}

async function inTransaction(pool, operation) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Master-data transaction rollback failed:", rollbackError.message);
        }
        throw error;
    } finally {
        client.release();
    }
}

async function getActiveCompany(companyId, client) {
    const result = await client.query(
        `SELECT company_name
         FROM managed_companies
         WHERE id = $1 AND active = 1
         FOR UPDATE`,
        [companyId]
    );
    if (result.rowCount === 0) {
        throw new MasterDataNotFoundError("Company was not found.");
    }
    return result.rows[0].company_name;
}

async function listCompanyMappings(companyId, pool) {
    const id = normalizeId(companyId);
    const result = await pool.query(
        `SELECT mapping.id, mapping.company_name, mapping.bank_name,
                mapping.cat, mapping.foir, mapping.cc_obligation_percent
         FROM company_bank_mappings AS mapping
         JOIN managed_companies AS company
           ON LOWER(TRIM(company.company_name)) =
              LOWER(TRIM(mapping.company_name))
         WHERE company.id = $1
           AND company.active = 1
           AND mapping.active = 1
         ORDER BY mapping.bank_name ASC, mapping.cat ASC`,
        [id]
    );
    return result.rows.map(row => ({
        id: Number(row.id),
        company_name: row.company_name,
        bank_name: row.bank_name,
        cat: row.cat,
        foir: Number(row.foir),
        cc_obligation_percent: Number(row.cc_obligation_percent)
    }));
}

async function addBankMapping(companyId, values, pool) {
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

    return inTransaction(pool, async client => {
        const companyName = await getActiveCompany(id, client);
        await ensureCategory(category, client);
        const result = await client.query(
            `INSERT INTO company_bank_mappings
                (company_name, bank_name, cat, foir,
                 cc_obligation_percent, active)
             VALUES ($1, $2, $3, $4, $5, 1)
             RETURNING id, company_name, bank_name, cat, foir,
                       cc_obligation_percent`,
            [companyName, bankName, category, foir, ccObligationPercent]
        );
        const row = result.rows[0];
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

async function updateBankMapping(companyId, mappingId, values, pool) {
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

    return inTransaction(pool, async client => {
        const companyName = await getActiveCompany(id, client);
        await ensureCategory(category, client);
        const result = await client.query(
            `UPDATE company_bank_mappings
             SET bank_name = $3, cat = $4, foir = $5,
                 cc_obligation_percent = $6, updated_at = NOW()
             WHERE id = $1
               AND active = 1
               AND LOWER(TRIM(company_name)) = LOWER(TRIM($2))
             RETURNING id, company_name, bank_name, cat, foir,
                       cc_obligation_percent`,
            [
                mapping,
                companyName,
                bankName,
                category,
                foir,
                ccObligationPercent
            ]
        );
        if (result.rowCount === 0) {
            throw new MasterDataNotFoundError("Bank mapping was not found.");
        }
        const row = result.rows[0];
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

async function deleteBankMapping(companyId, mappingId, pool) {
    const id = normalizeId(companyId);
    const mapping = normalizeId(mappingId);

    return inTransaction(pool, async client => {
        const companyName = await getActiveCompany(id, client);
        const result = await client.query(
            `UPDATE company_bank_mappings
             SET active = 0, updated_at = NOW()
             WHERE id = $1
               AND active = 1
               AND LOWER(TRIM(company_name)) = LOWER(TRIM($2))
             RETURNING id`,
            [mapping, companyName]
        );
        if (result.rowCount === 0) {
            throw new MasterDataNotFoundError("Bank mapping was not found.");
        }
    });
}

async function addCompany(name, pool) {
    const result = await pool.query(
        `INSERT INTO managed_companies (company_name)
         VALUES ($1)
         RETURNING id, company_name AS name`,
        [normalizeName(name, "Company name")]
    );
    return { id: Number(result.rows[0].id), name: result.rows[0].name };
}

async function updateCompany(id, name, pool) {
    const companyId = normalizeId(id);
    const companyName = normalizeName(name, "Company name");

    return inTransaction(pool, async client => {
        const current = await client.query(
            `SELECT company_name
             FROM managed_companies
             WHERE id = $1 AND active = 1
             FOR UPDATE`,
            [companyId]
        );
        if (current.rowCount === 0) {
            throw new MasterDataNotFoundError("Company was not found.");
        }

        const oldName = current.rows[0].company_name;
        const updated = await client.query(
            `UPDATE managed_companies
             SET company_name = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING id, company_name AS name`,
            [companyId, companyName]
        );
        await client.query(
            `UPDATE company_bank_mappings
             SET company_name = $2, updated_at = NOW()
             WHERE LOWER(TRIM(company_name)) = LOWER(TRIM($1))`,
            [oldName, companyName]
        );
        return { id: Number(updated.rows[0].id), name: updated.rows[0].name };
    });
}

async function deleteCompany(id, pool) {
    const companyId = normalizeId(id);

    return inTransaction(pool, async client => {
        const current = await client.query(
            `SELECT company_name
             FROM managed_companies
             WHERE id = $1 AND active = 1
             FOR UPDATE`,
            [companyId]
        );
        if (current.rowCount === 0) {
            throw new MasterDataNotFoundError("Company was not found.");
        }

        await client.query(
            `UPDATE company_bank_mappings
             SET active = 0, updated_at = NOW()
             WHERE LOWER(TRIM(company_name)) = LOWER(TRIM($1))
             AND active = 1`,
            [current.rows[0].company_name]
        );
        await client.query(
            `UPDATE managed_companies
             SET active = 0, updated_at = NOW()
             WHERE id = $1`,
            [companyId]
        );
    });
}

async function addCategory(name, pool) {
    const result = await pool.query(
        `INSERT INTO bank_categories (name)
         VALUES ($1)
         RETURNING id, name`,
        [normalizeName(name, "Category name")]
    );
    return { id: Number(result.rows[0].id), name: result.rows[0].name };
}

async function updateCategory(id, name, pool) {
    const categoryId = normalizeId(id);
    const categoryName = normalizeName(name, "Category name");

    return inTransaction(pool, async client => {
        const current = await client.query(
            `SELECT name
             FROM bank_categories
             WHERE id = $1 AND active = 1
             FOR UPDATE`,
            [categoryId]
        );
        if (current.rowCount === 0) {
            throw new MasterDataNotFoundError("Category was not found.");
        }

        const oldName = current.rows[0].name;
        const updated = await client.query(
            `UPDATE bank_categories
             SET name = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING id, name`,
            [categoryId, categoryName]
        );
        await client.query(
            `UPDATE company_bank_mappings
             SET cat = $2, updated_at = NOW()
             WHERE LOWER(TRIM(cat)) = LOWER(TRIM($1))`,
            [oldName, categoryName]
        );
        return { id: Number(updated.rows[0].id), name: updated.rows[0].name };
    });
}

async function deleteCategory(id, pool) {
    const categoryId = normalizeId(id);

    return inTransaction(pool, async client => {
        const current = await client.query(
            `SELECT name
             FROM bank_categories
             WHERE id = $1 AND active = 1
             FOR UPDATE`,
            [categoryId]
        );
        if (current.rowCount === 0) {
            throw new MasterDataNotFoundError("Category was not found.");
        }

        await client.query(
            `UPDATE company_bank_mappings
             SET cat = NULL, updated_at = NOW()
             WHERE LOWER(TRIM(cat)) = LOWER(TRIM($1))`,
            [current.rows[0].name]
        );
        await client.query(
            `UPDATE bank_categories
             SET active = 0, updated_at = NOW()
             WHERE id = $1`,
            [categoryId]
        );
    });
}

async function listBanks(pool) {
    if (!pool) {
        return [
            { id: 1, name: "Axis Bank" },
            { id: 2, name: "Bank of Baroda" },
            { id: 3, name: "Canara Bank" },
            { id: 4, name: "HDFC Bank" },
            { id: 5, name: "ICICI Bank" },
            { id: 6, name: "IDFC First Bank" },
            { id: 7, name: "IndusInd Bank" },
            { id: 8, name: "Kotak Mahindra" },
            { id: 9, name: "SBI" },
            { id: 10, name: "Yes Bank" }
        ];
    }
    const result = await pool.query(
        `SELECT id, bank_name AS name
         FROM managed_banks
         WHERE active = 1
         ORDER BY bank_name ASC`
    );
    if (result.rows.length > 0) {
        return result.rows.map(row => ({
            id: Number(row.id),
            name: row.name
        }));
    }
    const fallback = await pool.query(
        `SELECT DISTINCT bank_name AS name
         FROM company_bank_mappings
         WHERE active = 1
         ORDER BY bank_name ASC`
    );
    return fallback.rows.map((row, idx) => ({
        id: idx + 1,
        name: row.name
    }));
}

async function addBank(name, pool) {
    const bankName = normalizeName(name, "Bank name");
    if (!pool) {
        return { id: 99, name: bankName };
    }
    const result = await pool.query(
        `INSERT INTO managed_banks (bank_name)
         VALUES ($1)
         RETURNING id, bank_name AS name`,
        [bankName]
    );
    return { id: Number(result.rows[0].id), name: result.rows[0].name };
}

async function updateBank(id, input, pool) {
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

    return inTransaction(pool, async client => {
        const current = await client.query(
            `SELECT bank_name
             FROM managed_banks
             WHERE id = $1 AND active = 1
             FOR UPDATE`,
            [bankId]
        );
        if (current.rowCount === 0) {
            throw new MasterDataNotFoundError("Bank was not found.");
        }

        const oldName = current.rows[0].bank_name;

        if (oldName.toLowerCase().trim() !== bankName.toLowerCase().trim()) {
            const dup = await client.query(
                `SELECT id FROM managed_banks WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1)) AND id != $2 AND active = 1`,
                [bankName, bankId]
            );
            if (dup.rowCount > 0) {
                throw new InvalidMasterDataInputError(`A bank named "${bankName}" already exists.`);
            }
        }

        const updated = await client.query(
            `UPDATE managed_banks
             SET bank_name = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING id, bank_name AS name`,
            [bankId, bankName]
        );

        let mappingQuery = `
            UPDATE company_bank_mappings
            SET bank_name = $2, updated_at = NOW()
        `;
        const mappingParams = [oldName, bankName];

        if (foir !== null) {
            mappingParams.push(foir);
            mappingQuery += `, foir = $${mappingParams.length}`;
        }
        if (ccObligation !== null) {
            mappingParams.push(ccObligation);
            mappingQuery += `, cc_obligation_percent = $${mappingParams.length}`;
        }

        mappingQuery += ` WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1)) AND active = 1`;
        await client.query(mappingQuery, mappingParams);

        await client.query(
            `UPDATE bank_employer_catalog
             SET bank_name = $2, updated_at = NOW()
             WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1)) AND active = 1`,
            [oldName, bankName]
        ).catch(() => { });

        await client.query(
            `UPDATE bank_policy_matrix
             SET bank_name = $2, updated_at = NOW()
             WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1)) AND active = 1`,
            [oldName, bankName]
        ).catch(() => { });

        await client.query(
            `UPDATE bre_rules
             SET bank_name = $2, updated_at = NOW()
             WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1))`,
            [oldName, bankName]
        ).catch(() => { });

        return {
            id: Number(updated.rows[0].id),
            name: updated.rows[0].name,
            foir,
            cc_obligation_percent: ccObligation
        };
    });
}

async function deleteBank(id, pool) {
    const bankId = normalizeId(id);

    return inTransaction(pool, async client => {
        const current = await client.query(
            `SELECT bank_name
             FROM managed_banks
             WHERE id = $1 AND active = 1
             FOR UPDATE`,
            [bankId]
        );
        if (current.rowCount === 0) {
            throw new MasterDataNotFoundError("Bank was not found.");
        }

        const bankName = current.rows[0].bank_name;

        await client.query(
            `UPDATE company_bank_mappings
             SET active = 0, updated_at = NOW()
             WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1))
             AND active = 1`,
            [bankName]
        );
        await client.query(
            `UPDATE managed_banks
             SET active = 0, updated_at = NOW()
             WHERE id = $1`,
            [bankId]
        );
        await client.query(
            `UPDATE bank_employer_catalog
             SET active = 0, updated_at = NOW()
             WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1))`,
            [bankName]
        ).catch(() => { });
        await client.query(
            `UPDATE bank_policy_matrix
             SET active = 0, updated_at = NOW()
             WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1))`,
            [bankName]
        ).catch(() => { });
        await client.query(
            `UPDATE bre_rules
             SET active = 0, updated_at = NOW()
             WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1))`,
            [bankName]
        ).catch(() => { });
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

async function listBankMappings(bankIdentifier, pool, options = {}) {
    if (!bankIdentifier) return [];
    if (!pool) {
        return [];
    }
    let bankName = String(bankIdentifier).trim();
    if (/^\d+$/.test(bankName)) {
        const bankRes = await pool.query(
            `SELECT bank_name FROM managed_banks WHERE id = $1 AND active = 1`,
            [Number(bankName)]
        );
        if (bankRes.rowCount > 0) {
            bankName = bankRes.rows[0].bank_name;
        }
    }

    const search = options.search ? `%${options.search.trim()}%` : null;
    const limit = options.limit ? Number(options.limit) : null;
    const offset = options.offset ? Number(options.offset) : 0;
    const bankClean = bankName.toLowerCase().replace(/\s+bank$/i, "").trim();

    let query = `
        SELECT id, company_name, bank_name, cat, foir, cc_obligation_percent
        FROM company_bank_mappings
        WHERE active = 1
          AND (
              LOWER(TRIM(bank_name)) = LOWER(TRIM($1))
              OR LOWER(TRIM(bank_name)) = LOWER(TRIM($2))
              OR LOWER(TRIM(bank_name)) LIKE $3
              OR LOWER($1) LIKE '%' || LOWER(TRIM(bank_name)) || '%'
          )
    `;
    const params = [bankName, bankClean, `%${bankClean}%`];
    if (search) {
        params.push(search);
        query += ` AND company_name ILIKE $${params.length}`;
    }
    query += ` ORDER BY company_name ASC, cat ASC`;
    if (limit && Number.isInteger(limit) && limit > 0) {
        params.push(limit);
        query += ` LIMIT $${params.length}`;
        if (offset && Number.isInteger(offset) && offset > 0) {
            params.push(offset);
            query += ` OFFSET $${params.length}`;
        }
    }

    const result = await pool.query(query, params);

    // Fetch active BRE rules for this bank to enrich mappings with live BRE FOIR slabs
    let breRules = [];
    try {
        const breRes = await pool.query(
            `SELECT id, category, rule_name, condition_type, min_salary, max_salary, foir_percent
             FROM bre_rules
             WHERE active = 1
               AND (
                   LOWER(TRIM(bank_name)) = LOWER(TRIM($1))
                   OR LOWER(TRIM(bank_name)) = LOWER(TRIM($2))
                   OR LOWER(TRIM(bank_name)) LIKE $3
                   OR LOWER($1) LIKE '%' || LOWER(TRIM(bank_name)) || '%'
               )
             ORDER BY category ASC, min_salary ASC`,
            [bankName, bankClean, `%${bankClean}%`]
        );
        breRules = breRes.rows;
    } catch {
        // Fallback safely if bre_rules table query is unavailable
    }

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

    return result.rows.map(row => {
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
}

async function addCompanyToBankMapping(bankIdentifier, values, pool) {
    let bankName = String(bankIdentifier).trim();
    if (!pool) {
        return {
            id: 1,
            company_name: values.company_name,
            bank_name: bankName,
            cat: values.cat,
            foir: Number(values.foir),
            cc_obligation_percent: Number(values.cc_obligation_percent ?? 5)
        };
    }
    if (/^\d+$/.test(bankName)) {
        const bankRes = await pool.query(
            `SELECT bank_name FROM managed_banks WHERE id = $1 AND active = 1`,
            [Number(bankName)]
        );
        if (bankRes.rowCount > 0) {
            bankName = bankRes.rows[0].bank_name;
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

    return inTransaction(pool, async client => {
        await client.query(
            `INSERT INTO managed_banks (bank_name, active)
             VALUES ($1, 1)
             ON CONFLICT (LOWER(TRIM(bank_name))) WHERE active = 1
             DO NOTHING`,
            [normalizedBank]
        );
        await client.query(
            `INSERT INTO managed_companies (company_name, active)
             VALUES ($1, 1)
             ON CONFLICT (LOWER(TRIM(company_name))) WHERE active = 1
             DO NOTHING`,
            [companyName]
        );
        await ensureCategory(category, client);

        const result = await client.query(
            `INSERT INTO company_bank_mappings
                (company_name, bank_name, cat, foir, cc_obligation_percent, active)
             VALUES ($1, $2, $3, $4, $5, 1)
             RETURNING id, company_name, bank_name, cat, foir, cc_obligation_percent`,
            [companyName, normalizedBank, category, foir, ccObligationPercent]
        );
        const row = result.rows[0];
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

async function updateBankMappingById(mappingId, values, pool) {
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

    return inTransaction(pool, async client => {
        await client.query(
            `INSERT INTO managed_companies (company_name, active)
             VALUES ($1, 1)
             ON CONFLICT (LOWER(TRIM(company_name))) WHERE active = 1
             DO NOTHING`,
            [companyName]
        );
        await ensureCategory(category, client);

        const result = await client.query(
            `UPDATE company_bank_mappings
             SET company_name = $2, cat = $3, foir = $4,
                 cc_obligation_percent = $5, updated_at = NOW()
             WHERE id = $1 AND active = 1
             RETURNING id, company_name, bank_name, cat, foir, cc_obligation_percent`,
            [id, companyName, category, foir, ccObligationPercent]
        );
        if (result.rowCount === 0) {
            throw new MasterDataNotFoundError("Bank mapping was not found.");
        }
        const row = result.rows[0];
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

async function deleteBankMappingById(mappingId, pool) {
    const id = normalizeId(mappingId);
    return inTransaction(pool, async client => {
        const result = await client.query(
            `UPDATE company_bank_mappings
             SET active = 0, updated_at = NOW()
             WHERE id = $1 AND active = 1
             RETURNING id`,
            [id]
        );
        if (result.rowCount === 0) {
            throw new MasterDataNotFoundError("Bank mapping was not found.");
        }
    });
}

async function bulkImportMappings(csvText, defaultBank, pool) {
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

    if (!pool) {
        return {
            total: validatedRows.length,
            inserted: validatedRows.length,
            updated: 0,
            banks: Array.from(new Set(validatedRows.map(r => r.bank_name))),
            companies: Array.from(new Set(validatedRows.map(r => r.company_name)))
        };
    }

    return inTransaction(pool, async client => {
        let insertedCount = 0;
        let updatedCount = 0;
        const bankNames = new Set();
        const companyNames = new Set();

        // Bulk ensure all unique banks once before batch processing
        const allUniqueBanks = Array.from(new Set(validatedRows.map(r => r.bank_name).filter(Boolean)));
        if (allUniqueBanks.length > 0) {
            await client.query(`
                INSERT INTO managed_banks (bank_name, active)
                SELECT DISTINCT b, 1 FROM UNNEST($1::text[]) AS b
                WHERE TRIM(b) <> ''
                ON CONFLICT (LOWER(TRIM(bank_name))) WHERE active = 1 DO NOTHING
            `, [allUniqueBanks]);
        }

        const CHUNK_SIZE = 5000;
        for (let i = 0; i < validatedRows.length; i += CHUNK_SIZE) {
            const chunk = validatedRows.slice(i, i + CHUNK_SIZE);
            const map = new Map();
            for (const item of chunk) {
                const key = `${item.bank_name.toLowerCase().trim()}|${item.company_name.toLowerCase().trim()}|${(item.cat || "").toLowerCase().trim()}`;
                map.set(key, item);
            }
            const deduped = Array.from(map.values());

            const bNames = deduped.map(r => r.bank_name);
            const cNames = deduped.map(r => r.company_name);
            const cats = deduped.map(r => r.cat);
            const foirs = deduped.map(r => r.foir);
            const ccs = deduped.map(r => r.cc_obligation_percent);

            // Bulk ensure companies
            await client.query(`
                INSERT INTO managed_companies (company_name, active)
                SELECT DISTINCT c, 1 FROM UNNEST($1::text[]) AS c
                WHERE TRIM(c) <> ''
                ON CONFLICT (LOWER(TRIM(company_name))) WHERE active = 1 DO NOTHING
            `, [cNames]);

            // Bulk insert/update company_bank_mappings
            await client.query(`
                INSERT INTO company_bank_mappings (company_name, bank_name, cat, foir, cc_obligation_percent, active)
                SELECT comp, bnk, c, f, cc, 1
                FROM UNNEST($1::text[], $2::text[], $3::text[], $4::numeric[], $5::numeric[]) AS t(comp, bnk, c, f, cc)
                ON CONFLICT (LOWER(TRIM(company_name)), LOWER(TRIM(bank_name)), LOWER(TRIM(COALESCE(cat, ''))))
                WHERE active = 1
                DO UPDATE SET foir = EXCLUDED.foir, cc_obligation_percent = EXCLUDED.cc_obligation_percent, updated_at = NOW()
            `, [cNames, bNames, cats, foirs, ccs]);

            // Bulk insert into bank_employer_catalog
            const catMap = new Map();
            for (const item of deduped) {
                const key = `${item.bank_name.toLowerCase().trim()}|${item.company_name.toLowerCase().trim()}`;
                catMap.set(key, item);
            }
            const catDeduped = Array.from(catMap.values());
            await client.query(`
                INSERT INTO bank_employer_catalog (bank_name, employer_name, employer_category, active)
                SELECT bnk, comp, COALESCE(c, 'CAT B'), 1
                FROM UNNEST($1::text[], $2::text[], $3::text[]) AS t(bnk, comp, c)
                ON CONFLICT (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_name)))
                WHERE active = 1
                DO UPDATE SET employer_category = EXCLUDED.employer_category, updated_at = NOW()
            `, [catDeduped.map(r => r.bank_name), catDeduped.map(r => r.company_name), catDeduped.map(r => r.cat)]);

            insertedCount += deduped.length;
            for (const r of deduped) {
                bankNames.add(r.bank_name);
                companyNames.add(r.company_name);
            }
        }

        return {
            total: validatedRows.length,
            inserted: insertedCount,
            updated: updatedCount,
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

