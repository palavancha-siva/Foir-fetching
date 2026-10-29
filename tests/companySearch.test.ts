// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { searchCompanies } = require("../src/services/companyService");
const createCompanyController = require("../src/controllers/companyController");
const { getKnex } = require("../src/utils/knex");

test("company search controller demo fallback ranks exact match first", async () => {
    const controller = createCompanyController({
        getPool() {
            return null; // Forces fallback mode
        }
    });

    let jsonResult = null;
    const req = {
        query: { search: "tcs" }
    };
    const res = {
        json(data) {
            jsonResult = data;
            return this;
        },
        status() {
            return this;
        }
    };

    await controller.search(req, res);

    assert.ok(Array.isArray(jsonResult));
    assert.ok(jsonResult.length > 0);
    assert.equal(jsonResult[0].name, "TCS", "TCS must be the first result for query 'tcs'");
});

test("company search with 1 letter 't' returns companies starting with 't' or words starting with 't'", async (t) => {
    const db = getKnex();
    if (!db) {
        t.skip("No DATABASE_URL configured for database company search test.");
        return;
    }

    try {
        const results = await searchCompanies("t", db);
        assert.ok(Array.isArray(results) && results.length > 0, "Should return results for single letter 't'");
        
        // Ensure top result starts with 'T' (e.g. TCS)
        assert.ok(
            results[0].name.toUpperCase().startsWith("T"),
            `First result '${results[0].name}' must start with letter 'T'`
        );
    } finally {
        // Shared singleton, do not destroy between tests
    }
});

test("company search with 2 letters 'tc' returns companies starting with 'tc' or words starting with 'tc'", async (t) => {
    const db = getKnex();
    if (!db) {
        t.skip("No DATABASE_URL configured for database company search test.");
        return;
    }

    try {
        const results = await searchCompanies("tc", db);
        assert.ok(Array.isArray(results) && results.length > 0, "Should return results for 2 letters 'tc'");

        // Top results must start with 'TC'
        assert.ok(
            results[0].name.toUpperCase().startsWith("TC"),
            `First result '${results[0].name}' must start with 'TC'`
        );
    } finally {
        // Shared singleton, do not destroy between tests
    }
});

test("company search ranks exact and prefix matches above substring matches in DB", async (t) => {
    const db = getKnex();
    if (!db) {
        t.skip("No DATABASE_URL configured for database company search test.");
        return;
    }

    try {
        const results = await searchCompanies("tcs", db);
        if (!results || results.length === 0) {
            t.skip("No companies found in database matching 'tcs'");
            return;
        }

        // Verify that if 'TCS' exists in results, it is at index 0 (exact match)
        const tcsIndex = results.findIndex(c => c.name.toUpperCase() === "TCS");
        if (tcsIndex !== -1) {
            assert.equal(tcsIndex, 0, "Exact match 'TCS' should appear as the very first result");
        }

        // Verify that prefix matches (names starting with 'TCS') appear before mid-word matches like 'AAITCS' or 'LOGISTCS'
        const prefixMatches = results.filter(c => c.name.toUpperCase().startsWith("TCS"));
        const substringOnlyMatches = results.filter(c => !c.name.toUpperCase().startsWith("TCS") && !c.name.toUpperCase().includes(" TCS"));

        if (prefixMatches.length > 0 && substringOnlyMatches.length > 0) {
            const lastPrefixIndex = results.map(c => c.name).lastIndexOf(prefixMatches[prefixMatches.length - 1].name);
            const firstSubstringIndex = results.map(c => c.name).indexOf(substringOnlyMatches[0].name);
            assert.ok(
                lastPrefixIndex < firstSubstringIndex,
                `Prefix match '${prefixMatches[prefixMatches.length - 1].name}' (idx: ${lastPrefixIndex}) should appear before mid-word match '${substringOnlyMatches[0].name}' (idx: ${firstSubstringIndex})`
            );
        }
    } finally {
        // Shared singleton, do not destroy between tests
    }
});
