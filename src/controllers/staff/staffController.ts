import { Router } from "express";
import { staffService } from "../../services/staff/staffService";
import { createStaffSchema } from "../../schemas/staff/staffSchema";
import { validateSchema } from "../../utils/validateSchema";
import { authorizePermission } from "../../utils/permissionMiddleware";
import { sendApiResponse, getOkResponse } from "../../utils/apiResponse";

export const staffRouter = Router();

staffRouter.get("/", authorizePermission("staff_read"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const staff = await staffService.listStaff(req.query);
        return getOkResponse(staff, staff.length, "Staff list retrieved successfully");
    });
});

staffRouter.post("/", authorizePermission("staff_write"), validateSchema(createStaffSchema, "BODY"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const staff = await staffService.createStaff(req.body);
        return getOkResponse(staff, 0, "Staff created successfully");
    });
});
