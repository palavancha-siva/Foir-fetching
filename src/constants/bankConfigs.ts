export interface BankInterestRates {
    personal: number;
    home: number;
    car: number;
    education: number;
}

export interface BankConfig {
    name: string;
    logo_initials: string;
    logo_color: string;
    min_age: number;
    max_age: number;
    min_credit_score: number;
    strong_credit_score: number;
    min_income: number;
    max_emi_ratio: number;
    interest_rates: BankInterestRates;
}

export const BANK_CONFIGS: BankConfig[] = [
    {
        name: "SBI",
        logo_initials: "SBI",
        logo_color: "#2D5FA3",
        min_age: 21,
        max_age: 60,
        min_credit_score: 650,
        strong_credit_score: 750,
        min_income: 20000,
        max_emi_ratio: 0.50,
        interest_rates: {
            personal: 11,
            home: 8.5,
            car: 9.2,
            education: 9.5
        }
    },
    {
        name: "HDFC Bank",
        logo_initials: "HDFC",
        logo_color: "#004C8F",
        min_age: 24,
        max_age: 58,
        min_credit_score: 700,
        strong_credit_score: 760,
        min_income: 25000,
        max_emi_ratio: 0.45,
        interest_rates: {
            personal: 11.25,
            home: 8.75,
            car: 9.4,
            education: 9.75
        }
    },
    {
        name: "ICICI Bank",
        logo_initials: "ICICI",
        logo_color: "#B4451F",
        min_age: 23,
        max_age: 60,
        min_credit_score: 680,
        strong_credit_score: 750,
        min_income: 18000,
        max_emi_ratio: 0.50,
        interest_rates: {
            personal: 11.4,
            home: 8.85,
            car: 9.5,
            education: 9.9
        }
    },
    {
        name: "Andhra Bank",
        logo_initials: "AB",
        logo_color: "#1F7A4D",
        min_age: 21,
        max_age: 62,
        min_credit_score: 620,
        strong_credit_score: 720,
        min_income: 15000,
        max_emi_ratio: 0.55,
        interest_rates: {
            personal: 12,
            home: 9.1,
            car: 9.8,
            education: 10.2
        }
    },
    {
        name: "Finnable",
        logo_initials: "FIN",
        logo_color: "#4F46E5",
        min_age: 21,
        max_age: 60,
        min_credit_score: 650,
        strong_credit_score: 720,
        min_income: 15000,
        max_emi_ratio: 0.60,
        interest_rates: {
            personal: 13.99,
            home: 9.5,
            car: 10.5,
            education: 11.0
        }
    }
];

module.exports = { BANK_CONFIGS };
module.exports.BANK_CONFIGS = BANK_CONFIGS;
export default BANK_CONFIGS;
