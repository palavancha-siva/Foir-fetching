-- ============================================================
-- LOANSENSE DATABASE SCHEMA
-- PostgreSQL / Supabase
-- ============================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 2. COMPANY BANK MAPPINGS
-- ============================================================
--
-- One company can have MULTIPLE banks.
--
-- Example:
--
-- Wipro -> HDFC Bank  -> Cat A -> 65%
-- Wipro -> ICICI Bank -> Cat A -> 60%
-- Wipro -> SBI        -> Cat B -> 55%
--
-- ============================================================

CREATE TABLE IF NOT EXISTS company_bank_mappings (

    id BIGSERIAL PRIMARY KEY,

    company_name TEXT NOT NULL,

    bank_name TEXT NOT NULL,

    cat TEXT,

    foir NUMERIC(5,2) NOT NULL,

    cc_obligation_percent NUMERIC(5,2) NOT NULL DEFAULT 2,

    active INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT company_bank_foir_range
        CHECK (
            foir >= 0
            AND foir <= 100
        ),

    CONSTRAINT company_bank_cc_obligation_percent_range
        CHECK (
            cc_obligation_percent >= 0
            AND cc_obligation_percent <= 100
        ),

    CONSTRAINT company_bank_active_value
        CHECK (
            active IN (0,1)
        )

);

ALTER TABLE company_bank_mappings
    ADD COLUMN IF NOT EXISTS cc_obligation_percent
    NUMERIC(5,2) NOT NULL DEFAULT 2;

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
$$;

-- Remove the unused legacy classification from existing databases.
DROP VIEW IF EXISTS active_company_bank_mappings;
ALTER TABLE company_bank_mappings
    DROP COLUMN IF EXISTS super_cat;


-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS
idx_company_bank_mappings_company
ON company_bank_mappings
(
    LOWER(TRIM(company_name))
);


CREATE INDEX IF NOT EXISTS
idx_company_bank_mappings_company_active
ON company_bank_mappings
(
    LOWER(TRIM(company_name)),
    active
);


CREATE INDEX IF NOT EXISTS
idx_company_bank_mappings_bank
ON company_bank_mappings
(
    LOWER(TRIM(bank_name))
);


-- ============================================================
-- 4. UNIQUE INDEX
-- ============================================================
--
-- Prevent duplicate active mappings for the same:
--
-- Company + Bank + Category
--
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
uq_company_bank_mapping_active
ON company_bank_mappings
(
    LOWER(TRIM(company_name)),
    LOWER(TRIM(bank_name)),
    LOWER(TRIM(COALESCE(cat, '')))
)
WHERE active = 1;


