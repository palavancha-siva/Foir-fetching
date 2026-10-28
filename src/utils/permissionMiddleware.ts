import { Response, NextFunction } from "express";
import { CustomRequest } from "../types";
import { getErrorResponse } from "./apiResponse";

export function authorizePermission(permission: string) {
    return (req: CustomRequest, res: Response, next: NextFunction): void => {
        const staff = req.staffUser;
        if (!staff) {
            res.status(401).json(getErrorResponse("Unauthorized staff access.", 401));
            return;
        }

        const perms = staff.permissions || [];
        if (perms.includes("*") || perms.includes("admin") || perms.includes(permission)) {
            return next();
        }

        res.status(403).json(getErrorResponse(`Access denied. Missing required permission: ${permission}`, 403));
    };
}

export function authorizeAnyPermission(permissions: string[]) {
    return (req: CustomRequest, res: Response, next: NextFunction): void => {
        const staff = req.staffUser;
        if (!staff) {
            res.status(401).json(getErrorResponse("Unauthorized staff access.", 401));
            return;
        }

        const perms = staff.permissions || [];
        if (perms.includes("*") || perms.includes("admin") || permissions.some(p => perms.includes(p))) {
            return next();
        }

        res.status(403).json(getErrorResponse(`Access denied. Requires one of permissions: ${permissions.join(", ")}`, 403));
    };
}

export function authorizeAdminAccess() {
    return authorizeAnyPermission(["admin", "manage_settings", "manage_staff", "*"]);
}

export function authorizeSuperAdmin() {
    return (req: CustomRequest, res: Response, next: NextFunction): void => {
        const staff = req.staffUser;
        if (!staff) {
            res.status(401).json(getErrorResponse("Unauthorized access.", 401));
            return;
        }

        if ((staff.permissions || []).includes("*")) {
            return next();
        }

        res.status(403).json(getErrorResponse("Access denied. SuperAdmin privilege required.", 403));
    };
}
