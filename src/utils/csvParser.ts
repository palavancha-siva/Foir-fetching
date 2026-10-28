/**
 * Parses raw CSV string into an array of objects based on header names.
 * Supports standard commas, quoted fields with commas/newlines, and escaped quotes.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
    if (typeof text !== "string") return [];

    let delimiter = ',';
    const firstLineEnd = text.search(/[\r\n]/);
    const firstLine = firstLineEnd !== -1 ? text.substring(0, firstLineEnd) : text;
    if (!firstLine.includes(',') && firstLine.includes(';')) {
        delimiter = ';';
    } else if (!firstLine.includes(',') && firstLine.includes('\t')) {
        delimiter = '\t';
    }

    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            currentLine.push(currentField.trim());
            currentField = "";
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            currentLine.push(currentField.trim());
            if (currentLine.some(f => f.length > 0)) {
                lines.push(currentLine);
            }
            currentLine = [];
            currentField = "";
        } else {
            currentField += char;
        }
    }

    if (currentField.length > 0 || currentLine.length > 0) {
        currentLine.push(currentField.trim());
        if (currentLine.some(f => f.length > 0)) {
            lines.push(currentLine);
        }
    }

    if (lines.length < 2) return [];

    let headerLineIndex = 0;
    let titleBank = "";

    // Check if line 0 is a title row (e.g. "icici", "ICICI Bank", etc.)
    if (lines.length >= 2) {
        const line0NonEmpty = lines[0].filter(c => c && c.trim().length > 0);
        const line0Joined = lines[0].join(" ").toLowerCase();
        const hasHeaderKeywords0 = /foir|salary|min|max|income|condition|rule|category|percent/i.test(line0Joined);
        const hasHeaderKeywords1 = lines[1].some(c => /foir|salary|min|max|income|condition|rule|category|percent/i.test(c));

        if (!hasHeaderKeywords0 && (hasHeaderKeywords1 || line0NonEmpty.length === 1)) {
            headerLineIndex = 1;
            if (line0NonEmpty.length > 0) {
                titleBank = line0NonEmpty[0].trim();
            }
        }
    }

    const rawHeaders = lines[headerLineIndex];
    const normalizedHeaders = rawHeaders.map(h =>
        h.toLowerCase().replace(/[^a-z0-9]/g, "")
    );

    // Auto-detect 2D Matrix Format (Salary in row header, Categories in column headers, FOIR in cells)
    const hasFoirHeader = normalizedHeaders.some(h => /^foir|^applicablefoir|^foirpercent/i.test(h));
    const salaryColIndex = normalizedHeaders.findIndex(h => /income|salary|slab|range/i.test(h));

    if (!hasFoirHeader && salaryColIndex !== -1 && rawHeaders.length > 1) {
        const matrixRecords: Array<Record<string, string>> = [];
        for (let i = headerLineIndex + 1; i < lines.length; i++) {
            const row = lines[i];
            if (row.length === 0 || (row.length === 1 && !row[0])) continue;
            const salaryRange = row[salaryColIndex] || "";

            for (let j = 0; j < rawHeaders.length; j++) {
                if (j === salaryColIndex) continue;
                const cellVal = row[j] ? row[j].trim() : "";
                if (!cellVal || /not\s*eligible/i.test(cellVal)) continue;

                // Extract FOIR percentage
                const rangeMatch = cellVal.match(/(\d+(?:\.\d+)?)\s*(?:%|pct)?\s*(?:to|-|–|—)\s*(\d+(?:\.\d+)?)\s*%/i);
                let foir = "";
                if (rangeMatch) {
                    foir = rangeMatch[2];
                } else {
                    const singleMatch = cellVal.match(/(\d+(?:\.\d+)?)\s*%/);
                    if (singleMatch) foir = singleMatch[1];
                }
                if (!foir) continue;

                // Normalize category name
                const rawCat = rawHeaders[j];
                let cat = rawCat.replace(/companies|company/gi, "").trim();
                if (/super\s*a.*cat\s*a/i.test(rawCat)) {
                    cat = "CAT A";
                } else if (/cat\s*b/i.test(rawCat)) {
                    cat = "CAT B";
                } else if (/cat\s*c/i.test(rawCat)) {
                    cat = "CAT C";
                } else if (/non[ -]*listed/i.test(rawCat)) {
                    cat = "NON-LISTED";
                }

                matrixRecords.push({
                    bank: titleBank,
                    _titlebank: titleBank,
                    category: cat,
                    salaryrange: salaryRange,
                    condition: salaryRange,
                    foir: foir,
                    rulename: `Rule ${salaryRange} (${cat})`
                });

                if (/super\s*a.*cat\s*a/i.test(rawCat)) {
                    matrixRecords.push({
                        bank: titleBank,
                        _titlebank: titleBank,
                        category: "Super A",
                        salaryrange: salaryRange,
                        condition: salaryRange,
                        foir: foir,
                        rulename: `Rule ${salaryRange} (Super A)`
                    });
                }
            }
        }
        if (matrixRecords.length > 0) {
            return matrixRecords;
        }
    }

    const records: Array<Record<string, string>> = [];
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
        const row = lines[i];
        if (row.length === 0 || (row.length === 1 && !row[0])) continue;

        const record: Record<string, string> = {};
        for (let j = 0; j < normalizedHeaders.length; j++) {
            const key = normalizedHeaders[j];
            record[key] = row[j] !== undefined ? row[j].trim() : "";
        }
        if (titleBank && !record.bank && !record.bankname && !record.lender) {
            record._titlebank = titleBank;
        }
        records.push(record);
    }

    return records;
}

/**
 * Sanitizes CSV text values: removes unprintable control characters,
 * converts newlines/tabs to spaces, and collapses extra spaces.
 */
