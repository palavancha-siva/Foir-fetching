/**
 * Category matching utility to accurately link company categories (e.g. CATGC, CATDU, CATGB)
 * with BRE policy categories which may be multi-code or descriptive (e.g. "CAT GC & GD (LOWER GOV TIERS)").
 */

export function extractCategoryTokens(raw: any): Set<string> {
    if (!raw) return new Set();
    const text = String(raw).toUpperCase().trim();
    const tokens = new Set<string>();
    tokens.add(text);
    tokens.add(text.replace(/[\s\-_]+/g, ""));

    const ALIASES: Record<string, string[]> = {
        DEF: ["DEFENSE", "DEFENCE"],
        DEFENSE: ["DEF"],
        DEFENCE: ["DEF"],
        POL: ["POLICE", "DEFENSE", "GOVT"],
        PMF: ["PARAMILITARY", "DEFENSE", "GOVT"],
        STF: ["STAFF", "INTERNAL STAFF"],
        STAFF: ["STF"],
        GOVT: ["GOV", "GOVERNMENT"],
        GOV: ["GOVT", "GOVERNMENT"],
        GOVERNMENT: ["GOVT", "GOV"],
        GEDU: ["EDU", "EDUCATION"],
        CATEDU: ["EDU", "GEDU", "EDUCATION"],
        SCATA: ["SUPER CAT A", "SUPER A", "SUPERA", "CAT A", "CATA"],
        "SUPER A": ["SCATA", "SUPER CAT A", "SUPERA", "CAT A"],
        SUPERA: ["SCATA", "SUPER CAT A", "SUPER A", "CAT A"],
        "SUPER CAT A": ["SCATA", "SUPER A", "SUPERA", "CAT A"],
        "CAT A+": ["CAT A", "CATA", "A+"],
        "CAT A": ["CATA", "CATEGORY A"],
        "CAT B": ["CATB", "CATEGORY B"],
        "CAT C": ["CATC", "CATEGORY C"],
        "CAT D": ["CATD", "CATEGORY D"],
        LLP: ["NON-CATEGORIZED", "UNLISTED"]
    };

    // Extract inside and outside parentheses
    const mainText = text.replace(/\([^)]*\)/g, " ").trim();
    const parenMatches = text.match(/\(([^)]+)\)/g) || [];
    const parenTexts = parenMatches.map(p => p.slice(1, -1).trim());

    const rawParts = [
        ...mainText.split(/[,&/+]|\band\b/i),
        ...parenTexts.flatMap(p => p.split(/[,&/+]|\band\b/i))
    ].map(s => s.trim()).filter(Boolean);

    for (const part of rawParts) {
        tokens.add(part);
        tokens.add(part.replace(/[\s\-_]+/g, ""));
        const noCat = part.replace(/^(CAT|CATEGORY)\s*/i, "").trim();
        if (noCat) {
            tokens.add(noCat);
            tokens.add("CAT " + noCat);
            tokens.add("CAT" + noCat);
            if (ALIASES[noCat]) {
                for (const a of ALIASES[noCat]) {
                    tokens.add(a);
                    tokens.add("CAT " + a);
                    tokens.add("CAT" + a);
                }
            }
        }
        if (ALIASES[part]) {
            for (const a of ALIASES[part]) {
                tokens.add(a);
            }
        }
    }

    if (ALIASES[text]) {
        for (const a of ALIASES[text]) {
            tokens.add(a);
        }
    }

    return tokens;
}

export function categoryMatches(companyCat: string, ruleCat: string): boolean {
    if (!companyCat || !ruleCat) return false;
    const cUpper = String(companyCat).trim().toUpperCase();
    const rUpper = String(ruleCat).trim().toUpperCase();
    if (cUpper === rUpper) return true;
    if (rUpper === "ALL" || rUpper === "DEFAULT") return true;

    const compTokens = extractCategoryTokens(companyCat);
    const ruleTokens = extractCategoryTokens(ruleCat);

    for (const ct of compTokens) {
        if (ruleTokens.has(ct)) {
            return true;
        }
    }
    return false;
}

export function findMatchingBreCategory(companyCat: string, ruleCategories: string[]): string | null {
    if (!companyCat || !ruleCategories || ruleCategories.length === 0) return null;
    const compUpper = String(companyCat).trim().toUpperCase();

    // 1. Exact match first
    for (const r of ruleCategories) {
        if (r.toUpperCase() === compUpper) return r;
    }

    // 2. Token overlap
    const compTokens = extractCategoryTokens(companyCat);
    for (const r of ruleCategories) {
        if (r === "ALL" || r === "DEFAULT") continue;
        const ruleTokens = extractCategoryTokens(r);
        for (const ct of compTokens) {
            if (ruleTokens.has(ct)) {
                return r;
            }
        }
    }

    return null;
}

module.exports = {
    extractCategoryTokens,
    categoryMatches,
    findMatchingBreCategory
};
