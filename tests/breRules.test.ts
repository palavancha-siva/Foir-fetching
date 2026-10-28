// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import options from "../config/options";
import configOptions from "../config/configOptions";
import {
    ensureBreRulesTable,
    listRulesByBank,
    createRule,
    updateRule,
    toggleRuleStatus,
    deleteRule,
    bulkImportBreRules,
    BreRuleError,
    resolveBreFoir
} from "../src/services/breService";

test("BRE Rules service operations and overlap validations", async (t) => {
    const activeConfig = (configOptions as any)?.default || configOptions;
    const activeOptions = (options as any)?.default || options;

    const testDb = knex(activeConfig?.knexConfig || {
        client: "pg",
        connection: activeOptions?.databaseUrl || "postgresql://postgres:postgres@localhost:5432/foir_data",
        pool: { min: 1, max: 5 }
    });

    try {
        await testDb.raw("SELECT 1");
    } catch {
        t.skip("PostgreSQL not reachable for breRules test");
        await testDb.destroy();
        return;
    }

    try {
        // 1. Ensure table and seeds
        await ensureBreRulesTable(testDb);

        // 2. Fetch dynamically for HDFC Bank
        const hdfcRules = await listRulesByBank("HDFC Bank", testDb);
        assert.ok(Array.isArray(hdfcRules), "HDFC rules should return an array");
        assert.ok(hdfcRules.length >= 3, "HDFC should have at least 3 seeded rules");
        assert.ok(hdfcRules[0].bank_name.startsWith("HDFC"), "Rule bank name should start with HDFC");
        assert.ok(hdfcRules[0].min_salary >= 0, "Rule min_salary should be non-negative");

        // 3. Test bank with no rules initially
        const testBankName = `TestBank_${Date.now()}`;
        const emptyRules = await listRulesByBank(testBankName, testDb);
        assert.equal(emptyRules.length, 0, "New test bank should have 0 rules initially");

        // 4. Create first rule in CAT A: 0 to 50,000 FOIR 50%
        const rule1 = await createRule({
            bank_name: testBankName,
            category: "CAT A",
            rule_name: "Test Rule 1",
            condition_type: "range",
            min_salary: 0,
            max_salary: 50000,
            foir_percent: 50
        }, testDb);
        assert.ok(rule1.id > 0, "Rule 1 should be created with valid ID");
        assert.equal(rule1.category, "CAT A");
        assert.equal(rule1.rule_name, "Test Rule 1");
        assert.equal(rule1.active, true);

        // 4b. Create rule in CAT B with IDENTICAL salary range (0 to 50,000).
        // Since it is a different category, this MUST SUCCEED without conflict!
        const ruleCatB = await createRule({
            bank_name: testBankName,
            category: "CAT B",
            rule_name: "Rule CAT B - 1",
            condition_type: "range",
            min_salary: 0,
            max_salary: 50000,
            foir_percent: 45
        }, testDb);
        assert.ok(ruleCatB.id > 0, "Different category rule with same salary range should succeed");
        assert.equal(ruleCatB.category, "CAT B");

        // 5. Attempt overlapping rule in CAT A: 30,000 to 70,000 (should be rejected!)
        await assert.rejects(
            async () => {
                await createRule({
                    bank_name: testBankName,
                    category: "CAT A",
                    rule_name: "Overlapping Rule",
                    condition_type: "range",
                    min_salary: 30000,
                    max_salary: 70000,
                    foir_percent: 60
                }, testDb);
            },
            (err: any) => {
                assert.ok(err instanceof BreRuleError, "Error must be BreRuleError");
                assert.match(err.message, /overlaps with existing active/i);
                return true;
            },
            "Overlapping range within same category must be rejected"
        );

        // 6. Create non-overlapping rule in CAT A: 50,001 to 100,000 FOIR 60%
        const rule2 = await createRule({
            bank_name: testBankName,
            category: "CAT A",
            rule_name: "Test Rule 2",
            condition_type: "range",
            min_salary: 50001,
            max_salary: 100000,
            foir_percent: 60
        }, testDb);
        assert.ok(rule2.id > 0, "Rule 2 should be created successfully without overlap");

        // 7. Toggle status: Deactivate Rule 1
        const deactivated = await toggleRuleStatus(rule1.id, false, testDb);
        assert.equal(deactivated.active, false, "Rule 1 should now be inactive");

        // 8. While Rule 1 is inactive, creating range 0 to 50,000 in CAT A should now succeed!
        const rule3 = await createRule({
            bank_name: testBankName,
            category: "CAT A",
            rule_name: "Test Rule 3 (Replacement for inactive 1)",
            condition_type: "range",
            min_salary: 0,
            max_salary: 50000,
            foir_percent: 55
        }, testDb);
        assert.ok(rule3.id > 0, "Rule 3 should succeed since Rule 1 is inactive");

        // 9. Attempting to reactivate Rule 1 now MUST fail because Rule 3 occupies that range in CAT A!
        await assert.rejects(
            async () => {
                await toggleRuleStatus(rule1.id, true, testDb);
            },
            (err: any) => {
                assert.ok(err instanceof BreRuleError);
                assert.match(err.message, /overlaps with active/i);
                return true;
            },
            "Reactivating Rule 1 must fail due to overlap with active Rule 3"
        );

        // 10. Update Rule 2 FOIR to 65%
        const updated = await updateRule(rule2.id, {
            category: "CAT A",
            rule_name: "Test Rule 2 Updated",
            min_salary: 50001,
            max_salary: 100000,
            foir_percent: 65
        }, testDb);
        assert.equal(updated.category, "CAT A");
        assert.equal(updated.foir_percent, 65);

        // 11. Delete initial test rules
        await deleteRule(rule1.id, testDb);
        await deleteRule(ruleCatB.id, testDb);
        await deleteRule(rule2.id, testDb);
        await deleteRule(rule3.id, testDb);

        const afterDelete = await listRulesByBank(testBankName, testDb);
        assert.equal(afterDelete.length, 0, "All initial test rules should be deleted");

        // 12. Test Bulk Import of BRE rules with Category from CSV
        const sampleCsv = `Bank,Category,Rule Name,Condition Type,Min Salary,Max Salary,FOIR %,Active
${testBankName},CAT A,Imported Rule 1,range,0,45000,48,1
${testBankName},CAT A,Imported Rule 2,range,45001,90000,58,1
${testBankName},CAT B,Imported Rule 3,greater_than,90001,99999999,68,1`;

        const bulkResult = await bulkImportBreRules(sampleCsv, testBankName, testDb);
        assert.equal(bulkResult.inserted, 3, "Should insert 3 rules from CSV");

        const importedRules = await listRulesByBank(testBankName, testDb);
        assert.equal(importedRules.length, 3, "Should have 3 rules after CSV import");
        assert.equal(importedRules[0].category, "CAT A");
        assert.equal(importedRules[2].category, "CAT B");
        assert.equal(importedRules[0].foir_percent, 48);

        // 13. Test resolveBreFoir dynamically resolving FOIR from imported BRE rules
        const resolvedFoirLow = await resolveBreFoir(testBankName, "CAT A", 30000, testDb);
        assert.ok(resolvedFoirLow, "Should resolve FOIR for 30k salary");
        assert.equal(resolvedFoirLow.foirPercent, 48, "Salary 30k in CAT A should resolve to 48% FOIR");

        const resolvedFoirMid = await resolveBreFoir(testBankName, "CAT A", 65000, testDb);
        assert.ok(resolvedFoirMid, "Should resolve FOIR for 65k salary");
        assert.equal(resolvedFoirMid.foirPercent, 58, "Salary 65k in CAT A should resolve to 58% FOIR");

        const resolvedFoirCatB = await resolveBreFoir(testBankName, "CAT B", 120000, testDb);
        assert.ok(resolvedFoirCatB, "Should resolve FOIR for 120k salary in CAT B");
        assert.equal(resolvedFoirCatB.foirPercent, 68, "Salary 120k in CAT B should resolve to 68% FOIR");

        // 14. Test ICICI exact rules import with Condition column and Home Loan logic
        const iciciCsv = `icici,,
rule no.,condition,foir
1,salary should be <=50000,55%
2,salary should be >=50000,65%
3,salary should be >=50000+home lone,70%
4,salary shouble be >=300000+home lone,75%`;

        const iciciBulk = await bulkImportBreRules(iciciCsv, "ICICI", testDb);
        assert.ok(iciciBulk.inserted >= 1 || iciciBulk.updated >= 1, "Should successfully import ICICI rules");

        const iciciRules = await listRulesByBank("ICICI", testDb);
        assert.ok(iciciRules.length >= 4, "ICICI should have at least 4 rules");

        // Test ICICI FOIR evaluation:
        // Rule 1: <= 50000 -> 55%
        const iciciLow = await resolveBreFoir("ICICI", "CAT A", 45000, { hasHomeLoan: false, dbOrPool: testDb });
        assert.ok(iciciLow, "ICICI low salary should resolve");
        assert.equal(iciciLow.foirPercent, 55, "Salary 45k should resolve to 55% FOIR");

        // Rule 2: >= 50000 (No Home Loan) -> 65%
        const iciciMidNoHl = await resolveBreFoir("ICICI", "CAT A", 60000, { hasHomeLoan: false, dbOrPool: testDb });
        assert.ok(iciciMidNoHl, "ICICI 60k no HL should resolve");
        assert.equal(iciciMidNoHl.foirPercent, 65, "Salary 60k without home loan should resolve to 65% FOIR");

        // Rule 3: >= 50000 + Home Loan -> 70%
        const iciciMidWithHl = await resolveBreFoir("ICICI", "CAT A", 60000, { hasHomeLoan: true, dbOrPool: testDb });
        assert.ok(iciciMidWithHl, "ICICI 60k with HL should resolve");
        assert.equal(iciciMidWithHl.foirPercent, 70, "Salary 60k with home loan should resolve to 70% FOIR");

        // Rule 4: >= 300000 + Home Loan -> 75%
        const iciciHighWithHl = await resolveBreFoir("ICICI", "CAT A", 350000, { hasHomeLoan: true, dbOrPool: testDb });
        assert.ok(iciciHighWithHl, "ICICI 350k with HL should resolve");
        assert.equal(iciciHighWithHl.foirPercent, 75, "Salary 350k with home loan should resolve to 75% FOIR");

        // Test dynamic controller resolver endpoint
        const createBreController = require("../src/controllers/breController");
        const breCtrl = createBreController({ getPool: () => testDb });

        let resolvedRes: any = null;
        await breCtrl.resolveRule(
            { query: { bank: "ICICI", category: "CAT A", salary: "75000", hasHomeLoan: "true" } },
            { json: (d: any) => { resolvedRes = d; return d; }, status: () => ({ json: (d: any) => { resolvedRes = d; return d; } }) }
        );
        assert.ok(resolvedRes && resolvedRes.success, "breCtrl.resolveRule should succeed");
        assert.equal(resolvedRes.foir, 70, "breCtrl.resolveRule should return 70% from DB for 75k with home loan");

        let resolvedNoHlRes: any = null;
        await breCtrl.resolveRule(
            { query: { bank: "ICICI", category: "CAT A", salary: "75000", hasHomeLoan: "false" } },
            { json: (d: any) => { resolvedNoHlRes = d; return d; }, status: () => ({ json: (d: any) => { resolvedNoHlRes = d; return d; } }) }
        );
        assert.ok(resolvedNoHlRes && resolvedNoHlRes.success, "breCtrl.resolveRule without HL should succeed");
        assert.equal(resolvedNoHlRes.foir, 65, "breCtrl.resolveRule should return 65% from DB for 75k without home loan");

        // Cleanup
        await testDb("bre_rules").whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [testBankName]).delete();
        await testDb("managed_banks").whereRaw("LOWER(TRIM(bank_name)) = LOWER(TRIM(?))", [testBankName]).delete();
    } finally {
        await testDb.destroy();
    }
});
