// @ts-nocheck
"use strict";

const { Pool } = require("pg");
const config = require("../config/options");

async function seedMatrix() {
    if (!config.databaseUrl) {
        console.error("DATABASE_URL not set.");
        return;
    }
    const pool = new Pool({ connectionString: config.databaseUrl });
    const client = await pool.connect();

    try {
        console.log("Seeding initial policy matrix rows for HDFC Bank from sheet...");

        // SCAT A Slabs & Multipliers from user sheet
        const sampleRows = [
            // SCAT A (Super Category A)
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 25000, maxSal: 35000, tenure: 12, mult: 5, foir: 55 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 25000, maxSal: 35000, tenure: 24, mult: 10, foir: 55 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 25000, maxSal: 35000, tenure: 36, mult: 14, foir: 55 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 25000, maxSal: 35000, tenure: 48, mult: 16, foir: 55 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 25000, maxSal: 35000, tenure: 60, mult: 19, foir: 55 },

            { bank: "HDFC Bank", cat: "SCAT A", minSal: 35000, maxSal: 50000, tenure: 12, mult: 6, foir: 60 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 35000, maxSal: 50000, tenure: 24, mult: 10, foir: 60 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 35000, maxSal: 50000, tenure: 36, mult: 16, foir: 60 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 35000, maxSal: 50000, tenure: 48, mult: 20, foir: 60 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 35000, maxSal: 50000, tenure: 60, mult: 22, foir: 60 },

            { bank: "HDFC Bank", cat: "SCAT A", minSal: 50000, maxSal: 75000, tenure: 12, mult: 7, foir: 65 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 50000, maxSal: 75000, tenure: 24, mult: 13, foir: 65 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 50000, maxSal: 75000, tenure: 36, mult: 18, foir: 65 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 50000, maxSal: 75000, tenure: 48, mult: 23, foir: 65 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 50000, maxSal: 75000, tenure: 60, mult: 25, foir: 65 },

            { bank: "HDFC Bank", cat: "SCAT A", minSal: 75000, maxSal: 99999999, tenure: 12, mult: 7, foir: 70 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 75000, maxSal: 99999999, tenure: 24, mult: 13, foir: 70 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 75000, maxSal: 99999999, tenure: 36, mult: 18, foir: 70 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 75000, maxSal: 99999999, tenure: 48, mult: 23, foir: 70 },
            { bank: "HDFC Bank", cat: "SCAT A", minSal: 75000, maxSal: 99999999, tenure: 60, mult: 27, foir: 70 },

            // CATGB (Government Category B / Corporate B)
            { bank: "HDFC Bank", cat: "CATGB", minSal: 25000, maxSal: 35000, tenure: 60, mult: 16, foir: 55 },
            { bank: "HDFC Bank", cat: "CATGB", minSal: 35000, maxSal: 50000, tenure: 60, mult: 20, foir: 60 },
            { bank: "HDFC Bank", cat: "CATGB", minSal: 50000, maxSal: 75000, tenure: 60, mult: 24, foir: 65 },
            { bank: "HDFC Bank", cat: "CATGB", minSal: 75000, maxSal: 99999999, tenure: 60, mult: 27, foir: 70 },

            // CATGMED (Medical / Hospitals)
            { bank: "HDFC Bank", cat: "CATGMED", minSal: 25000, maxSal: 50000, tenure: 60, mult: 20, foir: 60 },
            { bank: "HDFC Bank", cat: "CATGMED", minSal: 50000, maxSal: 75000, tenure: 60, mult: 24, foir: 65 },
            { bank: "HDFC Bank", cat: "CATGMED", minSal: 75000, maxSal: 99999999, tenure: 60, mult: 30, foir: 70 }
        ];

        for (const r of sampleRows) {
            await client.query(
                `INSERT INTO bank_policy_matrix 
                    (bank_name, category, min_salary, max_salary, tenure_months, multiplier, foir_percent, active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
                [r.bank, r.cat, r.minSal, r.maxSal, r.tenure, r.mult, r.foir]
            );
        }

        console.log(`Seeded ${sampleRows.length} policy matrix rules successfully into bank_policy_matrix!`);
    } catch (e) {
        console.error("Error seeding matrix:", e.message);
    } finally {
        client.release();
        await pool.end();
    }
}

seedMatrix();

