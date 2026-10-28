export const createUserSchema = {
    validate(data: any) {
        if (!data || typeof data !== "object") {
            return { error: { message: "User data is required." } };
        }
        if (!data.phone || String(data.phone).replace(/\D/g, "").length < 10) {
            return { error: { message: "Valid 10-digit phone number is required." } };
        }
        if (!data.fullName || typeof data.fullName !== "string") {
            return { error: { message: "Full name is required." } };
        }
        return { value: data };
    }
};

export const portalEligibilitySchema = {
    validate(data: any) {
        if (!data || typeof data !== "object") {
            return { error: { message: "Eligibility payload is required." } };
        }
        if (!data.salary || Number(data.salary) <= 0) {
            return { error: { message: "Valid net monthly salary is required." } };
        }
        if (!data.companyName) {
            return { error: { message: "Employer/Company name is required." } };
        }
        return { value: data };
    }
};
