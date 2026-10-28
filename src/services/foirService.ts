import { calculateFoir, calculateSingleLenderEligibility } from "../helpers/foirCalculator";
import { getCompanyMappings } from "./companyService";
import { getDynamicFoirFromDb } from "./policyMatrixService";
import { resolveBreFoir } from "./breService";

export async function calculateEligibility(input: any, pool: any) {
    const result = await getCompanyMappings(input.companyName, pool);

    if (result.rows.length === 0) {
        return null;
    }

    const salary = Number(input.income ?? input.salary) || 0;
    const loans = Array.isArray(input.loans) ? input.loans : [];
    const hasHomeLoan = Boolean(
        input.hasHomeLoan ||
        loans.some((l: any) =>
            String(l.type || l.loanType || l.name || "").toLowerCase().includes("home")
        )
    );

    // Dynamically fetch FOIR % prioritizing bank BRE rules, falling back to bank_policy_matrix
    const dynamicMappings = await Promise.all(
        result.rows.map(async (row: any) => {
            let breResult: any = null;
            try {
                breResult = await resolveBreFoir(row.bank_name, row.cat, salary, { hasHomeLoan, dbOrPool: pool });
            } catch {
                // Ignore if bre_rules table has not been initialized
            }

            if (breResult) {
                return {
                    ...row,
                    foir: breResult.foir_percent,
                    salary_slab: breResult.rule_name,
                    multiplier: row.multiplier || 0
                };
            }

            const matrix = await getDynamicFoirFromDb(row.cat, salary, pool, row.bank_name);
            return {
                ...row,
                foir: matrix.foir,
                salary_slab: matrix.salarySlab,
                multiplier: matrix.multiplier
            };
        })
    );

    return calculateFoir({
        income: input.income,
        annualRate: input.annualRate,
        months: input.months,
        loans: input.loans,
        creditCards: input.creditCards,
        lenderMappings: dynamicMappings
    });
}

export async function calculateSingleEligibility(input: any, pool: any) {
    const salary = Number(input.income ?? input.salary) || 0;
    const lender = { ...input.selectedLender };
    const loans = Array.isArray(input.loans) ? input.loans : [];
    const hasHomeLoan = Boolean(
        input.hasHomeLoan ||
        loans.some((l: any) =>
            String(l.type || l.loanType || l.name || "").toLowerCase().includes("home")
        )
    );

    // Dynamically fetch FOIR % from BRE rules first, falling back to DB policy matrix
    if (pool && (lender.cat || lender.bank_name)) {
        let breResult: any = null;
        try {
            breResult = await resolveBreFoir(lender.bank_name, lender.cat || "ALL", salary, { hasHomeLoan, dbOrPool: pool });
        } catch {
            // Ignore if bre_rules table unavailable
        }

        if (breResult) {
            lender.foir = breResult.foir_percent;
            lender.salary_slab = breResult.rule_name;
        } else if (lender.cat) {
            const matrix = await getDynamicFoirFromDb(lender.cat, salary, pool, lender.bank_name);
            lender.foir = matrix.foir;
            lender.salary_slab = matrix.salarySlab;
            lender.multiplier = matrix.multiplier;
        }
    }

    return calculateSingleLenderEligibility({
        income: salary,
        annualRate: input.annualRate,
        months: input.months,
        selectedLender: lender,
        creditCardObligations: input.creditCardObligations || 0,
        existingEmiObligations: input.existingEmiObligations || 0,
        finalLoanAmount: input.finalLoanAmount,
        desiredLoanAmount: input.desiredLoanAmount
    });
}

module.exports = { calculateEligibility, calculateSingleEligibility };
