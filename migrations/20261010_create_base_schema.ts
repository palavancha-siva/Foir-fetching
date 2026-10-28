// @ts-nocheck
/**
 * Knex Migration: Base Schema for LoanSense
 * Converted from backend/sql/schema.sql
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    // 1. EXTENSIONS
    await knex.raw("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    // 2. COMPANY BANK MAPPINGS TABLE
    const hasMappings = await knex.schema.hasTable("company_bank_mappings");
    if (!hasMappings) {
        await knex.schema.createTable("company_bank_mappings", (table) => {
            table.bigIncrements("id").primary();
            table.text("company_name").notNullable();
            table.text("bank_name").notNullable();
            table.text("cat");
            table.decimal("foir", 5, 2).notNullable();
            table.decimal("cc_obligation_percent", 5, 2).notNullable().defaultTo(2);
            table.integer("active").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.check("foir >= 0 AND foir <= 100", [], "company_bank_foir_range");
            table.check("cc_obligation_percent >= 0 AND cc_obligation_percent <= 100", [], "company_bank_cc_obligation_percent_range");
            table.check("active IN (0, 1)", [], "company_bank_active_value");
        });
    }

    // 3. INDEXES FOR COMPANY BANK MAPPINGS (Expression / Lower Trim Indexes)
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_company_bank_mappings_company
        ON company_bank_mappings (LOWER(TRIM(company_name)))
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_company_bank_mappings_company_active
        ON company_bank_mappings (LOWER(TRIM(company_name)), active)
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_company_bank_mappings_bank
        ON company_bank_mappings (LOWER(TRIM(bank_name)))
    `);

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_company_bank_mapping_active
        ON company_bank_mappings (
            LOWER(TRIM(company_name)),
            LOWER(TRIM(bank_name)),
            LOWER(TRIM(COALESCE(cat, '')))
        )
        WHERE active = 1
    `);

    // 4. MANAGED COMPANIES TABLE
    const hasManagedCompanies = await knex.schema.hasTable("managed_companies");
    if (!hasManagedCompanies) {
        await knex.schema.createTable("managed_companies", (table) => {
            table.bigIncrements("id").primary();
            table.text("company_name").notNullable();
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.check("active IN (0, 1)", [], "chk_managed_companies_active");
        });
    }

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_managed_companies_active_name
        ON managed_companies (LOWER(TRIM(company_name)))
        WHERE active = 1
    `);

    // 5. BANK CATEGORIES TABLE
    const hasCategories = await knex.schema.hasTable("bank_categories");
    if (!hasCategories) {
        await knex.schema.createTable("bank_categories", (table) => {
            table.bigIncrements("id").primary();
            table.text("name").notNullable();
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.check("active IN (0, 1)", [], "chk_bank_categories_active");
        });
    }

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_categories_active_name
        ON bank_categories (LOWER(TRIM(name)))
        WHERE active = 1
    `);

    // 6. MANAGED BANKS TABLE
    const hasBanks = await knex.schema.hasTable("managed_banks");
    if (!hasBanks) {
        await knex.schema.createTable("managed_banks", (table) => {
            table.bigIncrements("id").primary();
            table.text("bank_name").notNullable();
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.check("active IN (0, 1)", [], "chk_managed_banks_active");
        });
    }

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_managed_banks_active_name
        ON managed_banks (LOWER(TRIM(bank_name)))
        WHERE active = 1
    `);

    // 7. APPLICATIONS TABLE
    const hasApplications = await knex.schema.hasTable("applications");
    if (!hasApplications) {
        await knex.schema.createTable("applications", (table) => {
            table.bigIncrements("id").primary();
            table.text("name").notNullable();
            table.integer("age").notNullable();
            table.text("employment_type").notNullable();
            table.decimal("monthly_income", 15, 2).notNullable();
            table.decimal("existing_emi", 15, 2).notNullable().defaultTo(0);
            table.decimal("requested_loan_amount", 15, 2).notNullable();
            table.text("loan_type").notNullable().defaultTo("personal");
            table.integer("loan_tenure_months").notNullable();
            table.integer("credit_score").notNullable();
            table.decimal("employment_years", 5, 2).notNullable().defaultTo(0);
            table.integer("existing_defaults").notNullable().defaultTo(0);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(["created_at"], "idx_applications_created_at");
            table.index(["name"], "idx_applications_name");
        });
    }

    // 8. BANK DECISIONS TABLE
    const hasDecisions = await knex.schema.hasTable("bank_decisions");
    if (!hasDecisions) {
        await knex.schema.createTable("bank_decisions", (table) => {
            table.bigIncrements("id").primary();
            table.bigInteger("application_id").unsigned().notNullable()
                .references("id").inTable("applications").onDelete("CASCADE");
            table.text("bank").notNullable();
            table.text("decision").notNullable();
            table.decimal("confidence", 5, 4);
            table.decimal("emi_monthly", 15, 2);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(["application_id"], "idx_bank_decisions_application");
            table.index(["bank"], "idx_bank_decisions_bank");
            table.index(["created_at"], "idx_bank_decisions_created_at");
        });
    }

    // 9. UPDATED_AT TRIGGER FUNCTION & TRIGGER
    await knex.raw(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$;
    `);

    await knex.raw(`
        DROP TRIGGER IF EXISTS company_bank_mappings_updated_at ON company_bank_mappings;
        CREATE TRIGGER company_bank_mappings_updated_at
        BEFORE UPDATE ON company_bank_mappings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // 10. VIEWS
    await knex.raw("DROP VIEW IF EXISTS active_company_bank_mappings;");
    await knex.raw(`
        CREATE VIEW active_company_bank_mappings AS
        SELECT
            id,
            company_name,
            bank_name,
            cat,
            foir,
            cc_obligation_percent,
            active,
            created_at,
            updated_at
        FROM company_bank_mappings
        WHERE active = 1;
    `);

    await knex.raw("DROP VIEW IF EXISTS company_bank_summary;");
    await knex.raw(`
        CREATE VIEW company_bank_summary AS
        SELECT
            company_name,
            COUNT(*) AS bank_count,
            ARRAY_AGG(bank_name ORDER BY bank_name) AS banks
        FROM company_bank_mappings
        WHERE active = 1
        GROUP BY company_name;
    `);
};

/**
 * Rollback Migration
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    await knex.raw("DROP VIEW IF EXISTS company_bank_summary");
    await knex.raw("DROP VIEW IF EXISTS active_company_bank_mappings");
    await knex.raw("DROP TRIGGER IF EXISTS company_bank_mappings_updated_at ON company_bank_mappings");
    await knex.raw("DROP FUNCTION IF EXISTS update_updated_at_column");

    await knex.schema.dropTableIfExists("bank_decisions");
    await knex.schema.dropTableIfExists("applications");
    await knex.schema.dropTableIfExists("managed_banks");
    await knex.schema.dropTableIfExists("bank_categories");
    await knex.schema.dropTableIfExists("managed_companies");
    await knex.schema.dropTableIfExists("company_bank_mappings");
};

