// @ts-nocheck
"use strict";

const fs = require("fs");
const path = require("path");
const { Client, Pool } = require("pg");

const ROOT_CONNECTION = "postgresql://postgres:Siva@2004@localhost:5432/postgres";
const TARGET_DB_NAME = "foir data";
const TARGET_CONNECTION = `postgresql://postgres:Siva@2004@localhost:5432/${TARGET_DB_NAME}`;

async function main() {
    console.log("1. Connecting to default postgres database...");
    const rootClient = new Client({ connectionString: ROOT_CONNECTION });
    await rootClient.connect();

    console.log(`2. Checking if database "${TARGET_DB_NAME}" exists...`);
    const checkRes = await rootClient.query(
        "SELECT datname FROM pg_database WHERE datname = $1",
        [TARGET_DB_NAME]
    );

    if (checkRes.rows.length === 0) {
        console.log(`3. Database "${TARGET_DB_NAME}" does not exist. Creating it now...`);
        await rootClient.query(`CREATE DATABASE "${TARGET_DB_NAME}"`);
        console.log(`   Database "${TARGET_DB_NAME}" created successfully!`);
    } else {
        console.log(`   Database "${TARGET_DB_NAME}" already exists.`);
    }

    await rootClient.end();

    console.log(`4. Connecting to target database "${TARGET_DB_NAME}"...`);
    const pool = new Pool({ connectionString: TARGET_CONNECTION });

    // Enable extensions
    console.log("5. Ensuring extensions...");
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm;").catch(err => {
        console.warn("   pg_trgm extension warning (optional):", err.message);
    });

    console.log("6. Running schema.sql...");
    const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
    if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, "utf8");
        // Split by semi-colon or execute as full query
        await pool.query(schemaSql);
        console.log("   schema.sql executed successfully!");
    } else {
        console.warn("   schema.sql not found at", schemaPath);
    }

    console.log("7. Initializing master data tables (managed_banks, catalog, matrix)...");
    const { initializeMasterData } = require("../src/services/masterDataService");
    await initializeMasterData(pool);
    console.log("   Master data initialization complete!");

    console.log("8. Verifying tables in database...");
    const tablesRes = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    `);
    console.log("   Tables present:");
    tablesRes.rows.forEach(r => console.log(`   - ${r.table_name}`));

    await pool.end();
    console.log("\nAll done! Database 'foir data' is fully initialized and ready.");
}

main().catch(err => {
    console.error("Database setup failed:", err);
    process.exit(1);
});

