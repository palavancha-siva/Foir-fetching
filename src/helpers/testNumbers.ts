export function isTestPhoneNumber(phone: string): boolean {
    const clean = String(phone || "").replace(/\D/g, "");
    return clean.startsWith("99999") || clean.startsWith("88888") || clean === "9876543210";
}

export function generateTestOtp(): string {
    return "123456";
}
