// @ts-nocheck
"use strict";

const { Pool } = require("pg");
const config = require("../config/options");

const mappingsData = [
    // TCS
    { bank_name: "HDFC Bank", company: "TCS", cat: "CAT A", foir: 75 },
    { bank_name: "ICICI Bank", company: "TCS", cat: "CAT A", foir: 75 },
    { bank_name: "Axis Bank", company: "TCS", cat: "CAT A", foir: 70 },
    { bank_name: "SBI", company: "TCS", cat: "CAT A", foir: 70 },
    { bank_name: "Kotak Mahindra", company: "TCS", cat: "CAT B", foir: 65 },

    // Infosys
    { bank_name: "HDFC Bank", company: "Infosys", cat: "CAT A", foir: 75 },
    { bank_name: "ICICI Bank", company: "Infosys", cat: "CAT A", foir: 75 },
    { bank_name: "Axis Bank", company: "Infosys", cat: "CAT A", foir: 70 },
    { bank_name: "SBI", company: "Infosys", cat: "CAT A", foir: 70 },
    { bank_name: "Kotak Mahindra", company: "Infosys", cat: "CAT B", foir: 65 },

    // Wipro
    { bank_name: "HDFC Bank", company: "Wipro", cat: "CAT A", foir: 70 },
    { bank_name: "ICICI Bank", company: "Wipro", cat: "CAT A", foir: 70 },
    { bank_name: "Axis Bank", company: "Wipro", cat: "CAT B", foir: 65 },
    { bank_name: "SBI", company: "Wipro", cat: "CAT A", foir: 68 },
    { bank_name: "Kotak Mahindra", company: "Wipro", cat: "CAT B", foir: 60 },

    // Accenture
    { bank_name: "HDFC Bank", company: "Accenture", cat: "CAT A", foir: 75 },
    { bank_name: "ICICI Bank", company: "Accenture", cat: "CAT A", foir: 75 },
    { bank_name: "Axis Bank", company: "Accenture", cat: "CAT A", foir: 70 },
    { bank_name: "SBI", company: "Accenture", cat: "CAT A", foir: 70 },
    { bank_name: "Kotak Mahindra", company: "Accenture", cat: "CAT B", foir: 65 },

    // Cognizant
    { bank_name: "HDFC Bank", company: "Cognizant", cat: "CAT A", foir: 75 },
    { bank_name: "ICICI Bank", company: "Cognizant", cat: "CAT A", foir: 75 },
    { bank_name: "Axis Bank", company: "Cognizant", cat: "CAT A", foir: 70 },
    { bank_name: "IndusInd Bank", company: "Cognizant", cat: "CAT B", foir: 65 },
    { bank_name: "Yes Bank", company: "Cognizant", cat: "CAT B", foir: 65 },

    // Capgemini
    { bank_name: "HDFC Bank", company: "Capgemini", cat: "CAT A", foir: 75 },
    { bank_name: "ICICI Bank", company: "Capgemini", cat: "CAT A", foir: 75 },
    { bank_name: "Axis Bank", company: "Capgemini", cat: "CAT A", foir: 70 },
    { bank_name: "IDFC First Bank", company: "Capgemini", cat: "CAT B", foir: 65 },
    { bank_name: "Kotak Mahindra", company: "Capgemini", cat: "CAT B", foir: 65 },

    // Government
    { bank_name: "SBI", company: "Government", cat: "CAT A", foir: 80 },
    { bank_name: "HDFC Bank", company: "Government", cat: "CAT A", foir: 80 },
    { bank_name: "ICICI Bank", company: "Government", cat: "CAT A", foir: 80 },
    { bank_name: "Bank of Baroda", company: "Government", cat: "CAT A", foir: 80 },
    { bank_name: "Canara Bank", company: "Government", cat: "CAT A", foir: 80 },

    // Amazon
    { bank_name: "HDFC Bank", company: "Amazon", cat: "CAT A", foir: 75 },
    { bank_name: "ICICI Bank", company: "Amazon", cat: "CAT A", foir: 75 },
    { bank_name: "Axis Bank", company: "Amazon", cat: "CAT A", foir: 70 },
    { bank_name: "Kotak Mahindra", company: "Amazon", cat: "CAT B", foir: 65 },
    { bank_name: "IndusInd Bank", company: "Amazon", cat: "CAT B", foir: 65 },

    // Google
    { bank_name: "HDFC Bank", company: "Google", cat: "CAT A", foir: 80 },
    { bank_name: "ICICI Bank", company: "Google", cat: "CAT A", foir: 80 },
    { bank_name: "Axis Bank", company: "Google", cat: "CAT A", foir: 75 },
    { bank_name: "SBI", company: "Google", cat: "CAT A", foir: 75 },
    { bank_name: "Kotak Mahindra", company: "Google", cat: "CAT B", foir: 70 },

    // Microsoft
    { bank_name: "HDFC Bank", company: "Microsoft", cat: "CAT A", foir: 80 },
    { bank_name: "ICICI Bank", company: "Microsoft", cat: "CAT A", foir: 80 },
    { bank_name: "Axis Bank", company: "Microsoft", cat: "CAT A", foir: 75 },
    { bank_name: "SBI", company: "Microsoft", cat: "CAT A", foir: 75 },
    { bank_name: "IDFC First Bank", company: "Microsoft", cat: "CAT B", foir: 70 },

    // IBM
    { bank_name: "HDFC Bank", company: "IBM", cat: "CAT A", foir: 75 },
    { bank_name: "ICICI Bank", company: "IBM", cat: "CAT A", foir: 75 },
    { bank_name: "Axis Bank", company: "IBM", cat: "CAT A", foir: 70 },
    { bank_name: "Yes Bank", company: "IBM", cat: "CAT B", foir: 65 },
    { bank_name: "IndusInd Bank", company: "IBM", cat: "CAT B", foir: 65 }
];

async function seed() {
    const pool = new Pool({ connectionString: config.databaseUrl });
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const targetCompanies = [...new Set(mappingsData.map(d => d.company.toLowerCase()))];
        for (const company of targetCompanies) {
            await client.query(
                "DELETE FROM company_bank_mappings WHERE LOWER(TRIM(company_name)) = $1",
                [company]
            );
        }

        for (const item of mappingsData) {
            await client.query(
                `INSERT INTO company_bank_mappings (company_name, bank_name, cat, foir, cc_obligation_percent, active)
                 VALUES ($1, $2, $3, $4, 2, 1)`,
                [item.company, item.bank_name, item.cat, item.foir]
            );

            await client.query(
                `INSERT INTO managed_companies (company_name, active)
                 VALUES ($1, 1)
                 ON CONFLICT (LOWER(TRIM(company_name))) WHERE active = 1
                 DO NOTHING`,
                [item.company]
            );

            await client.query(
                `INSERT INTO bank_categories (name, active)
                 VALUES ($1, 1)
                 ON CONFLICT (LOWER(TRIM(name))) WHERE active = 1
                 DO NOTHING`,
                [item.cat]
            );
        }

        await client.query("COMMIT");
        console.log(`Successfully seeded ${mappingsData.length} mappings across ${targetCompanies.length} companies!`);
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Seeding error:", err);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

seed();

