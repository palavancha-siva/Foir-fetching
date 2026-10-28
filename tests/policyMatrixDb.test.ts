// @ts-nocheck
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDatabasePool, db } = require("../src/utils/dbUtil");
const config = require("../config/options");
const {
    getDynamicFoirFromDb,
    listMatrixRules,
    addMatrixRule,
    updateMatrixRule,
    deleteMatrixRule,
    bulkImportMatrixRules
} = require("../src/services/policyMatrixService");

test("Policy Matrix database dynamic operations and real-time updates", async (t) => {
    let pool;
    try {
        pool = createDatabasePool(config);
        const testRes = await pool.query("SELECT 1;");
        assert.equal(testRes.rowCount, 1);
    } catch (_err) {
        // Skip DB tests if PostgreSQL is unreachable in this environment
        t.skip("PostgreSQL not accessible for DB policy matrix tests");
        return;
    }

    try {
        // 1. Test dynamic FOIR lookup for CAT A across salary slabs
        const r1 = await getDynamicFoirFromDb("CAT A", 30000, pool);
        assert.equal(r1.foir, 55, "CAT A at 30k should be 55% from DB");
        assert.equal(r1.salarySlab, "25K – 50K");

        const r2 = await getDynamicFoirFromDb("CAT A", 60000, pool);
        assert.equal(r2.foir, 65, "CAT A at 60k should be 65% from DB");
        assert.equal(r2.salarySlab, "50K – 75K");

        const r3 = await getDynamicFoirFromDb("CAT A", 90000, pool);
        assert.equal(r3.foir, 70, "CAT A at 90k should be 70% from DB");
        assert.equal(r3.salarySlab, "> 75K");

        // 2. Test dynamic FOIR lookup for CAT C
        const r4 = await getDynamicFoirFromDb("CAT C", 40000, pool);
        assert.equal(r4.foir, 50, "CAT C at 40k should be 50% from DB");
        assert.equal(r4.salarySlab, "35K – 50K");

        // 3. Test dynamic FOIR lookup for newly requested categories directly from PostgreSQL
        const rGA = await getDynamicFoirFromDb("CAT GA", 40000, pool);
        assert.equal(rGA.foir, 50, "CAT GA at 40k should be 50% from DB");
        assert.equal(rGA.multiplier, 15);

        const rGO = await getDynamicFoirFromDb("CAT GO", 60000, pool);
        assert.equal(rGO.foir, 65, "CAT GO at 60k should be 65% from DB");
        assert.equal(rGO.multiplier, 20);

        const rRA = await getDynamicFoirFromDb("CAT RA", 90000, pool);
        assert.equal(rRA.foir, 70, "CAT RA at 90k should be 70% from DB");
        assert.equal(rRA.multiplier, 25);

        const rRB = await getDynamicFoirFromDb("CAT RB", 40000, pool);
        assert.equal(rRB.foir, 50, "CAT RB at 40k should be 50% from DB");
        assert.equal(rRB.multiplier, 18);

        const rRC = await getDynamicFoirFromDb("CAT RC", 30000, pool);
        assert.equal(rRC.foir, 50, "CAT RC at 30k should be 50% from DB");
        assert.equal(rRC.multiplier, 14);

        const rRO = await getDynamicFoirFromDb("CAT RO", 40000, pool);
        assert.equal(rRO.foir, 50, "CAT RO at 40k should be 50% from DB");
        assert.equal(rRO.multiplier, 18);

        const rEDU = await getDynamicFoirFromDb("CAT EDU", 60000, pool);
        assert.equal(rEDU.foir, 65, "CAT EDU at 60k should be 65% from DB");
        assert.equal(rEDU.multiplier, 20);

        const rEduAlpha = await getDynamicFoirFromDb("EDU ALPHA", 80000, pool);
        assert.equal(rEduAlpha.foir, 70, "EDU ALPHA at 80k should be 70% from DB");
        assert.equal(rEduAlpha.multiplier, 27);

        const rEduBeta = await getDynamicFoirFromDb("EDU BETA", 80000, pool);
        assert.equal(rEduBeta.foir, 70, "EDU BETA at 80k should be 70% from DB");
        assert.equal(rEduBeta.multiplier, 22);

        // Test short alias lookups (e.g. RC, GO, RA)
        const rShort = await getDynamicFoirFromDb("RC", 60000, pool);
        assert.equal(rShort.foir, 65, "Short alias RC should resolve properly");
        assert.equal(rShort.multiplier, 20);

        // 4. Test listing matrix rules
        const rules = await listMatrixRules(pool);
        assert.ok(Array.isArray(rules), "Rules should be an array");
        assert.ok(rules.length >= 20, "Should have seeded rules");

        // 4. Test adding a new custom policy rule dynamically
        const newRule = await addMatrixRule({
            category: "TEST_CAT_XYZ",
            min_salary: 20000,
            max_salary: 45000,
            foir_percent: 58.5,
            multiplier: 19,
            tenure_months: 60,
            bank_name: "STANDARD"
        }, pool);

        assert.ok(newRule.id, "New rule should have an id");
        assert.equal(newRule.category, "TEST_CAT_XYZ");
        assert.equal(Number(newRule.foir_percent), 58.5);

        // Verify lookup immediately uses the newly added rule from DB!
        const checkNew = await getDynamicFoirFromDb("TEST_CAT_XYZ", 30000, pool);
        assert.equal(checkNew.foir, 58.5, "Lookup must immediately return the new rule from DB");

        // 5. Test modifying the rule dynamically at any time
        await updateMatrixRule(newRule.id, {
            category: "TEST_CAT_XYZ",
            min_salary: 20000,
            max_salary: 45000,
            foir_percent: 63.0,
            multiplier: 21,
            tenure_months: 60,
            bank_name: "STANDARD"
        }, pool);

        // Verify lookup immediately reflects the updated FOIR % in real time!
        const checkUpdated = await getDynamicFoirFromDb("TEST_CAT_XYZ", 30000, pool);
        assert.equal(checkUpdated.foir, 63.0, "Lookup must immediately reflect the updated value");

        // 6. Test deleting the rule
        await deleteMatrixRule(newRule.id, pool);

        // After deleting, category falls back to DB default or standard
        const checkDeleted = await getDynamicFoirFromDb("TEST_CAT_XYZ", 30000, pool);
        assert.notEqual(checkDeleted.foir, 63.0, "Deleted rule must no longer be returned");

        // 7. Test bulk import matrix rules from CSV
        const sampleCsv = `Category,Min Salary,Max Salary,FOIR %,Multiplier,Tenure,Bank\nTEST_BULK_A,10000,30000,48,15,60,STANDARD\nTEST_BULK_A,30000,60000,58,20,60,STANDARD`;
        const bulkSummary = await bulkImportMatrixRules(sampleCsv, pool);
        assert.equal(bulkSummary.inserted, 2, "Should insert 2 rules from CSV");

        const checkBulk = await getDynamicFoirFromDb("TEST_BULK_A", 40000, pool);
        assert.equal(checkBulk.foir, 58, "Bulk imported rule should be queried from DB");

        // Clean up test bulk rules
        await db("bank_policy_matrix").whereLike("category", "TEST_%").delete();

    } finally {
        await pool.end();
        await db.destroy();
    }
});

