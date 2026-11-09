const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgresql://postgres:Siva@2004@localhost:5432/foir data" });

async function check() {
    try {
        const total = await pool.query("SELECT count(*) FROM pincode_master");
        console.log("Total in pincode_master:", total.rows[0].count);

        const states = await pool.query("SELECT state, count(*) FROM pincode_master GROUP BY state ORDER BY count DESC");
        console.log("States in DB:", JSON.stringify(states.rows));

        const ap = await pool.query("SELECT * FROM pincode_master WHERE LOWER(state) LIKE '%andhra%' OR LOWER(state) = 'ap' LIMIT 10");
        console.log("AP records found:", ap.rows.length, JSON.stringify(ap.rows));

        const bankPins = await pool.query("SELECT bank_name, count(*) FROM bank_pincode_serviceability GROUP BY bank_name");
        console.log("Bank pincode serviceability counts:", JSON.stringify(bankPins.rows));

        const recent = await pool.query("SELECT * FROM pincode_master ORDER BY id DESC LIMIT 5");
        console.log("Recent 5 pincodes:", JSON.stringify(recent.rows));
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await pool.end();
    }
}
check();
