// @ts-nocheck
"use strict";

const { calculateEligibility, calculateSingleEligibility } = require("../services/foirService");

function isNonNegativeNumber(value) {
    return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function validateRequest(body) {
    if (typeof body.companyName !== "string" || !body.companyName.trim()) {
        return "Company name is required.";
    }

    const income = body.income ?? body.salary;
    if (!Number.isFinite(Number(income)) || Number(income) <= 0) {
        return "Enter a valid monthly income greater than zero.";
    }

    if (!isNonNegativeNumber(body.annualRate)) {
        return "Enter a valid non-negative proposed rate.";
    }

    if (!Number.isFinite(Number(body.months)) || Number(body.months) <= 0) {
        return "Enter a valid loan tenure greater than zero.";
    }

    if (body.selectedLender) {
        if (typeof body.selectedLender !== "object" || !body.selectedLender.bank_name) {
            return "A valid lender must be selected.";
        }
        if (!isNonNegativeNumber(body.selectedLender.foir) || Number(body.selectedLender.foir) <= 0) {
            return "Selected lender must have a valid FOIR percentage.";
        }
        if (body.creditCardObligations !== undefined && !isNonNegativeNumber(body.creditCardObligations)) {
            return "Credit card obligations must be a non-negative number.";
        }
        if (body.existingEmiObligations !== undefined && !isNonNegativeNumber(body.existingEmiObligations)) {
            return "Existing EMI obligations must be a non-negative number.";
        }
        return null;
    }

    if (!Array.isArray(body.loans) || !Array.isArray(body.creditCards)) {
        return "Loan EMI and credit card inputs must be arrays.";
    }

    if (body.loans.some(loan =>
        !loan ||
        !isNonNegativeNumber(loan.monthlyEmi) ||
        (loan.balanceTransfer !== undefined && typeof loan.balanceTransfer !== "boolean")
    )) {
        return "Each loan must have a valid EMI and balance-transfer flag.";
    }

    if (body.creditCards.some(card =>
        !card || !isNonNegativeNumber(card.outstanding)
    )) {
        return "Each credit card must have a valid outstanding balance.";
    }

    return null;
}

function createFoirController(state) {
    return {
        async calculate(req, res) {
            const input = req.body || {};
            const validationError = validateRequest(input);

            if (validationError) {
                return res.status(400).json({
                    success: false,
                    message: validationError
                });
            }

            const pool = state.getPool();

            if (input.selectedLender) {
                try {
                    const result = await calculateSingleEligibility(input, pool);
                    return res.json({
                        success: true,
                        currentFoir: result.currentFoir,
                        availableEmi: result.availableEmi,
                        monthlyEmi: result.monthlyEmi,
                        maxAvailableEmi: result.maxAvailableEmi,
                        maxLoanAmount: result.maxLoanAmount,
                        finalLoanAmount: result.finalLoanAmount,
                        totalObligations: result.totalObligations,
                        monthlyCcObligation: result.monthlyCcObligation,
                        selectedLender: result.selectedLender
                    });
                } catch (error) {
                    console.error("Single lender calculation error:", error.message);
                    return res.status(500).json({
                        success: false,
                        message: "Failed to calculate loan eligibility."
                    });
                }
            }
            if (!pool) {
                return res.status(503).json({
                    success: false,
                    message: "PostgreSQL is not connected."
                });
            }

            try {
                const result = await calculateEligibility({
                    ...input,
                    companyName: input.companyName.trim()
                }, pool);

                if (!result) {
                    return res.status(404).json({
                        success: false,
                        message: `No lender mappings found for company "${input.companyName.trim()}".`
                    });
                }

                return res.json({
                    success: true,
                    currentFoir: result.currentFoir,
                    lenders: result.lenders
                });
            } catch (error) {
                console.error("FOIR calculation error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to calculate loan eligibility."
                });
            }
        },

        calculateEmi(req, res) {
            const body = req.body || {};
            const loanAmount = Number(body.loanAmount ?? body.finalLoanAmount);
            const annualRate = Number(body.annualRate);
            const months = Number(body.months);
            const maxLoanAmount = Number(body.maxLoanAmount);
            const maxAvailableEmi = Number(body.maxAvailableEmi);

            if (!Number.isFinite(loanAmount) || loanAmount < 0 ||
                !Number.isFinite(annualRate) || annualRate < 0 ||
                !Number.isFinite(months) || months <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid loan amount, interest rate, and tenure are required."
                });
            }

            const { calculateEmi: calcEmi } = require("../helpers/foirCalculator");
            const emi = Math.round(calcEmi(loanAmount, annualRate, months));
            const exceedsMax = Number.isFinite(maxLoanAmount) && maxLoanAmount > 0
                ? loanAmount > maxLoanAmount
                : false;

            return res.json({
                success: true,
                loanAmount,
                availableEmi: emi,
                monthlyEmi: emi,
                maxLoanAmount: Number.isFinite(maxLoanAmount) ? maxLoanAmount : null,
                maxAvailableEmi: Number.isFinite(maxAvailableEmi) ? maxAvailableEmi : null,
                exceedsMax
            });
        }
    };
}

module.exports = createFoirController;


