// @ts-nocheck
"use strict";

const { Pool } = require("pg");
const config = require("../config/options");
const masterDataService = require("../src/services/masterDataService");

async function testFetch() {
    const pool = new Pool({ connectionString: config.databaseUrl });
    try {
        console.log("Testing listBankMappings('Yes Bank')...");
        const t0 = Date.now();
        const mappings = await masterDataService.listBankMappings("Yes Bank", pool);
        console.log(`Fetched ${mappings.length} mappings for 'Yes Bank' in ${Date.now() - t0}ms`);
        console.log("First 3 items:", mappings.slice(0, 3));

        console.log("\nTesting listBankMappings('5') by ID...");
        const mappingsById = await masterDataService.listBankMappings("5", pool);
        console.log(`Fetched ${mappingsById.length} mappings for ID 5 in ${Date.now() - t0}ms`);

        console.log("\nTesting company lookup for Cognizant (which is mapped to Yes Bank)...");
        const companyService = require("../src/services/companyService");
        const compRes = await companyService.getCompanyMappings("Cognizant", pool);
        console.log("Cognizant mappings count:", compRes.rows.length);
        console.table(compRes.rows);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await pool.end();
    }
}

testFetch();