export function sanitizeCsvValue(val: any): string {
    if (val === undefined || val === null) return "";
    return String(val)
        .replace(/[\r\n\t]+/g, " ")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export interface NormalizedCsvRow {
    bank_name: string;
    company_name: string;
    cat: string | null;
    foir: number;
    cc_obligation_percent: number;
}

/**
 * Maps CSV record keys to normalized mapping fields.
 */
export function normalizeCsvRow(row: any, defaultBank: string = ""): NormalizedCsvRow {
    const bankName =
        row.bankname ||
        row.bank ||
        row.lender ||
        row.lendername ||
        defaultBank;

    const companyName =
        row.companyname ||
        row.company ||
        row.employername ||
        row.employer ||
        row.entityname ||
        row.emprname ||
        row.nameofthecompany ||
        row.masteremployermasteremployername ||
        row.firm ||
        row.name;

    const rawCategory =
        row.finalcategory ||
        row.employercatg ||
        row.employercat ||
        row.employercategory ||
        row.empcat ||
        row.companycategoryc ||
        row.categories ||
        row.category ||
        row.cat ||
        row.catg ||
        row.tier ||
        row.classification ||
        "";

    const rawFoir =
        row.foir ||
        row.foirpercent ||
        row.foirpercentage ||
        row.maxfoir;

    const rawCc =
        row.ccobligation ||
        row.ccobligationpercent ||
        row.ccobligationpercentage ||
        row.ccpercent ||
        row.creditcardobligation;

    return {
        bank_name: sanitizeCsvValue(bankName),
        company_name: sanitizeCsvValue(companyName),
        cat: rawCategory ? sanitizeCsvValue(rawCategory) : null,
        foir: rawFoir !== undefined && rawFoir !== "" ? Number(String(rawFoir).replace("%", "").trim()) : 70,
        cc_obligation_percent: rawCc !== undefined && rawCc !== "" ? Number(String(rawCc).replace("%", "").trim()) : 2
    };
}

module.exports = {
    parseCsv,
    normalizeCsvRow,
    sanitizeCsvValue
};
