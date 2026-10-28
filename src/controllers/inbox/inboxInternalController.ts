import { Router } from "express";
import { staffService } from "../../services/staff/staffService";
import { sendApiResponse, getOkResponse } from "../../utils/apiResponse";

export const inboxInternalRouter = Router();

inboxInternalRouter.get("/staff-list", (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const staff = await staffService.listStaff(req.query);
        return getOkResponse(staff, staff.length, "Internal staff list for RM inbox retrieved");
    });
});
