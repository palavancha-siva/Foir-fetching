// @ts-nocheck
"use strict";

const breService = require("../services/breService");

function createBreController(state) {
    async function execute(req, res, operation) {
        const pool = state.getPool();
        if (!pool) {
            return res.status(503).json({
                success: false,
                message: "PostgreSQL database connection is not available."
            });
        }

        try {
            return await operation(pool);
        } catch (error) {
            if (error instanceof breService.BreRuleError) {
                return res.status(error.statusCode || 400).json({
                    success: false,
                    message: error.message
                });
            }
            console.error("BRE controller error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "A database error occurred while processing the BRE rule."
            });
        }
    }

    return {
        listRules(req, res) {
            const bank = String(req.query.bank || "").trim();
            return execute(req, res, async pool => {
                const rules = await breService.listRulesByBank(bank, pool);
                return res.json(rules);
            });
        },

        createRule(req, res) {
            return execute(req, res, async pool => {
                const rule = await breService.createRule(req.body || {}, pool);
                return res.status(201).json({
                    success: true,
                    message: `Rule "${rule.rule_name}" created successfully.`,
                    rule
                });
            });
        },

        updateRule(req, res) {
            const id = req.params.id;
            return execute(req, res, async pool => {
                const rule = await breService.updateRule(id, req.body || {}, pool);
                return res.json({
                    success: true,
                    message: `Rule "${rule.rule_name}" updated successfully.`,
                    rule
                });
            });
        },

        toggleStatus(req, res) {
            const id = req.params.id;
            const active = Boolean(req.body && req.body.active);
            return execute(req, res, async pool => {
                const rule = await breService.toggleRuleStatus(id, active, pool);
                return res.json({
                    success: true,
                    message: `Rule "${rule.rule_name}" is now ${rule.active ? "Active" : "Inactive"}.`,
                    rule
                });
            });
        },

        deleteRule(req, res) {
            const id = req.params.id;
            return execute(req, res, async pool => {
                const result = await breService.deleteRule(id, pool);
                return res.json({
                    success: true,
                    message: result.message || "Rule deleted successfully."
                });
            });
        },

        uploadRules(req, res) {
            const csvContent = req.body && (req.body.csvContent || req.body.csv || req.body.fileContent);
            const defaultBank = req.body && req.body.defaultBank ? String(req.body.defaultBank).trim() : "";
            return execute(req, res, async pool => {
                const summary = await breService.bulkImportBreRules(csvContent, defaultBank, pool);
                return res.json({
                    success: true,
                    message: `Successfully processed ${summary.total} rules (${summary.inserted} added, ${summary.updated} updated) across ${summary.banks.length} banks.`,
                    summary
                });
            });
        },

        resolveRule(req, res) {
            const bank = String(req.query.bank || req.query.bank_name || "").trim();
            const category = String(req.query.category || req.query.cat || "ALL").trim();
            const salary = Number(req.query.salary || req.query.income || 0);
            const hasHomeLoan = req.query.hasHomeLoan === "true" || req.query.hasHomeLoan === "1" || req.query.hasHomeLoan === true;

            return execute(req, res, async pool => {
                let breResult = await breService.resolveBreFoir(bank, category, salary, { hasHomeLoan, dbOrPool: pool });
                if (!breResult) {
                    try {
                        const matrixService = require("../services/policyMatrixService");
                        const matrixResult = await matrixService.getDynamicFoirFromDb(category, salary, pool, bank);
                        if (matrixResult && matrixResult.foir) {
                            return res.json({
                                success: true,
                                matched: true,
                                source: "bank_policy_matrix",
                                bank,
                                category,
                                salary,
                                hasHomeLoan,
                                foir: Number(matrixResult.foir),
                                foir_percent: Number(matrixResult.foir),
                                rule_name: matrixResult.salarySlab || "Standard Policy"
                            });
                        }
                    } catch (_err) {}

                    return res.status(404).json({
                        success: false,
                        matched: false,
                        message: `No active policy rule found in database for bank "${bank}" and salary ${salary}.`
                    });
                }
                return res.json({
                    success: true,
                    matched: true,
                    bank,
                    category,
                    salary,
                    hasHomeLoan,
                    foir: breResult.foir_percent,
                    foir_percent: breResult.foir_percent,
                    rule_name: breResult.rule_name
                });
            });
        }
    };
}

module.exports = createBreController;
export default createBreController;
