// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { getKnex } = require("../src/utils/knex");

test("knex instance connects and executes query builder", async (t) => {
    const db = getKnex();
    if (!db) {
        t.skip("No DATABASE_URL configured for Knex integration test.");
        return;
    }

    // Test simple select
    const result = await db.raw("SELECT 1 AS num");
    assert.equal(result.rows[0].num, 1);

    // Test querying bank_policy_matrix via Knex query builder
    const matrixCount = await db("bank_policy_matrix").count("id as count").first();
    assert.ok(Number(matrixCount.count) >= 0);

    // Test querying bank_employer_catalog via Knex query builder
    const catalogCount = await db("bank_employer_catalog").count("id as count").first();
    assert.ok(Number(catalogCount.count) >= 0);

    await db.destroy();
});

