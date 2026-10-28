import { Response, NextFunction } from "express";
import { ApiResponseEnvelope, CustomRequest } from "../types";

export function getOkResponse<T = any>(
    data: T,
    count: number = 0,
    message: string = "Operation successful"
): ApiResponseEnvelope<T> {
    return {
        error: false,
        status: 200,
        message,
        data: count !== undefined && typeof data === "object" && !Array.isArray(data) && data !== null
            ? { ...data, count }
            : data
    };
}

export function getPaginationResponse<T = any>(
    items: T[],
    totalCount: number,
    page: number = 1,
    limit: number = 20,
    message: string = "Records retrieved successfully"
): ApiResponseEnvelope<{ items: T[]; totalCount: number; page: number; limit: number; totalPages: number }> {
    return {
        error: false,
        status: 200,
        message,
        data: {
            items,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit) || 1
        }
    };
}

export function getErrorResponse(
    message: string,
    status: number = 400,
    data: any = null
): ApiResponseEnvelope<any> {
    return {
        error: true,
        status,
        message,
        data
    };
}

/**
 * Standard controller response wrapper:
 * sendApiResponse(req, res, next, async () => serviceCall)
 */
export async function sendApiResponse(
    _req: CustomRequest,
    res: Response,
    next: NextFunction,
    handler: () => Promise<ApiResponseEnvelope<any>>
): Promise<void> {
    try {
        const response = await handler();
        res.status(response.status || 200).json(response);
    } catch (err) {
        next(err);
    }
}
