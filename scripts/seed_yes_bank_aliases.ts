// @ts-nocheck
"use strict";

const { Pool } = require("pg");
const config = require("../config/options");

async function seedAliases() {
    const pool = new Pool({ connectionString: config.databaseUrl });
    const client = await pool.connect();

    try {
        console.log("Seeding Yes Bank mappings for top aliases...");
        const aliases = [
            { company: "TCS", cat: "CAT A", foir: 70 },
            { company: "Infosys", cat: "CAT A", foir: 70 },
            { company: "Wipro", cat: "CAT A", foir: 70 },
            { company: "Accenture", cat: "CAT A", foir: 70 },
            { company: "Capgemini", cat: "CAT B", foir: 65 },
            { company: "Amazon", cat: "CAT A", foir: 70 },
            { company: "Google", cat: "CAT A", foir: 75 },
            { company: "Microsoft", cat: "CAT A", foir: 75 },
            { company: "Government", cat: "CAT A", foir: 75 }
        ];

        for (const item of aliases) {
            await client.query(`
                INSERT INTO managed_companies (company_name, active)
                VALUES ($1, 1)
                ON CONFLICT (LOWER(TRIM(company_name))) WHERE active = 1
                DO NOTHING
            `, [item.company]);

            await client.query(`
                INSERT INTO company_bank_mappings (company_name, bank_name, cat, foir, cc_obligation_percent, active)
                VALUES ($1, 'Yes Bank', $2, $3, 2, 1)
                ON CONFLICT (LOWER(TRIM(company_name)), LOWER(TRIM(bank_name)), LOWER(TRIM(COALESCE(cat, ''))))
                WHERE active = 1
                DO UPDATE SET foir = EXCLUDED.foir, active = 1
            `, [item.company, item.cat, item.foir]);
        }

        console.log("Seeded Yes Bank aliases successfully!");
    } finally {
        client.release();
        await pool.end();
    }
}

seedAliases().catch(console.error);

