import db from "../../utils/dbUtil";
import { calculateFoir, CalculateFoirInput } from "../../helpers/foirCalculator";
import { companyService } from "./companyService";

export class LoanEligibilityService {
    async evaluateEligibility(payload: {
        income: number;
        annualRate: number;
        months: number;
        companyName?: string;
        loans?: Array<{ monthlyEmi: number; balanceTransfer?: boolean }>;
        creditCards?: Array<{ outstanding: number; bankName?: string }>;
    }) {
        const { income, annualRate, months, companyName, loans = [], creditCards = [] } = payload;

        let lenderMappings: any[] = [];
        if (companyName) {
            lenderMappings = await companyService.getCompanyMappings(companyName);
        }

        // If no lender mappings exist for company, query default bank configurations
        if (lenderMappings.length === 0) {
            lenderMappings = [
                { bankName: "HDFC Bank", category: "CAT A", foir: 70, ccObligationPercent: 2 },
                { bankName: "ICICI Bank", category: "CAT B", foir: 65, ccObligationPercent: 2 },
                { bankName: "Axis Bank", category: "CAT C", foir: 60, ccObligationPercent: 2 },
                { bankName: "Kotak Mahindra Bank", category: "DEFAULT", foir: 60, ccObligationPercent: 2 }
            ];
        }

        const calculation = calculateFoir({
            income,
            annualRate,
            months,
            loans,
            creditCards,
            lenderMappings
        });

        return calculation;
    }

    async getDynamicFoir(category: string, salary: number, bankName: string = "ALL") {
        const sal = Number(salary) || 0;
        const cat = String(category || "").trim();

        const row = await db("bank_policy_matrix")
            .where("active", 1)
            .andWhere(function () {
                this.whereRaw("LOWER(TRIM(category)) = LOWER(TRIM(?))", [cat])
                    .orWhereRaw("REPLACE(REPLACE(LOWER(TRIM(category)), ' ', ''), '-', '') = REPLACE(REPLACE(LOWER(TRIM(?)), ' ', ''), '-', '')", [cat])
                    .orWhereRaw("LOWER(TRIM(category)) = 'default'");
            })
            .andWhere("min_salary", "<=", sal)
            .andWhere("max_salary", ">", sal)
            .orderByRaw(`
                CASE 
                    WHEN LOWER(TRIM(category)) = LOWER(TRIM(?)) THEN 0 
                    WHEN REPLACE(REPLACE(LOWER(TRIM(category)), ' ', ''), '-', '') = REPLACE(REPLACE(LOWER(TRIM(?)), ' ', ''), '-', '') THEN 1
                    ELSE 2 
                END,
                CASE WHEN LOWER(TRIM(bank_name)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END,
                min_salary DESC
            `, [cat, cat, bankName])
            .first();

        if (row) {
            const minK = Math.round(Number(row.min_salary) / 1000);
            const maxK = Math.round(Number(row.max_salary) / 1000);
            const salarySlab = minK === 0 ? `< ${maxK}K` : (Number(row.max_salary) > 10000000 ? `> ${minK}K` : `${minK}K – ${maxK}K`);

            return {
                foir: Number(row.foir_percent),
                salarySlab,
                multiplier: Number(row.multiplier || 0),
                category: row.category
            };
        }

        return {
            foir: 70,
            salarySlab: "Standard",
            multiplier: 0,
            category: cat || "DEFAULT"
        };
    }
}

export const loanEligibilityService = new LoanEligibilityService();
