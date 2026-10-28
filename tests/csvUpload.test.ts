// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseCsv, normalizeCsvRow } = require("../src/utils/csvParser");
const masterDataService = require("../src/services/masterDataService");

test("csvParser handles headers, commas, and quoted fields correctly", () => {
    const csv = `Bank Name,Company,Category,FOIR,CC Obligation
HDFC Bank,TCS,CAT A,75,2
ICICI Bank,"Infosys Technologies, Ltd",CAT A,70%,2.5%`;

    const records = parseCsv(csv);
    assert.equal(records.length, 2);

    const row0 = normalizeCsvRow(records[0]);
    assert.equal(row0.bank_name, "HDFC Bank");
    assert.equal(row0.company_name, "TCS");
    assert.equal(row0.cat, "CAT A");
    assert.equal(row0.foir, 75);
    assert.equal(row0.cc_obligation_percent, 2);

    const row1 = normalizeCsvRow(records[1]);
    assert.equal(row1.bank_name, "ICICI Bank");
    assert.equal(row1.company_name, "Infosys Technologies, Ltd");
    assert.equal(row1.cat, "CAT A");
    assert.equal(row1.foir, 70);
    assert.equal(row1.cc_obligation_percent, 2.5);
});

test("csvParser uses defaultBank when bank column is missing", () => {
    const csv = `Company,Category,FOIR\nWipro,CAT B,65`;
    const records = parseCsv(csv);
    assert.equal(records.length, 1);

    const row = normalizeCsvRow(records[0], "State Bank of India");
    assert.equal(row.bank_name, "State Bank of India");
    assert.equal(row.company_name, "Wipro");
    assert.equal(row.cat, "CAT B");
    assert.equal(row.foir, 65);
    assert.equal(row.cc_obligation_percent, 2);
});

test("bulkImportMappings validates invalid values", async () => {
    await assert.rejects(
        masterDataService.bulkImportMappings("", "HDFC", null),
        masterDataService.InvalidMasterDataInputError
    );

    const invalidFoir = `Company,Category,FOIR\nTCS,CAT A,150`;
    await assert.rejects(
        masterDataService.bulkImportMappings(invalidFoir, "HDFC", null),
        /FOIR must be a valid number between 0 and 100/
    );

    const missingBank = `Company,Category,FOIR\nTCS,CAT A,70`;
    await assert.rejects(
        masterDataService.bulkImportMappings(missingBank, "", null),
        /Bank name is required/
    );
});

test("bulkImportMappings mock execution parses and returns counts", async () => {
    const csv = `Bank Name,Company,Category,FOIR
HDFC Bank,TCS,CAT A,75
ICICI Bank,Infosys,CAT A,70`;

    const summary = await masterDataService.bulkImportMappings(csv, "", null);
    assert.equal(summary.total, 2);
    assert.equal(summary.inserted, 2);
    assert.deepEqual(summary.banks.sort(), ["HDFC Bank", "ICICI Bank"].sort());
    assert.deepEqual(summary.companies.sort(), ["Infosys", "TCS"].sort());
});

test("bulkImportMappings supports bank-specific EMPLOYERID, EMPLOYERNAME, EMPLOYER_CATG sheets", async () => {
    const csv = `EMPLOYERID,EMPLOYERNAME,EMPLOYER_CATG
125799,ANKURA HOSPITALS PUNE PRIVATE LIMITED,CATGMED
112317,1218 INDIA PRIVATE LIMITED,CATGB`;

    const summary = await masterDataService.bulkImportMappings(csv, "HDFC Bank", null);
    assert.equal(summary.total, 2);
    assert.equal(summary.inserted, 2);
    assert.deepEqual(summary.banks, ["HDFC Bank"]);
    assert.deepEqual(summary.companies.sort(), [
        "1218 INDIA PRIVATE LIMITED",
        "ANKURA HOSPITALS PUNE PRIVATE LIMITED"
    ].sort());
});

test("bulkImportMappings sanitizes newlines, control characters, and allows long company names", async () => {
    const csv = `Bank Name,Company,Category,FOIR
ICICI Bank,"LANDIS+GYR LIMITED\n\n(PARENT COMPANY- SOFINA)",Government,70
ICICI Bank,"Asian\tFootwears Pvt. Ltd",CAT B,70
ICICI Bank,"${"A".repeat(150)}",CAT A,70`;

    const summary = await masterDataService.bulkImportMappings(csv, "", null);
    assert.equal(summary.total, 3);
    assert.equal(summary.inserted, 3);
    assert.ok(summary.companies.includes("LANDIS+GYR LIMITED (PARENT COMPANY- SOFINA)"));
    assert.ok(summary.companies.includes("Asian Footwears Pvt. Ltd"));
    assert.ok(summary.companies.includes("A".repeat(150)));
});


