// @ts-nocheck
"use strict";

const companyService = require("../services/companyService");
const masterDataService = require("../services/masterDataService");
const policyMatrixService = require("../services/policyMatrixService");

function createMasterDataController(state) {
    async function execute(req, res, operation, conflictMessage) {
        const pool = state.getPool();
        if (!pool) {
            return res.status(503).json({
                success: false,
                message: "PostgreSQL is not connected."
            });
        }

        try {
            return await operation(pool);
        } catch (error) {
            if (error instanceof masterDataService.InvalidMasterDataInputError ||
                error instanceof policyMatrixService.PolicyMatrixError) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }
            if (error.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message: conflictMessage ||
                        "A record with that name already exists."
                });
            }
            if (error instanceof masterDataService.MasterDataNotFoundError) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            console.error("Master-data operation failed:", error.message);
            return res.status(500).json({
                success: false,
                message: "The master-data operation failed."
            });
        }
    }

    function getName(req, label) {
        return masterDataService.normalizeName(
            req.body && req.body.name,
            label
        );
    }

    return {
        listCompanies(req, res) {
            const search = String(req.query.search || "").trim();
            return execute(req, res, async pool => res.json(
                await companyService.listCompanies(search, pool)
            ));
        },

        listCategories(req, res) {
            const search = String(req.query.search || "").trim();
            return execute(req, res, async pool => res.json(
                await companyService.listCategories(search, pool)
            ));
        },

        listCompanyMappings(req, res) {
            return execute(req, res, async pool => res.json(
                await masterDataService.listCompanyMappings(
                    req.params.companyId,
                    pool
                )
            ));
        },

        addBankMapping(req, res) {
            return execute(req, res, async pool => {
                const mapping = await masterDataService.addBankMapping(
                    req.params.companyId,
                    req.body || {},
                    pool
                );
                return res.status(201).json({
                    success: true,
                    message: "Bank mapping added successfully.",
                    mapping
                });
            }, "This bank and category mapping already exists for the company.");
        },

        updateBankMapping(req, res) {
            return execute(req, res, async pool => {
                const mapping = await masterDataService.updateBankMapping(
                    req.params.companyId,
                    req.params.mappingId,
                    req.body || {},
                    pool
                );
                return res.json({
                    success: true,
                    message: "Bank mapping updated successfully.",
                    mapping
                });
            }, "This bank and category mapping already exists for the company.");
        },

        deleteBankMapping(req, res) {
            return execute(req, res, async pool => {
                await masterDataService.deleteBankMapping(
                    req.params.companyId,
                    req.params.mappingId,
                    pool
                );
                return res.json({
                    success: true,
                    message: "Bank mapping deleted successfully."
                });
            });
        },

        addCompany(req, res) {
            return execute(req, res, async pool => {
                const company = await masterDataService.addCompany(
                    getName(req, "Company name"),
                    pool
                );
                return res.status(201).json({
                    success: true,
                    message: "Company added successfully.",
                    company
                });
            });
        },

        updateCompany(req, res) {
            return execute(req, res, async pool => {
                const company = await masterDataService.updateCompany(
                    req.params.id,
                    getName(req, "Company name"),
                    pool
                );
                return res.json({
                    success: true,
                    message: "Company updated successfully.",
                    company
                });
            });
        },

        deleteCompany(req, res) {
            return execute(req, res, async pool => {
                await masterDataService.deleteCompany(req.params.id, pool);
                return res.json({
                    success: true,
                    message: "Company deleted successfully."
                });
            });
        },

        addCategory(req, res) {
            return execute(req, res, async pool => {
                const category = await masterDataService.addCategory(
                    getName(req, "Category name"),
                    pool
                );
                return res.status(201).json({
                    success: true,
                    message: "Category added successfully.",
                    category
                });
            });
        },

        updateCategory(req, res) {
            return execute(req, res, async pool => {
                const category = await masterDataService.updateCategory(
                    req.params.id,
                    getName(req, "Category name"),
                    pool
                );
                return res.json({
                    success: true,
                    message: "Category updated successfully.",
                    category
                });
            });
        },

        deleteCategory(req, res) {
            return execute(req, res, async pool => {
                await masterDataService.deleteCategory(req.params.id, pool);
                return res.json({
                    success: true,
                    message: "Category deleted successfully."
                });
            });
        },

        listBanks(req, res) {
            return execute(req, res, async pool => res.json(
                await masterDataService.listBanks(pool)
            ));
        },

        addBank(req, res) {
            return execute(req, res, async pool => {
                const bank = await masterDataService.addBank(
                    getName(req, "Bank name"),
                    pool
                );
                return res.status(201).json({
                    success: true,
                    message: "Bank added successfully.",
                    bank
                });
            }, "A bank with that name already exists.");
        },

        updateBank(req, res) {
            return execute(req, res, async pool => {
                const payload = req.body || {};
                const name = typeof payload === "string" ? payload : (payload.name || "");
                const foir = payload.foir !== undefined && payload.foir !== "" ? payload.foir : undefined;
                const ccObligation = payload.cc_obligation_percent !== undefined && payload.cc_obligation_percent !== "" ? payload.cc_obligation_percent : undefined;

                const bank = await masterDataService.updateBank(
                    req.params.id,
                    { name, foir, cc_obligation_percent: ccObligation },
                    pool
                );
                return res.json({
                    success: true,
                    message: "Bank and bank data updated successfully.",
                    bank
                });
            }, "A bank with that name already exists.");
        },

        deleteBank(req, res) {
            return execute(req, res, async pool => {
                await masterDataService.deleteBank(req.params.id, pool);
                return res.json({
                    success: true,
                    message: "Bank deleted successfully."
                });
            });
        },

        listBankMappings(req, res) {
            const bankName = decodeURIComponent(req.params.bankName || "");
            const search = String(req.query.search || "").trim();
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
            const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
            return execute(req, res, async pool => res.json(
                await masterDataService.listBankMappings(bankName, pool, { search, limit, offset })
            ));
        },

        addCompanyToBank(req, res) {
            const bankName = decodeURIComponent(req.params.bankName || "");
            return execute(req, res, async pool => {
                const mapping = await masterDataService.addCompanyToBankMapping(
                    bankName,
                    req.body || {},
                    pool
                );
                return res.status(201).json({
                    success: true,
                    message: "Company mapping added successfully.",
                    mapping
                });
            }, "This company and category mapping already exists for the bank.");
        },

        updateBankMappingDirect(req, res) {
            return execute(req, res, async pool => {
                const mapping = await masterDataService.updateBankMappingById(
                    req.params.mappingId,
                    req.body || {},
                    pool
                );
                return res.json({
                    success: true,
                    message: "Company mapping updated successfully.",
                    mapping
                });
            }, "This company and category mapping already exists for the bank.");
        },

        deleteBankMappingDirect(req, res) {
            return execute(req, res, async pool => {
                await masterDataService.deleteBankMappingById(
                    req.params.mappingId,
                    pool
                );
                return res.json({
                    success: true,
                    message: "Company mapping deleted successfully."
                });
            });
        },

        uploadMappings(req, res) {
            const csvContent = req.body && (req.body.csvContent || req.body.csv || req.body.fileContent);
            const defaultBank = req.body && req.body.defaultBank ? String(req.body.defaultBank).trim() : "";

            return execute(req, res, async pool => {
                const summary = await masterDataService.bulkImportMappings(
                    csvContent,
                    defaultBank,
                    pool
                );
                return res.status(200).json({
                    success: true,
                    message: `Successfully processed ${summary.total} mappings (${summary.inserted} added, ${summary.updated} updated) across ${summary.banks.length} banks.`,
                    summary
                });
            });
        },

        listMatrix(req, res) {
            const category = String(req.query.category || "").trim();
            const bank = String(req.query.bank || "").trim();
            return execute(req, res, async pool => res.json(
                await policyMatrixService.listMatrixRules(pool, { category, bank })
            ));
        },

        addMatrixRule(req, res) {
            return execute(req, res, async pool => {
                const rule = await policyMatrixService.addMatrixRule(req.body || {}, pool);
                return res.status(201).json({
                    success: true,
                    message: "Policy matrix rule added successfully.",
                    rule
                });
            });
        },

        updateMatrixRule(req, res) {
            return execute(req, res, async pool => {
                const rule = await policyMatrixService.updateMatrixRule(
                    req.params.id,
                    req.body || {},
                    pool
                );
                return res.json({
                    success: true,
                    message: "Policy matrix rule updated successfully.",
                    rule
                });
            });
        },

        deleteMatrixRule(req, res) {
            return execute(req, res, async pool => {
                await policyMatrixService.deleteMatrixRule(req.params.id, pool);
                return res.json({
                    success: true,
                    message: "Policy matrix rule deleted successfully."
                });
            });
        },

        uploadMatrixRules(req, res) {
            const csvContent = req.body && (req.body.csvContent || req.body.csv || req.body.fileContent);
            return execute(req, res, async pool => {
                const summary = await policyMatrixService.bulkImportMatrixRules(csvContent, pool);
                return res.json({
                    success: true,
                    message: `Successfully processed ${summary.total} rules (${summary.inserted} added, ${summary.updated} updated).`,
                    summary
                });
            });
        }
    };
}

module.exports = createMasterDataController;



