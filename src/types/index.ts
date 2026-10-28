import { Request } from "express";

export interface ApiResponseEnvelope<T = any> {
    error: boolean;
    status: number;
    message: string;
    data: T;
}

export interface AuthenticatedStaff {
    id: number;
    email: string;
    name: string;
    roleId?: number;
    roleName?: string;
    permissions: string[];
    sessionKey: string;
}

export interface AuthenticatedCustomer {
    id: number;
    phone: string;
    email?: string;
    name?: string;
    leadId?: number;
}

export interface CustomRequest extends Request {
    correlationId?: string;
    staffUser?: AuthenticatedStaff;
    customerUser?: AuthenticatedCustomer;
    sessionKey?: string;
    isEncryptedPayload?: boolean;
}
