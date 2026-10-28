import { Router } from "express";
import { policyMatrixService } from "../../services/settings/policyMatrixService";
import { authorizePermission } from "../../utils/permissionMiddleware";
import { sendApiResponse, getOkResponse } from "../../utils/apiResponse";

export const matrixRouter = Router();

matrixRouter.get("/", authorizePermission("settings_read"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const result = await policyMatrixService.listRules(req.query);
        return getOkResponse(result.items, result.totalCount, "Policy matrix rules retrieved");
    });
});

matrixRouter.post("/", authorizePermission("settings_write"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const created = await policyMatrixService.addRule(req.body);
        return getOkResponse(created, 1, "Policy matrix rule added successfully");
    });
});

matrixRouter.put("/:id", authorizePermission("settings_write"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const id = Number(req.params.id);
        const updated = await policyMatrixService.updateRule(id, req.body);
        return getOkResponse(updated, 1, "Policy matrix rule updated successfully");
    });
});

matrixRouter.delete("/:id", authorizePermission("settings_write"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const id = Number(req.params.id);
        const result = await policyMatrixService.deleteRule(id);
        return getOkResponse(result, 1, "Policy matrix rule deleted successfully");
    });
});