-- ============================================================
-- 5. MANAGED COMPANIES AND BANK CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS managed_companies (
    id BIGSERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    active SMALLINT NOT NULL DEFAULT 1
        CHECK (active IN (0, 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS
uq_managed_companies_active_name
ON managed_companies (LOWER(TRIM(company_name)))
WHERE active = 1;

CREATE TABLE IF NOT EXISTS bank_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    active SMALLINT NOT NULL DEFAULT 1
        CHECK (active IN (0, 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS
uq_bank_categories_active_name
ON bank_categories (LOWER(TRIM(name)))
WHERE active = 1;


-- ============================================================
-- 6. APPLICATIONS
-- ============================================================
--
-- Used by the /evaluate application service
--
-- ============================================================

CREATE TABLE IF NOT EXISTS applications (

    id BIGSERIAL PRIMARY KEY,

    name TEXT NOT NULL,

    age INTEGER NOT NULL,

    employment_type TEXT NOT NULL,

    monthly_income NUMERIC(15,2) NOT NULL,

    existing_emi NUMERIC(15,2)
        NOT NULL DEFAULT 0,

    requested_loan_amount NUMERIC(15,2)
        NOT NULL,

    loan_type TEXT NOT NULL
        DEFAULT 'personal',

    loan_tenure_months INTEGER NOT NULL,

    credit_score INTEGER NOT NULL,

    employment_years NUMERIC(5,2)
        NOT NULL DEFAULT 0,

    existing_defaults INTEGER
        NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()

);


-- ============================================================
-- 7. APPLICATION INDEX
-- ============================================================

CREATE INDEX IF NOT EXISTS
idx_applications_created_at
ON applications(created_at DESC);


CREATE INDEX IF NOT EXISTS
idx_applications_name
ON applications(name);


-- ============================================================
-- 8. BANK DECISIONS
-- ============================================================
--
-- Stores the rule-engine result for each bank.
--
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_decisions (

    id BIGSERIAL PRIMARY KEY,

    application_id BIGINT NOT NULL,

    bank TEXT NOT NULL,

    decision TEXT NOT NULL,

    confidence NUMERIC(5,4),

    emi_monthly NUMERIC(15,2),

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_bank_decision_application

        FOREIGN KEY(application_id)

        REFERENCES applications(id)

        ON DELETE CASCADE

);


-- ============================================================
-- 9. BANK DECISION INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS
idx_bank_decisions_application
ON bank_decisions(application_id);


CREATE INDEX IF NOT EXISTS
idx_bank_decisions_bank
ON bank_decisions(bank);


CREATE INDEX IF NOT EXISTS
idx_bank_decisions_created_at
ON bank_decisions(created_at DESC);


-- ============================================================
-- 10. UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION
update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
company_bank_mappings_updated_at
ON company_bank_mappings;


CREATE TRIGGER
company_bank_mappings_updated_at

BEFORE UPDATE ON company_bank_mappings

FOR EACH ROW

EXECUTE FUNCTION
update_updated_at_column();


-- ============================================================
-- 11. VIEW - ACTIVE COMPANY BANK MAPPINGS
-- ============================================================

CREATE OR REPLACE VIEW
active_company_bank_mappings
AS

SELECT

    id,

    company_name,

    bank_name,

    cat,

    foir,

    active,

    created_at,

    updated_at

FROM company_bank_mappings

WHERE active = 1;


-- ============================================================
-- 14. VIEW - COMPANY BANK SUMMARY
-- ============================================================

CREATE OR REPLACE VIEW
company_bank_summary
AS

SELECT

    company_name,

    COUNT(*) AS bank_count,

    ARRAY_AGG(
        bank_name
        ORDER BY bank_name
    ) AS banks

FROM company_bank_mappings

WHERE active = 1

GROUP BY company_name;


-- ============================================================
-- 15. TEST DATA
-- ============================================================
--
-- Check all Wipro mappings
--
-- ============================================================

SELECT

    id,

    company_name,

    bank_name,

    cat,

    foir,

    active

FROM company_bank_mappings

WHERE LOWER(
    TRIM(company_name)
) = LOWER(
    TRIM('Wipro')
)

ORDER BY bank_name;


-- ============================================================
-- 16. CHECK ALL COMPANIES
-- ============================================================

SELECT

    company_name,

    COUNT(*) AS total_banks

FROM company_bank_mappings

WHERE active = 1

GROUP BY company_name

ORDER BY company_name;


-- ============================================================
-- END OF LOANSENSE DATABASE SCHEMA
-- ============================================================

-- ============================================================
-- 17. BULK BANK EMPLOYER CATALOG (70k+ Companies Per Bank)
-- ============================================================

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
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_employer_catalog_bank_emp
ON bank_employer_catalog (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_name)))
WHERE active = 1;

CREATE INDEX IF NOT EXISTS idx_bank_employer_catalog_search
ON bank_employer_catalog USING gin (employer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bank_employer_catalog_bank_cat
ON bank_employer_catalog (LOWER(TRIM(bank_name)), LOWER(TRIM(employer_category)));


-- ============================================================
-- 18. BANK POLICY MATRIX (Tenure, Multiplier, Salary Slabs, FOIR)
-- ============================================================

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
);

CREATE INDEX IF NOT EXISTS idx_bank_policy_matrix_lookup
ON bank_policy_matrix (LOWER(TRIM(bank_name)), LOWER(TRIM(category)), min_salary, max_salary, tenure_months)
WHERE active = 1;
