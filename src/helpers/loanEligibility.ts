export interface Applicant {
    name: string;
    age: number;
    employment_type: string;
    monthly_income: number;
    existing_emi: number;
    requested_loan_amount: number;
    loan_type: string;
    loan_tenure_months: number;
    credit_score: number;
    employment_years: number;
    existing_defaults: number;
    [key: string]: any;
}

export interface BankConfig {
    name: string;
    logo_initials: string;
    logo_color: string;
    min_age: number;
    max_age: number;
    min_credit_score: number;
    strong_credit_score: number;
    min_income: number;
    max_emi_ratio: number;
    interest_rates: Record<string, number>;
    [key: string]: any;
}

function emiToIncomeRatio(applicant: Applicant): number {
    if (applicant.monthly_income <= 0) {
        return 1;
    }
    const estimatedNewEmi = applicant.requested_loan_amount / Math.max(applicant.loan_tenure_months, 1);
    return (applicant.existing_emi + estimatedNewEmi) / applicant.monthly_income;
}

function buildRules(config: BankConfig) {
    return [
        {
            id: "min_age",
            description: `Applicant must be at least ${config.min_age} years old`,
            severity: "hard",
            weight: 1,
            check: (applicant: Applicant) => applicant.age >= config.min_age
        },
        {
            id: "max_age",
            description: `Applicant must be under ${config.max_age} years old`,
            severity: "hard",
            weight: 1,
            check: (applicant: Applicant) => applicant.age <= config.max_age
        },
        {
            id: "no_active_defaults",
            description: "Applicant must have no existing loan defaults",
            severity: "hard",
            weight: 1,
            check: (applicant: Applicant) => applicant.existing_defaults === 0
        },
        {
            id: "min_credit_score",
            description: `CIBIL score must be at least ${config.min_credit_score}`,
            severity: "hard",
            weight: 1,
            check: (applicant: Applicant) => applicant.credit_score >= config.min_credit_score
        },
        {
            id: "employed",
            description: "Applicant must not be unemployed",
            severity: "hard",
            weight: 1,
            check: (applicant: Applicant) => applicant.employment_type !== "unemployed"
        },
        {
            id: "emi_income_ratio",
            description: `Total EMI burden should not exceed ${Math.round(config.max_emi_ratio * 100)}% of monthly income`,
            severity: "soft",
            weight: 3,
            check: (applicant: Applicant) => emiToIncomeRatio(applicant) <= config.max_emi_ratio
        },
        {
            id: "min_income",
            description: `Monthly income should be at least ${config.min_income.toLocaleString("en-IN")}`,
            severity: "soft",
            weight: 2,
            check: (applicant: Applicant) => applicant.monthly_income >= config.min_income
        },
        {
            id: "employment_stability",
            description: "Preferably at least 1 year in current employment",
            severity: "soft",
            weight: 1,
            check: (applicant: Applicant) => applicant.employment_years >= 1
        },
        {
            id: "strong_credit_score",
            description: `CIBIL score of ${config.strong_credit_score}+ is considered strong`,
            severity: "soft",
            weight: 1,
            check: (applicant: Applicant) => applicant.credit_score >= config.strong_credit_score
        }
    ];
}

function friendlyReason(id: string, applicant: Applicant, config: BankConfig): string {
    const messages: Record<string, string> = {
        min_age: `Your age (${applicant.age}) is below this bank's minimum eligible age of ${config.min_age}.`,
        max_age: `Your age (${applicant.age}) is above this bank's maximum eligible age of ${config.max_age}.`,
        no_active_defaults: "You have an existing loan default on record, which this bank does not allow.",
        min_credit_score: `Your CIBIL score is low (${applicant.credit_score}). This bank requires a minimum CIBIL score of ${config.min_credit_score}.`,
        employed: "This bank requires applicants to be currently employed.",
        employment_stability: "You have been at your current job for less than 1 year, which adds some risk.",
        strong_credit_score: `Your CIBIL score (${applicant.credit_score}) is acceptable but not in this bank's strong range of ${config.strong_credit_score}+.`
    };

    if (id === "emi_income_ratio") {
        return `Your estimated EMI would take up about ${Math.round(emiToIncomeRatio(applicant) * 100)}% of your monthly income, above this bank's comfort limit of ${Math.round(config.max_emi_ratio * 100)}%.`;
    }

    if (id === "min_income") {
        return `Your monthly income (Rs. ${applicant.monthly_income.toLocaleString("en-IN")}) is below this bank's minimum requirement of Rs. ${config.min_income.toLocaleString("en-IN")}.`;
    }

    return messages[id] || "A rule check did not pass.";
}

function round2(number: number): number {
    return Math.round((number + Number.EPSILON) * 100) / 100;
}

