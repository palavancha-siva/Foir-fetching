import { Router } from "express";
import { loanEligibilityService } from "../../services/loans/loanEligibilityService";
import { portalEligibilitySchema } from "../../schemas/portal/portalSchema";
import { validateSchema } from "../../utils/validateSchema";
import { sendApiResponse, getOkResponse } from "../../utils/apiResponse";

export const portalRouter = Router();

portalRouter.post("/eligibility", validateSchema(portalEligibilitySchema, "BODY"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const result = await loanEligibilityService.evaluateEligibility({
            income: Number(req.body.salary),
            annualRate: Number(req.body.annualRate || 10.5),
            months: Number(req.body.tenureMonths || 60),
            companyName: req.body.companyName,
            loans: req.body.loans || [],
            creditCards: req.body.creditCards || []
        });
        return getOkResponse(result, 1, "Portal loan eligibility evaluated successfully");
    });
});
