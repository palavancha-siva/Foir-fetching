import { resolveDynamicFoir } from "./policyMatrix";

export const DEFAULT_FOIR_PERCENT = 70;
export const DEFAULT_CREDIT_CARD_OBLIGATION_PERCENT = 2;
export const LOAN_UNIT = 100000;

export function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function sum(values: number[]): number {
    return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

export function calculateEmi(principal: number, annualRate: number, months: number): number {
    const amount = Number(principal);
    const rate = Number(annualRate);
    const tenure = Number(months);

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate < 0 ||
        !Number.isFinite(tenure) || tenure <= 0) {
        return 0;
    }

    const monthlyRate = rate / 12 / 100;
    if (monthlyRate === 0) {
        return round2(amount / tenure);
    }

    const factor = Math.pow(1 + monthlyRate, tenure);
    return round2((amount * monthlyRate * factor) / (factor - 1));
}

export interface CalculateFoirInput {
    income: number;
    annualRate: number;
    months: number;
    loans?: Array<{ monthlyEmi: number; balanceTransfer?: boolean }>;
    creditCards?: Array<{ outstanding: number; bankName?: string }>;
    lenderMappings?: Array<any>;
}

export function calculateFoir({
    income,
    annualRate,
    months,
    loans = [],
    creditCards = [],
    lenderMappings = []
}: any) {
    const monthlyIncome = Number(income);
    const rate = Number(annualRate);
    const tenure = Number(months);

    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0 ||
        !Number.isFinite(rate) || rate < 0 ||
        !Number.isFinite(tenure) || tenure <= 0) {
        throw new Error("Income, interest rate, and tenure must be valid numbers.");
    }

    const loanEmis = sum(
        loans
            .filter((loan: any) => !loan.balanceTransfer)
            .map((loan: any) => loan.monthlyEmi)
    );
    const lenders = lenderMappings.map((mapping: any) => {
        let foirPercent = DEFAULT_FOIR_PERCENT;
        let salarySlab = mapping.salary_slab || "";

        if (mapping.bre_slabs && Array.isArray(mapping.bre_slabs) && mapping.bre_slabs.length > 0) {
            const matched = mapping.bre_slabs.find((s: any) =>
                monthlyIncome >= Number(s.min_salary) && monthlyIncome <= Number(s.max_salary)
            );
            if (matched) {
                foirPercent = Number(matched.foir_percent);
                salarySlab = matched.rule_name || `${Math.round(matched.min_salary / 1000)}K–${Math.round(matched.max_salary / 1000)}K`;
            } else if (Number.isFinite(Number(mapping.foir)) && Number(mapping.foir) > 0) {
                foirPercent = Number(mapping.foir);
            }
        } else if (mapping.foir !== undefined && mapping.foir !== null && mapping.foir !== "") {
            foirPercent = Number(mapping.foir);
        } else if (mapping.cat) {
            const matrix = resolveDynamicFoir(mapping.cat, monthlyIncome);
            salarySlab = matrix.salarySlab;
            foirPercent = matrix.foir;
        } else if (Number.isFinite(Number(mapping.foir)) && Number(mapping.foir) >= 0) {
            foirPercent = Number(mapping.foir);
        }
        const parsedCardObligationPercent = Number(
            mapping.cc_obligation_percent
        );
        const cardObligationPercent =
            Number.isFinite(parsedCardObligationPercent) &&
                parsedCardObligationPercent >= 0 &&
                parsedCardObligationPercent <= 100
                ? parsedCardObligationPercent
                : DEFAULT_CREDIT_CARD_OBLIGATION_PERCENT;
        const creditCardObligations = sum(
            creditCards.map((card: any) =>
                (Number(card.outstanding) || 0) *
                cardObligationPercent / 100
            )
        );
        const totalObligations = round2(
            loanEmis + creditCardObligations
        );
        const currentFoir = round2(
            totalObligations / monthlyIncome * 100
        );
        const availableEmi = Math.round(Math.max(
            monthlyIncome * foirPercent / 100 - totalObligations,
            0
        ));
        const emiPerLakh = Math.round(calculateEmi(LOAN_UNIT, rate, tenure));
        const eligibleAmount = availableEmi > 0 && emiPerLakh > 0
            ? round2(availableEmi / emiPerLakh * LOAN_UNIT)
            : 0;
        const eligible = availableEmi > 0 && eligibleAmount > 0;

        return {
            bank_name: mapping.bank_name || mapping.bankName,
            foir: foirPercent,
            salary_slab: salarySlab,
            cc_obligation_percent: cardObligationPercent,
            current_foir: currentFoir,
            available_emi: availableEmi,
            emi_per_lakh: emiPerLakh,
            eligible_amount: eligibleAmount,
            tenure_months: tenure,
            monthly_emi: eligible ? calculateEmi(eligibleAmount, rate, tenure) : 0,
            eligible,
            status: eligible ? "Eligible" : "Not Eligible"
        };
    });

    const currentFoir = lenders.length
        ? Math.max(...lenders.map((lender: any) => lender.current_foir))
        : round2(loanEmis / monthlyIncome * 100);

    return {
        currentFoir,
        lenders
    };
}