function calculateEmiPlan(applicant: Applicant, config: BankConfig) {
    const principal = applicant.requested_loan_amount;
    const tenure = Math.max(applicant.loan_tenure_months, 1);
    const loanType = applicant.loan_type || "personal";
    const annualRate = config.interest_rates[loanType] ?? config.interest_rates.personal;
    const monthlyRate = annualRate / 12 / 100;
    const factor = Math.pow(1 + monthlyRate, tenure);
    const emi = monthlyRate === 0 ? principal / tenure : (principal * monthlyRate * factor) / (factor - 1);
    const totalPayment = emi * tenure;

    return {
        loan_type: loanType,
        principal: round2(principal),
        annual_interest_rate: annualRate,
        tenure_months: tenure,
        monthly_emi: round2(emi),
        total_interest: round2(totalPayment - principal),
        total_payment: round2(totalPayment)
    };
}

export function evaluateBank(applicant: Applicant, config: BankConfig) {
    const rules = buildRules(config).map(rule => ({
        id: rule.id,
        description: rule.description,
        passed: Boolean(rule.check(applicant)),
        severity: rule.severity,
        weight: rule.weight
    }));

    const hardFailures = rules.filter(rule => rule.severity === "hard" && !rule.passed);
    const softFailures = rules.filter(rule => rule.severity === "soft" && !rule.passed);
    const penalty = softFailures.reduce((sum, rule) => sum + rule.weight, 0);

    let decision: string;
    let confidence: number;
    const reasons: Array<{ text: string; fail: boolean }> = [];

    if (hardFailures.length) {
        reasons.push(
            ...hardFailures.map(rule => ({
                text: `Failed mandatory rule: ${rule.description}`,
                fail: true
            }))
        );
        decision = "REJECT";
        confidence = 1;
    } else {
        if (softFailures.length) {
            reasons.push(
                ...softFailures.map(rule => ({
                    text: `Risk factor: ${rule.description} (weight ${rule.weight})`,
                    fail: true
                }))
            );
        } else {
            reasons.push({
                text: "Applicant satisfies all rules, hard and soft.",
                fail: false
            });
        }

        if (penalty <= 1) {
            decision = "APPROVE";
            confidence = 0.95 - 0.05 * penalty;
        } else if (penalty >= 5) {
            decision = "REJECT";
            confidence = 0.6 + 0.05 * Math.min(penalty - 5, 5);
            reasons.push({
                text: "Cumulative risk factors exceed acceptable threshold.",
                fail: true
            });
        } else {
            decision = "MANUAL_REVIEW";
            confidence = 0.5;
            reasons.push({
                text: "Mixed risk profile. Human underwriter review is required.",
                fail: false
            });
        }
    }

    const failedRules = rules.filter(rule => !rule.passed);

    return {
        bank: config.name,
        logo_initials: config.logo_initials,
        logo_color: config.logo_color,
        decision,
        confidence: round2(Math.min(Math.max(confidence, 0), 1)),
        reasons,
        friendly_reasons: failedRules.map(rule => friendlyReason(rule.id, applicant, config)),
        rules: rules.map(({ id, description, passed, severity }) => ({
            id,
            description,
            passed,
            severity
        })),
        emi_plan: decision === "APPROVE" ? calculateEmiPlan(applicant, config) : null
    };
}

export function normalizeApplicant(body: any): Applicant {
    const applicant: Applicant = {
        name: String(body.name || "Applicant").trim().slice(0, 120),
        age: Number(body.age),
        employment_type: String(body.employment_type || ""),
        monthly_income: Number(body.monthly_income),
        existing_emi: Number(body.existing_emi || 0),
        requested_loan_amount: Number(body.requested_loan_amount),
        loan_type: String(body.loan_type || "personal"),
        loan_tenure_months: Number(body.loan_tenure_months),
        credit_score: Number(body.credit_score),
        employment_years: Number(body.employment_years || 0),
        existing_defaults: Number(body.existing_defaults || 0)
    };

    const numericFields = [
        "age",
        "monthly_income",
        "existing_emi",
        "requested_loan_amount",
        "loan_tenure_months",
        "credit_score",
        "employment_years",
        "existing_defaults"
    ];

    if (numericFields.some(key => !Number.isFinite((applicant as any)[key]))) {
        throw new Error("Please provide valid numeric values for all applicant fields.");
    }

    if (
        applicant.age < 18 ||
        applicant.monthly_income <= 0 ||
        applicant.existing_emi < 0 ||
        applicant.requested_loan_amount <= 0 ||
        applicant.loan_tenure_months < 1 ||
        applicant.credit_score < 300 ||
        applicant.credit_score > 900 ||
        applicant.employment_years < 0 ||
        applicant.existing_defaults < 0
    ) {
        throw new Error("One or more values are outside the allowed range. Check age, income, loan amount, tenure, CIBIL score (300–900), and other values.");
    }

    if (!["salaried", "self-employed", "unemployed"].includes(applicant.employment_type)) {
        throw new Error("Choose a valid employment type.");
    }

    if (!["personal", "home", "car", "education"].includes(applicant.loan_type)) {
        throw new Error("Choose a valid loan type.");
    }

    return applicant;
}

module.exports = { evaluateBank, normalizeApplicant };
