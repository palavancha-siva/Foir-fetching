// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const createAdminApiAuth = require("../src/middleware/adminApiAuth");
const masterDataService = require("../src/services/masterDataService");

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test("company and category names are trimmed and validated", () => {
    assert.equal(
        masterDataService.normalizeName("  Example Company  ", "Company name"),
        "Example Company"
    );
    assert.throws(
        () => masterDataService.normalizeName(" ", "Category name"),
        masterDataService.InvalidMasterDataInputError
    );
    assert.throws(
        () => masterDataService.normalizeName("x".repeat(121), "Company name"),
        masterDataService.InvalidMasterDataInputError
    );
    assert.throws(
        () => masterDataService.normalizeFoir(""),
        masterDataService.InvalidMasterDataInputError
    );
    assert.throws(
        () => masterDataService.normalizeFoir(null),
        masterDataService.InvalidMasterDataInputError
    );
    assert.equal(masterDataService.normalizePercentage(undefined), 2);
    assert.throws(
        () => masterDataService.normalizePercentage("", "CC obligation percentage"),
        masterDataService.InvalidMasterDataInputError
    );
    assert.throws(
        () => masterDataService.normalizePercentage(101, "CC obligation percentage"),
        masterDataService.InvalidMasterDataInputError
    );
});

test("company additions save the normalized name to PostgreSQL", async () => {
    let queryText;
    let queryValues;
    const pool = {
        async query(text, values) {
            queryText = text;
            queryValues = values;
            return { rows: [{ id: "4", name: values[0] }] };
        }
    };

    const company = await masterDataService.addCompany("  Example Co  ", pool);

    assert.match(queryText, /INSERT INTO managed_companies/);
    assert.deepEqual(queryValues, ["Example Co"]);
    assert.deepEqual(company, { id: 4, name: "Example Co" });
});

test("company renames update matching bank mappings in one transaction", async () => {
    const statements = [];
    const client = {
        async query(text, values) {
            statements.push({ text, values });
            if (text.includes("SELECT company_name")) {
                return { rowCount: 1, rows: [{ company_name: "Old Co" }] };
            }
            if (text.includes("RETURNING id, company_name AS name")) {
                return { rows: [{ id: "7", name: values[1] }] };
            }
            return { rowCount: 1, rows: [] };
        },
        release() {}
    };
    const pool = { async connect() { return client; } };

    const result = await masterDataService.updateCompany(7, "New Co", pool);

    assert.deepEqual(result, { id: 7, name: "New Co" });
    assert.equal(statements[0].text, "BEGIN");
    assert.ok(statements.some(statement =>
        statement.text.includes("UPDATE company_bank_mappings") &&
        statement.values[0] === "Old Co" &&
        statement.values[1] === "New Co"
    ));
    assert.equal(statements.at(-1).text, "COMMIT");
});

test("category renames update mapping classifications transactionally", async () => {
    const statements = [];
    const client = {
        async query(text, values) {
            statements.push({ text, values });
            if (text.includes("SELECT name")) {
                return { rowCount: 1, rows: [{ name: "Old Category" }] };
            }
            if (text.includes("RETURNING id, name")) {
                return { rows: [{ id: "3", name: values[1] }] };
            }
            return { rowCount: 1, rows: [] };
        },
        release() {}
    };
    const pool = { async connect() { return client; } };

    const result = await masterDataService.updateCategory(
        3,
        "New Category",
        pool
    );

    assert.deepEqual(result, { id: 3, name: "New Category" });
    assert.ok(statements.some(statement =>
        statement.text.includes("UPDATE company_bank_mappings") &&
        statement.values[0] === "Old Category" &&
        statement.values[1] === "New Category"
    ));
    assert.equal(statements.at(-1).text, "COMMIT");
});

test("category deletion clears mapping assignments and retains the category record", async () => {
    const statements = [];
    const client = {
        async query(text, values) {
            statements.push({ text, values });
            if (text.includes("SELECT name")) {
                return { rowCount: 1, rows: [{ name: "Unused Category" }] };
            }
            return { rowCount: 1, rows: [] };
        },
        release() {}
    };
    const pool = { async connect() { return client; } };

    await masterDataService.deleteCategory(9, pool);

    assert.ok(statements.some(statement =>
        statement.text.includes("SET cat = NULL") &&
        statement.values[0] === "Unused Category"
    ));
    assert.ok(statements.some(statement =>
        statement.text.includes("UPDATE bank_categories") &&
        statement.text.includes("active = 0")
    ));
    assert.equal(statements.at(-1).text, "COMMIT");
});

