export const calculateFoirSchema = {
    validate(data: any) {
        if (!data || typeof data !== "object") {
            return { error: { message: "Calculation payload is required." } };
        }
        const income = Number(data.income);
        const annualRate = Number(data.annualRate);
        const months = Number(data.months);

        if (!Number.isFinite(income) || income <= 0) {
            return { error: { message: "Income must be a positive number." } };
        }
        if (!Number.isFinite(annualRate) || annualRate < 0) {
            return { error: { message: "Annual interest rate must be a non-negative number." } };
        }
        if (!Number.isFinite(months) || months <= 0) {
            return { error: { message: "Tenure months must be a positive number." } };
        }
        return { value: data };
    }
};

export const createLoanApplicationSchema = {
    validate(data: any) {
        if (!data || typeof data !== "object") {
            return { error: { message: "Loan application data is required." } };
        }
        if (!data.companyName || typeof data.companyName !== "string") {
            return { error: { message: "Company name is required." } };
        }
        if (!data.salary || Number(data.salary) <= 0) {
            return { error: { message: "Valid salary is required." } };
        }
        return { value: data };
    }
};
