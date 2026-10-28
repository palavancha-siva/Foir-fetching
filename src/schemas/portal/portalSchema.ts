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
