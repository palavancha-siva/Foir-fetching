import { Response, NextFunction } from "express";
import { CustomRequest } from "../types";
import { getErrorResponse } from "./apiResponse";
import { mapDbErrorMessage } from "./dbErrorMessages";
import { logger } from "./logger";

export function errorHandler(
    err: any,
    req: CustomRequest,
    res: Response,
    _next: NextFunction
): void {
    const { message, status } = mapDbErrorMessage(err);

    logger.error(`Error processing request: ${err.message}`, {
        correlationId: req.correlationId,
        status,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });

    const envelope = getErrorResponse(
        message,
        status,
        process.env.NODE_ENV === "development" ? { stack: err.stack, details: err.details } : null
    );

    res.status(status).json(envelope);
}