test("bank mappings are added for a selected company and categories are registered", async () => {
    const statements = [];
    const client = {
        async query(text, values) {
            statements.push({ text, values });
            if (text.includes("SELECT company_name")) {
                return { rowCount: 1, rows: [{ company_name: "Example Co" }] };
            }
            if (text.includes("INSERT INTO company_bank_mappings")) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: "12",
                        company_name: "Example Co",
                        bank_name: "Example Bank",
                        cat: "CAT-A",
                        foir: "65.00",
                        cc_obligation_percent: "2.00"
                    }]
                };
            }
            return { rowCount: 1, rows: [] };
        },
        release() {}
    };
    const pool = { async connect() { return client; } };

    const mapping = await masterDataService.addBankMapping(
        4,
        { bank_name: " Example Bank ", cat: " CAT-A ", foir: 65 },
        pool
    );

    assert.deepEqual(mapping, {
        id: 12,
        company_name: "Example Co",
        bank_name: "Example Bank",
        cat: "CAT-A",
        foir: 65,
        cc_obligation_percent: 2
    });
    assert.ok(statements.some(statement =>
        statement.text.includes("INSERT INTO bank_categories") &&
        statement.values[0] === "CAT-A"
    ));
    assert.ok(statements.some(statement =>
        statement.text.includes("INSERT INTO company_bank_mappings") &&
        statement.values[0] === "Example Co"
    ));
    assert.equal(statements.at(-1).text, "COMMIT");
});

test("bank mapping edits are scoped to the selected company and validate FOIR", async () => {
    const statements = [];
    const client = {
        async query(text, values) {
            statements.push({ text, values });
            if (text.includes("SELECT company_name")) {
                return { rowCount: 1, rows: [{ company_name: "Example Co" }] };
            }
            if (text.includes("UPDATE company_bank_mappings")) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: "12",
                        company_name: "Example Co",
                        bank_name: "Updated Bank",
                        cat: "CAT-B",
                        foir: "70.00",
                        cc_obligation_percent: "3.00"
                    }]
                };
            }
            return { rowCount: 1, rows: [] };
        },
        release() {}
    };
    const pool = { async connect() { return client; } };

    const mapping = await masterDataService.updateBankMapping(
        4,
        12,
        {
            bank_name: "Updated Bank",
            cat: "CAT-B",
            foir: 70,
            cc_obligation_percent: 3
        },
        pool
    );

    assert.equal(mapping.bank_name, "Updated Bank");
    assert.equal(mapping.foir, 70);
    assert.equal(mapping.cc_obligation_percent, 3);
    const update = statements.find(statement =>
        statement.text.includes("UPDATE company_bank_mappings")
    );
    assert.match(update.text, /WHERE id = \$1/);
    assert.match(update.text, /company_name/);
    assert.deepEqual(update.values, [
        12,
        "Example Co",
        "Updated Bank",
        "CAT-B",
        70,
        3
    ]);

    await assert.rejects(
        masterDataService.addBankMapping(
            4,
            { bank_name: "Invalid", cat: "CAT-A", foir: 101 },
            pool
        ),
        masterDataService.InvalidMasterDataInputError
    );
});

test("bank mapping deletion deactivates only the selected mapping", async () => {
    const statements = [];
    const client = {
        async query(text, values) {
            statements.push({ text, values });
            if (text.includes("SELECT company_name")) {
                return { rowCount: 1, rows: [{ company_name: "Example Co" }] };
            }
            if (text.includes("UPDATE company_bank_mappings")) {
                return { rowCount: 1, rows: [{ id: "12" }] };
            }
            return { rowCount: 1, rows: [] };
        },
        release() {}
    };
    const pool = { async connect() { return client; } };

    await masterDataService.deleteBankMapping(4, 12, pool);

    const deletion = statements.find(statement =>
        statement.text.includes("UPDATE company_bank_mappings")
    );
    assert.match(deletion.text, /SET active = 0/);
    assert.match(deletion.text, /company_name/);
    assert.deepEqual(deletion.values, [12, "Example Co"]);
    assert.equal(statements.at(-1).text, "COMMIT");
});

test("admin management endpoints fail closed when no API token is configured", () => {
    const response = createResponse();
    const next = () => assert.fail("Request must not be authorized.");
    const middleware = createAdminApiAuth(() => "");

    middleware({ get: () => "Bearer token" }, response, next);

    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
});

test("admin management endpoints require the configured bearer token", () => {
    const unauthorized = createResponse();
    const middleware = createAdminApiAuth(() => "a".repeat(32));
    middleware({ get: () => "Bearer incorrect" }, unauthorized, () => {});
    assert.equal(unauthorized.statusCode, 401);

    let authorized = false;
    middleware(
        { get: () => `Bearer ${"a".repeat(32)}` },
        createResponse(),
        () => { authorized = true; }
    );
    assert.equal(authorized, true);
});

