"use strict";

const express = require("express");
const rawConfig = require("../../config/configOptions");
const configOptions = rawConfig.default || rawConfig;
const createApplicationController = require("../controllers/applicationController");
const createCompanyController = require("../controllers/companyController");
const createFoirController = require("../controllers/foirController");
const createMasterDataController = require("../controllers/masterDataController");
const createBreController = require("../controllers/breController");
const createSystemController = require("../controllers/systemController");
const createPincodeController = require("../controllers/pincodeController");
const createAdminApiAuth = require("../middleware/adminApiAuth");

function createApiRouter(state: any) {
    const router = express.Router();
    const applicationController = createApplicationController({
        getPool: () => state.pool,
        memoryStore: state.memoryStore,
        bankConfigs: state.BANK_CONFIGS
    });
    const companyController = createCompanyController({
        getPool: () => state.pool
    });
    const masterDataController = createMasterDataController({
        getPool: () => state.pool
    });
    const breController = createBreController({
        getPool: () => state.pool
    });
    const pincodeController = createPincodeController({
        getPool: () => state.pool
    });
    const adminApiAuth = createAdminApiAuth(
        () => state.adminApiToken
    );
    const foirController = createFoirController({
        getPool: () => state.pool
    });
    const systemController = createSystemController({
        get pool() { return state.pool; },
        bankConfigs: state.BANK_CONFIGS
    });

    router.get(
        configOptions.apiPrefix + "/health",
        systemController.health
    );
    router.get(
        configOptions.apiPrefix + "/pincode/lookup",
        pincodeController.lookup
    );
    router.get(
        configOptions.apiPrefix + "/pincode/stats",
        pincodeController.stats
    );
    router.post(
        configOptions.apiPrefix + "/admin/pincodes/upload",
        adminApiAuth,
        pincodeController.upload
    );
    router.get(
        configOptions.apiPrefix + "/companies",
        companyController.search
    );
    router.get(
        configOptions.apiPrefix + "/categories",
        companyController.categories
    );
    router.get(
        configOptions.apiPrefix + "/company-mappings",
        companyController.mappings
    );
    router.get(
        configOptions.apiPrefix + "/company-mapping",
        companyController.mapping
    );
    router.get(
        configOptions.apiPrefix + "/bre/resolve",
        breController.resolveRule
    );
    router.post(
        configOptions.apiPrefix + "/foir/calculate",
        foirController.calculate
    );
    router.post(
        configOptions.apiPrefix + "/foir/calculate-emi",
        foirController.calculateEmi
    );
    router.get(
        configOptions.apiPrefix + "/admin/companies",
        adminApiAuth,
        masterDataController.listCompanies
    );
    router.get(
        configOptions.apiPrefix + "/admin/companies/:companyId/mappings",
        adminApiAuth,
        masterDataController.listCompanyMappings
    );
    router.post(
        configOptions.apiPrefix + "/admin/companies/:companyId/mappings",
        adminApiAuth,
        masterDataController.addBankMapping
    );
    router.put(
        configOptions.apiPrefix + "/admin/companies/:companyId/mappings/:mappingId",
        adminApiAuth,
        masterDataController.updateBankMapping
    );
    router.delete(
        configOptions.apiPrefix + "/admin/companies/:companyId/mappings/:mappingId",
        adminApiAuth,
        masterDataController.deleteBankMapping
    );
    router.post(
        configOptions.apiPrefix + "/admin/companies",
        adminApiAuth,
        masterDataController.addCompany
    );
    router.put(
        configOptions.apiPrefix + "/admin/companies/:id",
        adminApiAuth,
        masterDataController.updateCompany
    );
    router.delete(
        configOptions.apiPrefix + "/admin/companies/:id",
        adminApiAuth,
        masterDataController.deleteCompany
    );
    router.get(
        configOptions.apiPrefix + "/admin/categories",
        adminApiAuth,
        masterDataController.listCategories
    );
    router.post(
        configOptions.apiPrefix + "/admin/categories",
        adminApiAuth,
        masterDataController.addCategory
    );
    router.put(
        configOptions.apiPrefix + "/admin/categories/:id",
        adminApiAuth,
        masterDataController.updateCategory
    );
    router.delete(
        configOptions.apiPrefix + "/admin/categories/:id",
        adminApiAuth,
        masterDataController.deleteCategory
    );
    router.get(
        configOptions.apiPrefix + "/admin/banks",
        adminApiAuth,
        masterDataController.listBanks
    );
    router.post(
        configOptions.apiPrefix + "/admin/banks",
        adminApiAuth,
        masterDataController.addBank
    );
    router.put(
        configOptions.apiPrefix + "/admin/banks/:id",
        adminApiAuth,
        masterDataController.updateBank
    );
    router.delete(
        configOptions.apiPrefix + "/admin/banks/:id",
        adminApiAuth,
        masterDataController.deleteBank
    );
    router.get(
        configOptions.apiPrefix + "/admin/banks/:bankName/mappings",
        adminApiAuth,
        masterDataController.listBankMappings
    );
    router.post(
        configOptions.apiPrefix + "/admin/banks/:bankName/mappings",
        adminApiAuth,
        masterDataController.addCompanyToBank
    );
    router.put(
        configOptions.apiPrefix + "/admin/banks/:bankName/mappings/:mappingId",
        adminApiAuth,
        masterDataController.updateBankMappingDirect
    );
    router.delete(
        configOptions.apiPrefix + "/admin/banks/:bankName/mappings/:mappingId",
        adminApiAuth,
        masterDataController.deleteBankMappingDirect
    );
    router.post(
        configOptions.apiPrefix + "/admin/mappings/upload",
        adminApiAuth,
        masterDataController.uploadMappings
    );
    router.get(
        configOptions.apiPrefix + "/admin/matrix",
        adminApiAuth,
        masterDataController.listMatrix
    );
    router.post(
        configOptions.apiPrefix + "/admin/matrix",
        adminApiAuth,
        masterDataController.addMatrixRule
    );
    router.put(
        configOptions.apiPrefix + "/admin/matrix/:id",
        adminApiAuth,
        masterDataController.updateMatrixRule
    );
    router.delete(
        configOptions.apiPrefix + "/admin/matrix/:id",
        adminApiAuth,
        masterDataController.deleteMatrixRule
    );
    router.post(
        configOptions.apiPrefix + "/admin/matrix/upload",
        adminApiAuth,
        masterDataController.uploadMatrixRules
    );
    router.get(
        configOptions.apiPrefix + "/admin/bre/rules",
        adminApiAuth,
        breController.listRules
    );
    router.post(
        configOptions.apiPrefix + "/admin/bre/rules",
        adminApiAuth,
        breController.createRule
    );
    router.put(
        configOptions.apiPrefix + "/admin/bre/rules/:id",
        adminApiAuth,
        breController.updateRule
    );
    router.patch(
        configOptions.apiPrefix + "/admin/bre/rules/:id/status",
        adminApiAuth,
        breController.toggleStatus
    );
    router.delete(
        configOptions.apiPrefix + "/admin/bre/rules/:id",
        adminApiAuth,
        breController.deleteRule
    );
    router.post(
        configOptions.apiPrefix + "/admin/bre/rules/upload",
        adminApiAuth,
        breController.uploadRules
    );
    router.get("/banks", systemController.banks);
    router.post("/evaluate", applicationController.evaluate);
    router.get("/history", applicationController.history);

    return router;
}

module.exports = createApiRouter;
export default createApiRouter;