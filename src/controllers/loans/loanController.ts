import { Router } from "express";
import { loanEligibilityService } from "../../services/loans/loanEligibilityService";
import { calculateFoirSchema } from "../../schemas/loans/loanSchema";
import { validateSchema } from "../../utils/validateSchema";
import { sendApiResponse, getOkResponse } from "../../utils/apiResponse";

export const loanRouter = Router();

loanRouter.post("/calculate-foir", validateSchema(calculateFoirSchema, "BODY"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const result = await loanEligibilityService.evaluateEligibility(req.body);
        return getOkResponse(result, 1, "FOIR calculated successfully");
    });
});

loanRouter.get("/dynamic-foir", (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const category = String(req.query.category || "");
        const salary = Number(req.query.salary || 0);
        const bankName = String(req.query.bankName || "ALL");
        const result = await loanEligibilityService.getDynamicFoir(category, salary, bankName);
        return getOkResponse(result, 1, "Dynamic FOIR fetched successfully");
    });
});
