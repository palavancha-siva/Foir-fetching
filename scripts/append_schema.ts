// @ts-nocheck
const fs = require('fs');

const addSql = `

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
`;

fs.appendFileSync('backend/sql/schema.sql', addSql, 'utf8');
console.log('Appended successfully to backend/sql/schema.sql');

