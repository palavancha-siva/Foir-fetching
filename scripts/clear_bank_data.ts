// @ts-nocheck
"use strict";

const { Pool } = require("pg");

const pool = new Pool({
    connectionString: "postgresql://postgres:Siva@2004@localhost:5432/foir data"
});

async function clearData() {
    console.log("Connecting to database 'foir data'...");

    console.log("Truncating all bank and company data tables...");
    await pool.query(`
        TRUNCATE TABLE 
            company_bank_mappings,
            managed_banks,
            managed_companies,
            bank_categories,
            bank_employer_catalog,
            bank_policy_matrix,
            bank_decisions,
            applications
        RESTART IDENTITY CASCADE;
    `);

    console.log("\nVerifying row counts in database:");
    const tables = [
        "managed_banks",
        "company_bank_mappings",
        "managed_companies",
        "bank_categories",
        "bank_employer_catalog",
        "bank_policy_matrix"
    ];

    for (const t of tables) {
        const countRes = await pool.query(`SELECT COUNT(*) FROM ${t};`);
        console.log(`- ${t}: ${countRes.rows[0].count} rows`);
    }

    await pool.end();
    console.log("\nAll banks and bank data have been completely removed!");
}

clearData().catch(err => {
    console.error("Failed to clear bank data:", err);
    process.exit(1);
});

