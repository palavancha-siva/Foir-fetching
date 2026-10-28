import db from "../../utils/dbUtil";
import { parsePaginationParams } from "../../utils/filter";

export class PolicyMatrixService {
    async listRules(query: any = {}) {
        const { limit, offset, search, sortBy, sortOrder } = parsePaginationParams(query);
        const qb = db("bank_policy_matrix").where("active", 1);

        if (search) {
            qb.andWhere(function () {
                this.whereILike("category", `%${search}%`)
                    .orWhereILike("bank_name", `%${search}%`);
            });
        }

        const totalCount = await qb.clone().count("id as count").first();
        const rows = await qb.orderBy(sortBy === "id" ? "category" : sortBy, sortOrder).limit(limit).offset(offset);

        return {
            items: rows,
            totalCount: Number(totalCount?.count || 0)
        };
    }

    async addRule(ruleData: {
        category: string;
        min_salary: number;
        max_salary: number;
        foir_percent: number;
        multiplier?: number;
        tenure_months?: number;
        bank_name?: string;
    }) {
        const [inserted] = await db("bank_policy_matrix")
            .insert({
                category: ruleData.category.trim(),
                min_salary: Number(ruleData.min_salary),
                max_salary: Number(ruleData.max_salary),
                foir_percent: Number(ruleData.foir_percent),
                multiplier: Number(ruleData.multiplier || 0),
                tenure_months: Number(ruleData.tenure_months || 60),
                bank_name: (ruleData.bank_name || "STANDARD").trim(),
                active: 1
            })
            .returning("*");

        return inserted;
    }

    async updateRule(id: number, ruleData: any) {
        const [updated] = await db("bank_policy_matrix")
            .where({ id, active: 1 })
            .update({
                category: ruleData.category?.trim(),
                min_salary: ruleData.min_salary !== undefined ? Number(ruleData.min_salary) : undefined,
                max_salary: ruleData.max_salary !== undefined ? Number(ruleData.max_salary) : undefined,
                foir_percent: ruleData.foir_percent !== undefined ? Number(ruleData.foir_percent) : undefined,
                multiplier: ruleData.multiplier !== undefined ? Number(ruleData.multiplier) : undefined,
                tenure_months: ruleData.tenure_months !== undefined ? Number(ruleData.tenure_months) : undefined,
                bank_name: ruleData.bank_name !== undefined ? String(ruleData.bank_name).trim() : undefined
            })
            .returning("*");

        return updated;
    }

    async deleteRule(id: number) {
        await db("bank_policy_matrix")
            .where({ id })
            .update({ active: 0 });
        return { deleted: true, id };
    }
}

export const policyMatrixService = new PolicyMatrixService();
