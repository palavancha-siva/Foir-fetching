import { Response, NextFunction } from "express";
import options from "../../config/options";
import { CustomRequest } from "../types";
import { getErrorResponse } from "./apiResponse";

export function internalAuthProtected(req: CustomRequest, res: Response, next: NextFunction): void {
    const internalKey = req.headers["x-internal-key"];

    if (!internalKey || internalKey !== options.internalApiKey) {
        res.status(401).json(getErrorResponse("Unauthorized internal service access. Valid x-internal-key required.", 401));
        return;
    }

    next();
}
