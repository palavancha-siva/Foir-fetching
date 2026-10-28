// @ts-nocheck
"use strict";

const { Pool } = require("pg");
const config = require("../config/options");

async function checkYesBank() {
    const pool = new Pool({ connectionString: config.databaseUrl });
    try {
        const banks = await pool.query("SELECT id, bank_name, length(bank_name) as len, active FROM managed_banks WHERE LOWER(bank_name) LIKE '%yes%'");
        console.log("managed_banks matching 'yes':");
        console.table(banks.rows);

        const allBanks = await pool.query("SELECT id, bank_name, active FROM managed_banks ORDER BY id ASC");
        console.log("all managed_banks:");
        console.table(allBanks.rows);

        const mappings = await pool.query("SELECT bank_name, count(*) as count FROM company_bank_mappings WHERE LOWER(bank_name) LIKE '%yes%' GROUP BY bank_name");
        console.log("company_bank_mappings matching 'yes':");
        console.table(mappings.rows);

        const sampleMappings = await pool.query("SELECT * FROM company_bank_mappings WHERE LOWER(bank_name) LIKE '%yes%' LIMIT 5");
        console.log("sample mappings for yes bank:");
        console.table(sampleMappings.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkYesBank();

