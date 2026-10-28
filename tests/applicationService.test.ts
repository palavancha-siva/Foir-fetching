// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    evaluateApplication,
    getApplicationHistory
} = require("../src/services/applicationService");
const { BANK_CONFIGS } = require("../src/constants/bankConfigs");
const {
    DEFAULT_CREDIT_CARD_OBLIGATION_PERCENT,
    calculateFoir
} = require("../src/helpers/foirCalculator");

function createState() {
    return {
        getPool: () => null,
        memoryStore: {
            applications: [],
            decisions: []
        },
        bankConfigs: BANK_CONFIGS
    };
}

const validApplicant = {
    name: "Test Applicant",
    age: 30,
    employment_type: "salaried",
    monthly_income: 100000,
    existing_emi: 0,
    requested_loan_amount: 500000,
    loan_type: "personal",
    loan_tenure_months: 60,
    credit_score: 780,
    employment_years: 4,
    existing_defaults: 0
};

test("evaluation stores bank decisions and returns them in history", async () => {
    const state = createState();
    const result = await evaluateApplication(validApplicant, state);
    const history = await getApplicationHistory(state);

    assert.equal(result.mode, "demo");
    assert.equal(result.banks.length, BANK_CONFIGS.length);
    assert.equal(history.history.length, 1);
    assert.equal(history.history[0].decisions.length, BANK_CONFIGS.length);
});

test("evaluation rejects invalid applicant values", () => {
    const state = createState();

    assert.throws(
        () => evaluateApplication({ ...validApplicant, age: "invalid" }, state),
        /valid numeric values/
    );
});

test("uses the default 2% card obligation and does not expose card obligations", () => {
    const result = calculateFoir({
        income: 60000,
        annualRate: 12,
        months: 60,
        loans: [{ monthlyEmi: 8000 }],
        creditCards: [
            { outstanding: 100000 },
            { outstanding: 40000 }
        ],
        lenderMappings: [
            { bank_name: "Example Bank", foir: 70 }
        ]
    });

    assert.equal(DEFAULT_CREDIT_CARD_OBLIGATION_PERCENT, 2);
    assert.equal(result.currentFoir, 18);
    assert.equal(result.lenders[0].available_emi, 31200);
    assert.equal(result.lenders[0].cc_obligation_percent, 2);
    assert.equal(
        Object.hasOwn(result, "creditCardObligations"),
        false
    );
    assert.equal(
        Object.hasOwn(result.lenders[0], "creditCardObligations"),
        false
    );
});

test("applies the configured bank-wise card percentage and excludes balance transfers", () => {
    const result = calculateFoir({
        income: 100000,
        annualRate: 12,
        months: 60,
        loans: [
            { monthlyEmi: 10000, balanceTransfer: true },
            { monthlyEmi: 5000 }
        ],
        creditCards: [{ outstanding: 100000 }],
        lenderMappings: [{
            bank_name: "Example Bank",
            foir: 70,
            cc_obligation_percent: 4
        }]
    });

    assert.equal(result.currentFoir, 9);
    assert.equal(result.lenders[0].current_foir, 9);
    assert.equal(result.lenders[0].available_emi, 61000);
});

test("calculates credit-card obligations separately for each bank", () => {
    const result = calculateFoir({
        income: 100000,
        annualRate: 12,
        months: 60,
        loans: [],
        creditCards: [{ outstanding: 100000 }],
        lenderMappings: [
            { bank_name: "Two Percent Bank", foir: 70, cc_obligation_percent: 2 },
            { bank_name: "Five Percent Bank", foir: 70, cc_obligation_percent: 5 }
        ]
    });

    assert.equal(result.lenders[0].available_emi, 68000);
    assert.equal(result.lenders[0].current_foir, 2);
    assert.equal(result.lenders[1].available_emi, 65000);
    assert.equal(result.lenders[1].current_foir, 5);
    assert.equal(result.currentFoir, 5);
});

test("single lender FOIR and loan eligibility calculates correctly with 2% CC obligations", () => {
    const { calculateSingleLenderEligibility } = require("../src/helpers/foirCalculator");

    const result = calculateSingleLenderEligibility({
        income: 100000,
        annualRate: 10.5,
        months: 60,
        selectedLender: {
            bank_name: "HDFC",
            cat: "CAT A",
            foir: 65,
            cc_obligation_percent: 2
        },
        creditCardObligations: 100000,
        existingEmiObligations: 15000
    });

    // 2% of 100,000 = 2,000 + 15,000 = 17,000
    assert.equal(result.monthlyCcObligation, 2000);
    assert.equal(result.totalObligations, 17000);
    assert.equal(result.currentFoir, 17);
    assert.equal(result.availableEmi, 48000); // 65,000 - 17,000
    assert.ok(result.maxLoanAmount > 2000000);
    assert.equal(result.selectedLender.bank_name, "HDFC");
    assert.equal(result.selectedLender.foir, 65);
});

test("single lender FOIR returns zero available EMI and loan amount when obligations exceed allowed limit", () => {
    const { calculateSingleLenderEligibility } = require("../src/helpers/foirCalculator");

    const result = calculateSingleLenderEligibility({
        income: 50000,
        annualRate: 11,
        months: 36,
        selectedLender: {
            bank_name: "SBI",
            cat: "CAT B",
            foir: 50,
            cc_obligation_percent: 2
        },
        creditCardObligations: 500000, // 2% of 500,000 = 10,000
        existingEmiObligations: 20000  // total = 30,000 (60% FOIR > 50% limit)
    });

    assert.equal(result.monthlyCcObligation, 10000);
    assert.equal(result.totalObligations, 30000);
    assert.equal(result.currentFoir, 60);
    assert.equal(result.availableEmi, 0); // 25,000 max allowed - 30,000 = 0
    assert.equal(result.maxLoanAmount, 0);
});

test("single lender FOIR recalculates available EMI based on editable finalLoanAmount", () => {
    const { calculateSingleLenderEligibility } = require("../src/helpers/foirCalculator");

    const result = calculateSingleLenderEligibility({
        income: 100000,
        annualRate: 12,
        months: 60,
        selectedLender: {
            bank_name: "HDFC",
            cat: "CAT A",
            foir: 70,
            cc_obligation_percent: 2
        },
        creditCardObligations: 0,
        existingEmiObligations: 0,
        finalLoanAmount: 50000 // user customizes to 50,000
    });

    assert.equal(result.finalLoanAmount, 50000);
    assert.ok(result.maxLoanAmount > 100000);
    // At 12% annual rate for 60 months, 50,000 EMI is ~1112
    assert.equal(result.availableEmi, 1112);
    assert.equal(result.monthlyEmi, 1112);
    assert.equal(result.maxAvailableEmi, 70000);
});



