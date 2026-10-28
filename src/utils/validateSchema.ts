import { Response, NextFunction } from "express";
import { CustomRequest } from "../types";
import { getErrorResponse } from "./apiResponse";

export type ValidationTarget = "BODY" | "QUERY" | "PARAMS";

export interface SchemaValidator {
    validate: (data: any) => { error?: { message: string; details?: any }; value?: any };
}

export function validateSchema(
    schema: SchemaValidator | ((data: any) => { error?: { message: string } | null; value?: any }),
    target: ValidationTarget = "BODY"
) {
    return (req: CustomRequest, res: Response, next: NextFunction): void => {
        let dataToValidate: any;
        switch (target) {
            case "QUERY":
                dataToValidate = req.query;
                break;
            case "PARAMS":
                dataToValidate = req.params;
                break;
            case "BODY":
            default:
                dataToValidate = req.body;
                break;
        }

        let result: { error?: { message: string } | null; value?: any };
        if (typeof schema === "function") {
            result = schema(dataToValidate);
        } else if (schema && typeof schema.validate === "function") {
            result = schema.validate(dataToValidate);
        } else {
            return next();
        }

        if (result.error) {
            res.status(400).json(getErrorResponse(`Validation error in ${target}: ${result.error.message}`, 400));
            return;
        }

        // Assign sanitized value back
        if (result.value !== undefined) {
            if (target === "BODY") req.body = result.value;
        }

        next();
    };
}