export function calculateSingleLenderEligibility({
    income,
    annualRate,
    months,
    selectedLender,
    creditCardObligations = 0,
    existingEmiObligations = 0,
    finalLoanAmount = null,
    desiredLoanAmount = null
}: any) {
    const monthlyIncome = Number(income);
    const rate = Number(annualRate);
    const tenure = Number(months);
    const ccObs = Math.max(0, Number(creditCardObligations) || 0);
    const emiObs = Math.max(0, Number(existingEmiObligations) || 0);

    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0 ||
        !Number.isFinite(rate) || rate < 0 ||
        !Number.isFinite(tenure) || tenure <= 0) {
        throw new Error("Income, interest rate, and tenure must be valid numbers.");
    }

    if (!selectedLender || !selectedLender.bank_name) {
        throw new Error("A valid lender must be selected.");
    }

    const parsedCardPercent = Number(selectedLender.cc_obligation_percent);
    const cardObligationPercent = Number.isFinite(parsedCardPercent) && parsedCardPercent >= 0 && parsedCardPercent <= 100
        ? parsedCardPercent
        : DEFAULT_CREDIT_CARD_OBLIGATION_PERCENT;

    const monthlyCcObligation = round2(ccObs * (cardObligationPercent / 100));
    const totalObligations = round2(monthlyCcObligation + emiObs);
    let foirPercent = DEFAULT_FOIR_PERCENT;
    let salarySlab = selectedLender.salary_slab || "";

    if (selectedLender.foir !== undefined && selectedLender.foir !== null && selectedLender.foir !== "") {
        foirPercent = Number(selectedLender.foir);
    } else if (selectedLender.cat) {
        const matrix = resolveDynamicFoir(selectedLender.cat, monthlyIncome);
        salarySlab = matrix.salarySlab;
        foirPercent = matrix.foir;
    } else if (Number.isFinite(Number(selectedLender.foir)) && Number(selectedLender.foir) > 0) {
        foirPercent = Number(selectedLender.foir);
    }

    const currentFoir = round2((totalObligations / monthlyIncome) * 100);
    const maxAllowedEmi = (monthlyIncome * foirPercent) / 100;
    const maxAvailableEmi = Math.round(Math.max(maxAllowedEmi - totalObligations, 0));

    const emiPerLakh = Math.round(calculateEmi(LOAN_UNIT, rate, tenure));
    const maxLoanAmount = maxAvailableEmi > 0 && emiPerLakh > 0
        ? Math.round((maxAvailableEmi / emiPerLakh) * LOAN_UNIT)
        : 0;

    const customAmount = finalLoanAmount !== null && finalLoanAmount !== undefined
        ? Number(finalLoanAmount)
        : (desiredLoanAmount !== null && desiredLoanAmount !== undefined ? Number(desiredLoanAmount) : null);

    let effectiveLoanAmount = maxLoanAmount;
    let availableEmi = maxAvailableEmi;

    if (customAmount !== null && Number.isFinite(customAmount) && customAmount > 0) {
        effectiveLoanAmount = Math.round(customAmount);
        availableEmi = Math.round(calculateEmi(effectiveLoanAmount, rate, tenure));
    }

    return {
        currentFoir,
        availableEmi,
        monthlyEmi: availableEmi,
        maxAvailableEmi,
        maxLoanAmount,
        finalLoanAmount: effectiveLoanAmount,
        totalObligations,
        monthlyCcObligation,
        ccObligationPercent: cardObligationPercent,
        selectedLender: {
            bank_name: selectedLender.bank_name,
            cat: selectedLender.cat || "",
            foir: foirPercent,
            salary_slab: salarySlab,
            cc_obligation_percent: cardObligationPercent
        }
    };
}

module.exports = {
    DEFAULT_FOIR_PERCENT,
    DEFAULT_CREDIT_CARD_OBLIGATION_PERCENT,
    LOAN_UNIT,
    round2,
    sum,
    calculateEmi,
    calculateFoir,
    calculateSingleLenderEligibility
};
