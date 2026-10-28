export const createStaffSchema = {
    validate(data: any) {
        if (!data || typeof data !== "object") {
            return { error: { message: "Staff data is required." } };
        }
        if (!data.email || !data.email.includes("@")) {
            return { error: { message: "Valid email is required." } };
        }
        if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
            return { error: { message: "Staff name is required." } };
        }
        return { value: data };
    }
};

export const updateStaffSchema = {
    validate(data: any) {
        if (!data || typeof data !== "object") {
            return { error: { message: "Update payload is required." } };
        }
        return { value: data };
    }
};
