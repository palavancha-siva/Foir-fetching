// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveDynamicFoir, resolveMultiplier } = require("../src/helpers/policyMatrix");

test("dynamic FOIR resolves correctly by Category and Salary as per user matrix", () => {
    // Reference tests requested by user:
    // CAT A
    assert.deepEqual(resolveDynamicFoir("CAT A", 30000), { foir: 55, salarySlab: "25K – 50K" });
    assert.deepEqual(resolveDynamicFoir("CAT A", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("CAT A", 90000), { foir: 70, salarySlab: "> 75K" });

    // CAT C
    assert.deepEqual(resolveDynamicFoir("CAT C", 40000), { foir: 50, salarySlab: "35K – 50K" });
    assert.deepEqual(resolveDynamicFoir("CAT C", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("CAT C", 85000), { foir: 70, salarySlab: "> 75K" });

    // Boundary edge cases
    assert.equal(resolveDynamicFoir("CAT A", 25000).foir, 55);
    assert.equal(resolveDynamicFoir("CAT A", 50000).foir, 65);
    assert.equal(resolveDynamicFoir("CAT A", 75000).foir, 70);
    assert.equal(resolveDynamicFoir("CAT C", 35000).foir, 50);
    assert.equal(resolveDynamicFoir("CAT C", 50000).foir, 65);
    assert.equal(resolveDynamicFoir("CAT C", 75000).foir, 70);

    // Below minimum slabs
    assert.equal(resolveDynamicFoir("CAT A", 20000).foir, 40);
    assert.equal(resolveDynamicFoir("CAT C", 30000).foir, 40);
});

test("dynamic FOIR resolves correctly for all Government, Retail, and Education categories", () => {
    // CAT GA & GA
    assert.deepEqual(resolveDynamicFoir("CAT GA", 40000), { foir: 50, salarySlab: "< 50K" });
    assert.deepEqual(resolveDynamicFoir("GA", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("CAT GA", 80000), { foir: 70, salarySlab: "> 75K" });

    // CAT GO & GO
    assert.deepEqual(resolveDynamicFoir("CAT GO", 30000), { foir: 40, salarySlab: "< 35K" });
    assert.deepEqual(resolveDynamicFoir("GO", 40000), { foir: 50, salarySlab: "35K – 50K" });
    assert.deepEqual(resolveDynamicFoir("CAT GO", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("CAT GO", 90000), { foir: 70, salarySlab: "> 75K" });

    // CAT RA & RA
    assert.deepEqual(resolveDynamicFoir("CAT RA", 45000), { foir: 50, salarySlab: "< 50K" });
    assert.deepEqual(resolveDynamicFoir("RA", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("CAT RA", 85000), { foir: 70, salarySlab: "> 75K" });

    // CAT RB & RB
    assert.deepEqual(resolveDynamicFoir("CAT RB", 40000), { foir: 50, salarySlab: "35K – 50K" });
    assert.deepEqual(resolveDynamicFoir("RB", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("CAT RB", 80000), { foir: 70, salarySlab: "> 75K" });

    // CAT RC & RC
    assert.deepEqual(resolveDynamicFoir("CAT RC", 20000), { foir: 40, salarySlab: "< 25K" });
    assert.deepEqual(resolveDynamicFoir("RC", 30000), { foir: 50, salarySlab: "25K – 35K" });
    assert.deepEqual(resolveDynamicFoir("CAT RC", 40000), { foir: 50, salarySlab: "35K – 50K" });
    assert.deepEqual(resolveDynamicFoir("CAT RC", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("RC", 90000), { foir: 70, salarySlab: "> 75K" });

    // CAT RO & RO
    assert.deepEqual(resolveDynamicFoir("CAT RO", 30000), { foir: 50, salarySlab: "25K – 35K" });
    assert.deepEqual(resolveDynamicFoir("RO", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("CAT RO", 80000), { foir: 70, salarySlab: "> 75K" });

    // CAT EDU & EDU
    assert.deepEqual(resolveDynamicFoir("CAT EDU", 40000), { foir: 50, salarySlab: "35K – 50K" });
    assert.deepEqual(resolveDynamicFoir("EDU", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("CAT EDU", 80000), { foir: 70, salarySlab: "> 75K" });

    // EDU ALPHA & EDU BETA
    assert.deepEqual(resolveDynamicFoir("EDU ALPHA", 40000), { foir: 50, salarySlab: "< 50K" });
    assert.deepEqual(resolveDynamicFoir("EDU ALPHA", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("EDU ALPHA", 80000), { foir: 70, salarySlab: "> 75K" });

    assert.deepEqual(resolveDynamicFoir("EDU BETA", 40000), { foir: 50, salarySlab: "< 50K" });
    assert.deepEqual(resolveDynamicFoir("EDU BETA", 60000), { foir: 65, salarySlab: "50K – 75K" });
    assert.deepEqual(resolveDynamicFoir("EDU BETA", 80000), { foir: 70, salarySlab: "> 75K" });
});

test("dynamic multipliers resolve correctly for loan tenure and salary", () => {
    assert.equal(resolveMultiplier("CAT A", 60000, 60), 25);
    assert.equal(resolveMultiplier("CAT A", 90000, 60), 27);
    assert.equal(resolveMultiplier("CAT C", 60000, 60), 20);
    assert.equal(resolveMultiplier("CAT GA", 80000, 60), 20);
    assert.equal(resolveMultiplier("CAT RA", 80000, 60), 25);
    assert.equal(resolveMultiplier("EDU ALPHA", 80000, 60), 27);
});

