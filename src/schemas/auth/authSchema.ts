export const loginSchema = {
    validate(data: any) {
        if (!data || typeof data !== "object") {
            return { error: { message: "Request body is required." } };
        }
        if (!data.email || typeof data.email !== "string" || !data.email.includes("@")) {
            return { error: { message: "A valid email address is required." } };
        }
        if (!data.password || typeof data.password !== "string" || data.password.length < 6) {
            return { error: { message: "Password must be at least 6 characters long." } };
        }
        return { value: data };
    }
};

export const passwordResetSchema = {
    validate(data: any) {
        if (!data || !data.email || !data.email.includes("@")) {
            return { error: { message: "A valid email address is required for password reset." } };
        }
        return { value: data };
    }
};
