export interface BureauAccount {
    accountType: string;
    accountNumber: string;
    sanctionedAmount: number;
    currentBalance: number;
    emiAmount: number;
    overdueAmount: number;
    status: string;
}

export function parseBureauAccounts(reportData: any): BureauAccount[] {
    if (!reportData || !Array.isArray(reportData.accounts)) {
        return [];
    }
    return reportData.accounts.map((acc: any) => ({
        accountType: acc.accountType || "OTHER",
        accountNumber: acc.accountNumber || "XXXX",
        sanctionedAmount: Number(acc.sanctionedAmount || 0),
        currentBalance: Number(acc.currentBalance || 0),
        emiAmount: Number(acc.emiAmount || 0),
        overdueAmount: Number(acc.overdueAmount || 0),
        status: acc.status || "ACTIVE"
    }));
}
