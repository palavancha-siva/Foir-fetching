// @ts-nocheck
"use strict";

const { Pool } = require("pg");
const config = require("../config/options");

const rules = [
    // 1. SCAT A
    { cat: "SCAT A", minSal: 0, maxSal: 25000, foir: 40.00, mult: 15 },
    { cat: "SCAT A", minSal: 25000, maxSal: 50000, foir: 55.00, mult: 22 },
    { cat: "SCAT A", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 25 },
    { cat: "SCAT A", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 27 },

    // 2. CAT A
    { cat: "CAT A", minSal: 0, maxSal: 25000, foir: 40.00, mult: 15 },
    { cat: "CAT A", minSal: 25000, maxSal: 50000, foir: 55.00, mult: 20 },
    { cat: "CAT A", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 23 },
    { cat: "CAT A", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 24 },

    // 3. CAT B
    { cat: "CAT B", minSal: 0, maxSal: 25000, foir: 40.00, mult: 12 },
    { cat: "CAT B", minSal: 25000, maxSal: 50000, foir: 55.00, mult: 15 },
    { cat: "CAT B", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "CAT B", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 22 },

    // 4. CAT C
    { cat: "CAT C", minSal: 0, maxSal: 35000, foir: 40.00, mult: 10 },
    { cat: "CAT C", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 13 },
    { cat: "CAT C", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "CAT C", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 21 },

    // 5. CAT D
    { cat: "CAT D", minSal: 0, maxSal: 35000, foir: 40.00, mult: 10 },
    { cat: "CAT D", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 12 },
    { cat: "CAT D", minSal: 50000, maxSal: 75000, foir: 60.00, mult: 14 },
    { cat: "CAT D", minSal: 75000, maxSal: 99999999, foir: 65.00, mult: 15 },

    // 6. CAT GA (Government A)
    { cat: "CAT GA", minSal: 0, maxSal: 50000, foir: 50.00, mult: 15 },
    { cat: "CAT GA", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "CAT GA", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 20 },

    // 7. CAT GB (Government B)
    { cat: "CAT GB", minSal: 0, maxSal: 25000, foir: 40.00, mult: 10 },
    { cat: "CAT GB", minSal: 25000, maxSal: 35000, foir: 50.00, mult: 10 },
    { cat: "CAT GB", minSal: 35000, maxSal: 50000, foir: 55.00, mult: 20 },
    { cat: "CAT GB", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "CAT GB", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 22 },

    // 8. CAT GO (Government Officers / Nurses / Others)
    { cat: "CAT GO", minSal: 0, maxSal: 35000, foir: 40.00, mult: 10 },
    { cat: "CAT GO", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 15 },
    { cat: "CAT GO", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "CAT GO", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 22 },

    // 9. CAT RA (Retail / Rural A)
    { cat: "CAT RA", minSal: 0, maxSal: 50000, foir: 50.00, mult: 15 },
    { cat: "CAT RA", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 23 },
    { cat: "CAT RA", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 25 },

    // 10. CAT RB (Retail / Rural B)
    { cat: "CAT RB", minSal: 0, maxSal: 35000, foir: 40.00, mult: 10 },
    { cat: "CAT RB", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 18 },
    { cat: "CAT RB", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 23 },
    { cat: "CAT RB", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 25 },

    // 11. CAT RC (Retail / Rural C)
    { cat: "CAT RC", minSal: 0, maxSal: 25000, foir: 40.00, mult: 10 },
    { cat: "CAT RC", minSal: 25000, maxSal: 35000, foir: 50.00, mult: 14 },
    { cat: "CAT RC", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 14 },
    { cat: "CAT RC", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "CAT RC", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 22 },

    // 12. CAT RO (Retail / Rural Others)
    { cat: "CAT RO", minSal: 0, maxSal: 25000, foir: 40.00, mult: 10 },
    { cat: "CAT RO", minSal: 25000, maxSal: 35000, foir: 50.00, mult: 14 },
    { cat: "CAT RO", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 18 },
    { cat: "CAT RO", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 23 },
    { cat: "CAT RO", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 25 },

    // 13. CAT EDU (Education - Teaching & Non-Teaching)
    { cat: "CAT EDU", minSal: 0, maxSal: 35000, foir: 40.00, mult: 10 },
    { cat: "CAT EDU", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 13 },
    { cat: "CAT EDU", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "CAT EDU", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 21 },

    // 14. EDU ALPHA
    { cat: "EDU ALPHA", minSal: 0, maxSal: 50000, foir: 50.00, mult: 15 },
    { cat: "EDU ALPHA", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 25 },
    { cat: "EDU ALPHA", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 27 },

    // 15. EDU BETA
    { cat: "EDU BETA", minSal: 0, maxSal: 50000, foir: 50.00, mult: 15 },
    { cat: "EDU BETA", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "EDU BETA", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 22 },

    // 16. COMMON SHORT ALIASES (RA, RB, RC, RO, GO, GA, GB, EDU)
    { cat: "RA", minSal: 0, maxSal: 50000, foir: 50.00, mult: 15 },
    { cat: "RA", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 23 },
    { cat: "RA", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 25 },

    { cat: "RB", minSal: 0, maxSal: 35000, foir: 40.00, mult: 10 },
    { cat: "RB", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 18 },
    { cat: "RB", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 23 },
    { cat: "RB", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 25 },

    { cat: "RC", minSal: 0, maxSal: 25000, foir: 40.00, mult: 10 },
    { cat: "RC", minSal: 25000, maxSal: 35000, foir: 50.00, mult: 14 },
    { cat: "RC", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 14 },
    { cat: "RC", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "RC", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 22 },

    { cat: "RO", minSal: 0, maxSal: 25000, foir: 40.00, mult: 10 },
    { cat: "RO", minSal: 25000, maxSal: 35000, foir: 50.00, mult: 14 },
    { cat: "RO", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 18 },
    { cat: "RO", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 23 },
    { cat: "RO", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 25 },

    { cat: "GO", minSal: 0, maxSal: 35000, foir: 40.00, mult: 10 },
    { cat: "GO", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 15 },
    { cat: "GO", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "GO", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 22 },

    { cat: "GA", minSal: 0, maxSal: 50000, foir: 50.00, mult: 15 },
    { cat: "GA", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "GA", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 20 },

    { cat: "EDU", minSal: 0, maxSal: 35000, foir: 40.00, mult: 10 },
    { cat: "EDU", minSal: 35000, maxSal: 50000, foir: 50.00, mult: 13 },
    { cat: "EDU", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "EDU", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 21 },

    // 17. DEFAULT FALLBACK
    { cat: "DEFAULT", minSal: 0, maxSal: 25000, foir: 40.00, mult: 10 },
    { cat: "DEFAULT", minSal: 25000, maxSal: 50000, foir: 55.00, mult: 15 },
    { cat: "DEFAULT", minSal: 50000, maxSal: 75000, foir: 65.00, mult: 20 },
    { cat: "DEFAULT", minSal: 75000, maxSal: 99999999, foir: 70.00, mult: 22 }
];

async function seed() {
    const pool = new Pool({ connectionString: config.databaseUrl });
    const client = await pool.connect();

    try {
        console.log("Seeding category & salary based policy matrix...");
        await client.query("DELETE FROM bank_policy_matrix;");

        for (const r of rules) {
            await client.query(
                `INSERT INTO bank_policy_matrix 
                    (bank_name, category, min_salary, max_salary, tenure_months, multiplier, foir_percent, active)
                 VALUES ('STANDARD', $1, $2, $3, 60, $4, $5, 1)`,
                [r.cat, r.minSal, r.maxSal, r.mult, r.foir]
            );
        }

        // Also ensure all categories are registered in bank_categories for autocomplete
        const distinctCats = [...new Set(rules.map(r => r.cat))];
        for (const cat of distinctCats) {
            await client.query(`
                INSERT INTO bank_categories (name, active)
                SELECT $1, 1
                WHERE NOT EXISTS (
                    SELECT 1 FROM bank_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
                );
            `, [cat]);
        }

        console.log(`Successfully seeded ${rules.length} policy matrix rules and synced ${distinctCats.length} categories!`);
    } catch (e) {
        console.error("Seeding failed:", e);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();


