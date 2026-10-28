import { Knex } from "knex";
import { db as defaultDb } from "../utils/dbUtil";
import { evaluateBank, normalizeApplicant, Applicant } from "../helpers/loanEligibility";

function getKnex(dbOrPool?: any): Knex | null {
    if (dbOrPool && typeof dbOrPool === "function" && typeof dbOrPool.select === "function") {
        return dbOrPool as Knex;
    }
    if (dbOrPool) {
        return defaultDb;
    }
    if (dbOrPool === undefined) {
        return defaultDb;
    }
    return null;
}

export function evaluateApplication(body: any, state: any) {
    const applicant = normalizeApplicant(body);
    const results = state.bankConfigs.map((config: any) => evaluateBank(applicant, config));

    if (!state.getPool()) {
        const applicationId = state.memoryStore.applications.length + 1;
        const createdAt = new Date().toISOString();

        state.memoryStore.applications.push({
            id: applicationId,
            created_at: createdAt,
            ...applicant
        });

        for (const result of results) {
            state.memoryStore.decisions.push({
                application_id: applicationId,
                bank: result.bank,
                decision: result.decision,
                confidence: result.confidence,
                emi_monthly: result.emi_plan ? result.emi_plan.monthly_emi : null,
                created_at: createdAt
            });
        }

        return {
            banks: results,
            application_id: applicationId,
            created_at: createdAt,
            mode: "demo"
        };
    }

    return persistEvaluation(applicant, results, state.getPool());
}

async function persistEvaluation(applicant: Applicant, results: any[], dbOrPool: any) {
    const k = getKnex(dbOrPool);
    if (!k) {
        throw new Error("Database connection required to persist application.");
    }

    return await k.transaction(async (trx) => {
        const [inserted] = await trx("applications")
            .insert({
                name: applicant.name,
                age: applicant.age,
                employment_type: applicant.employment_type,
                monthly_income: applicant.monthly_income,
                existing_emi: applicant.existing_emi,
                requested_loan_amount: applicant.requested_loan_amount,
                loan_type: applicant.loan_type,
                loan_tenure_months: applicant.loan_tenure_months,
                credit_score: applicant.credit_score,
                employment_years: applicant.employment_years,
                existing_defaults: applicant.existing_defaults
            })
            .returning(["id", "created_at"]);

        const applicationId = inserted.id;

        const decisionRows = results.map((result) => ({
            application_id: applicationId,
            bank: result.bank,
            decision: result.decision,
            confidence: result.confidence,
            emi_monthly: result.emi_plan ? result.emi_plan.monthly_emi : null
        }));

        if (decisionRows.length > 0) {
            await trx("bank_decisions").insert(decisionRows);
        }

        return {
            banks: results,
            application_id: applicationId,
            created_at: inserted.created_at,
            mode: "postgresql"
        };
    });
}

export async function getApplicationHistory(state: any) {
    if (!state.getPool()) {
        const history = state.memoryStore.applications
            .slice()
            .reverse()
            .slice(0, 50)
            .map((application: any) => ({
                ...application,
                decisions: state.memoryStore.decisions
                    .filter((decision: any) => decision.application_id === application.id)
                    .map(mapDecision)
            }));

        return { history, mode: "demo" };
    }

    const k = getKnex(state.getPool());
    if (!k) {
        return { history: [], mode: "demo" };
    }

    const applications = await k("applications")
        .select("*")
        .orderBy("id", "desc")
        .limit(50);

    if (applications.length === 0) {
        return { history: [], mode: "postgresql" };
    }

    const applicationIds = applications.map((app: any) => app.id);
    const decisions = await k("bank_decisions")
        .select("application_id", "bank", "decision", "confidence", "emi_monthly")
        .whereIn("application_id", applicationIds)
        .orderBy("id", "asc");

    const byApplication = new Map<string, any[]>();
    for (const decision of decisions) {
        const key = String(decision.application_id);
        if (!byApplication.has(key)) byApplication.set(key, []);
        byApplication.get(key)!.push(mapDecision(decision));
    }

    return {
        history: applications.map((application: any) => ({
            ...application,
            decisions: byApplication.get(String(application.id)) || []
        })),
        mode: "postgresql"
    };
}

function mapDecision(decision: any) {
    return {
        bank: decision.bank,
        decision: decision.decision,
        confidence: Number(decision.confidence),
        emi_monthly: decision.emi_monthly === null
            ? null
            : Number(decision.emi_monthly)
    };
}

module.exports = { evaluateApplication, getApplicationHistory };
