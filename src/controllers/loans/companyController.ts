import { Router } from "express";
import { companyService } from "../../services/loans/companyService";
import { sendApiResponse, getOkResponse } from "../../utils/apiResponse";

export const companyRouter = Router();

companyRouter.get("/search", (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const query = String(req.query.q || req.query.query || "");
        const results = await companyService.searchCompanies(query);
        return getOkResponse(results, results.length, "Companies searched successfully");
    });
});

companyRouter.get("/categories", (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const query = String(req.query.q || "");
        const results = await companyService.listCategories(query);
        return getOkResponse(results, results.length, "Categories listed successfully");
    });
});

companyRouter.get("/mappings", (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const companyName = String(req.query.company || "");
        const results = await companyService.getCompanyMappings(companyName);
        return getOkResponse(results, results.length, "Company mappings fetched successfully");
    });
});
