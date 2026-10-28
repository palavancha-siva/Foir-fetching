import { Response, NextFunction } from "express";
import { CustomRequest } from "../types";

export const logger = {
    info(msg: string, meta: any = {}): void {
        console.log(`[INFO] ${new Date().toISOString()} ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : "");
    },
    warn(msg: string, meta: any = {}): void {
        console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : "");
    },
    error(msg: string, meta: any = {}): void {
        console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : "");
    }
};

export function requestInfo(req: CustomRequest, _res: Response, next: NextFunction): void {
    const startTime = Date.now();
    logger.info(`--> ${req.method} ${req.originalUrl || req.url}`, {
        correlationId: req.correlationId,
        ip: req.ip
    });

    _res.on("finish", () => {
        const durationMs = Date.now() - startTime;
        logger.info(`<-- ${req.method} ${req.originalUrl || req.url} ${_res.statusCode} (${durationMs}ms)`, {
            correlationId: req.correlationId,
            status: _res.statusCode
        });
    });

    _res.on("close", () => {
        if (!_res.writableEnded) {
            const durationMs = Date.now() - startTime;
            logger.warn(`<!- ${req.method} ${req.originalUrl || req.url} connection closed prematurely after ${durationMs}ms`, {
                correlationId: req.correlationId
            });
        }
    });

    next();
}
