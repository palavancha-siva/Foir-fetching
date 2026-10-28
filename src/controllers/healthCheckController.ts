import { Router } from "express";
import db from "../utils/dbUtil";
import { sendApiResponse, getOkResponse } from "../utils/apiResponse";

export const healthCheckRouter = Router();

healthCheckRouter.get("/check", (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        let dbStatus = "healthy";
        try {
            await db.raw("SELECT 1");
        } catch (_err) {
            dbStatus = "unreachable";
        }

        return getOkResponse({
            service: "fin_crm_app",
            status: "OK",
            port: 5104,
            database: dbStatus,
            timestamp: new Date().toISOString()
        }, 1, "Health check OK");
    });
});
