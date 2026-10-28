import { Response, NextFunction } from "express";
import crypto from "crypto";
import { CustomRequest } from "../types";

export function correlationMiddleware(req: CustomRequest, res: Response, next: NextFunction): void {
    const headerValue = req.headers["x-correlation-id"];
    const correlationId = (Array.isArray(headerValue) ? headerValue[0] : headerValue) || crypto.randomUUID();

    req.correlationId = correlationId;
    res.setHeader("x-correlation-id", correlationId);
    next();
}
