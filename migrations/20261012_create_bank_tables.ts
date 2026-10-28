// @ts-nocheck
/**
 * Knex Migration: Create Bank Employer Catalog and Policy Matrix
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    // 1. Enable pg_trgm extension for fast search
    await knex.raw("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    // 2. Bank Employer Catalog Table (70k+ Companies Per Bank)
    const hasEmployerCatalog = await knex.schema.hasTable("bank_employer_catalog");
    if (!hasEmployerCatalog) {
        await knex.schema.createTable("bank_employer_catalog", table => {
            table.bigIncrements("id").primary();
            table.text("bank_name").notNullable();
            table.text("employer_id");
            table.text("employer_name").notNullable();
            table.text("normalized_name");
            table.text("employer_category").notNullable();
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_employer_catalog_bank_emp
        ON bank_employer_catalog (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_name)))
        WHERE active = 1
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_bank_employer_catalog_search
        ON bank_employer_catalog USING gin (employer_name gin_trgm_ops)
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_bank_employer_catalog_bank_cat
        ON bank_employer_catalog (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_category)))
    `);

    // 3. Bank Policy Matrix Table (Tenure, Multipliers, Salary Slabs, FOIR)
    const hasPolicyMatrix = await knex.schema.hasTable("bank_policy_matrix");
    if (!hasPolicyMatrix) {
        await knex.schema.createTable("bank_policy_matrix", table => {
            table.bigIncrements("id").primary();
            table.text("bank_name").notNullable();
            table.text("category").notNullable();
            table.text("sub_category");
            table.decimal("min_salary", 12, 2).notNullable().defaultTo(0);
            table.decimal("max_salary", 12, 2).notNullable().defaultTo(99999999);
            table.integer("tenure_months").notNullable();
            table.decimal("multiplier", 5, 2).notNullable().defaultTo(0);
            table.decimal("foir_percent", 5, 2).notNullable().defaultTo(70);
            table.boolean("is_kicker").notNullable().defaultTo(false);
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_bank_policy_matrix_lookup
        ON bank_policy_matrix (LOWER(TRIM(bank_name)), LOWER(TRIM(category)), min_salary, max_salary, tenure_months)
        WHERE active = 1
    `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.schema.dropTableIfExists("bank_policy_matrix");
    await knex.schema.dropTableIfExists("bank_employer_catalog");
};

