import { BaseModel } from "../baseModel";

export class User extends BaseModel {
    static get tableName() {
        return "users";
    }

    phone!: string;
    email?: string;
    fullName!: string;
    pan?: string;
    aadhaarLast4?: string;
    dob?: string;
    active!: number;
}

export class UserAddress extends BaseModel {
    static get tableName() {
        return "user_addresses";
    }

    userId!: number;
    addressType!: "CURRENT" | "PERMANENT";
    addressLine1!: string;
    addressLine2?: string;
    city!: string;
    state!: string;
    pincode!: string;
}

export class UserEmploymentDetail extends BaseModel {
    static get tableName() {
        return "user_employment_details";
    }

    userId!: number;
    companyName!: string;
    employmentType!: string;
    monthlySalary!: number;
    experienceYears?: number;
}

export class UserKyc extends BaseModel {
    static get tableName() {
        return "user_kyc";
    }

    userId!: number;
    documentType!: string;
    documentNumber?: string;
    status!: "PENDING" | "VERIFIED" | "REJECTED";
    verifiedAt?: string;
}
