export function cleanCategoryKey(category: string): string {
    if (!category) return "";
    return String(category)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

export interface DynamicFoirResult {
    foir: number;
    salarySlab: string;
}

export function resolveDynamicFoir(category: string, salary: number): DynamicFoirResult {
    const sal = Number(salary) || 0;
    const cleanCat = cleanCategoryKey(category);

    // 1. SCAT A / CAT A / CAT B
    if (
        cleanCat === "SCATA" ||
        cleanCat === "CATA" ||
        cleanCat === "CATB" ||
        cleanCat === "CATEGORYA" ||
        cleanCat === "CATEGORYB"
    ) {
        if (sal >= 75000) return { foir: 70.0, salarySlab: "> 75K" };
        if (sal >= 50000) return { foir: 65.0, salarySlab: "50K – 75K" };
        if (sal >= 25000) return { foir: 55.0, salarySlab: "25K – 50K" };
        return { foir: 40.0, salarySlab: "< 25K" };
    }

    // 2. CAT GA / GA / CAT RA / RA / EDU ALPHA / EDU BETA
    if (
        cleanCat === "CATGA" ||
        cleanCat === "GA" ||
        cleanCat === "CATRA" ||
        cleanCat === "RA" ||
        cleanCat === "EDUALPHA" ||
        cleanCat === "EDUBETA"
    ) {
        if (sal >= 75000) return { foir: 70.0, salarySlab: "> 75K" };
        if (sal >= 50000) return { foir: 65.0, salarySlab: "50K – 75K" };
        return { foir: 50.0, salarySlab: "< 50K" };
    }

    // 3. CAT GB / GB
    if (cleanCat === "CATGB" || cleanCat === "GB") {
        if (sal >= 75000) return { foir: 70.0, salarySlab: "> 75K" };
        if (sal >= 50000) return { foir: 65.0, salarySlab: "50K – 75K" };
        if (sal >= 35000) return { foir: 55.0, salarySlab: "35K – 50K" };
        if (sal >= 25000) return { foir: 50.0, salarySlab: "25K – 35K" };
        return { foir: 40.0, salarySlab: "< 25K" };
    }

    // 4. CAT C / CAT GO / GO / CAT RB / RB / CAT EDU / EDU
    if (
        cleanCat === "CATC" ||
        cleanCat === "CATGC" ||
        cleanCat === "CATEGORYC" ||
        cleanCat === "CATGO" ||
        cleanCat === "GO" ||
        cleanCat === "CATRB" ||
        cleanCat === "RB" ||
        cleanCat === "CATEDU" ||
        cleanCat === "EDU"
    ) {
        if (sal >= 75000) return { foir: 70.0, salarySlab: "> 75K" };
        if (sal >= 50000) return { foir: 65.0, salarySlab: "50K – 75K" };
        if (sal >= 35000) return { foir: 50.0, salarySlab: "35K – 50K" };
        return { foir: 40.0, salarySlab: "< 35K" };
    }

    // 5. CAT RC / RC / CAT RO / RO
    if (
        cleanCat === "CATRC" ||
        cleanCat === "RC" ||
        cleanCat === "CATRO" ||
        cleanCat === "RO"
    ) {
        if (sal >= 75000) return { foir: 70.0, salarySlab: "> 75K" };
        if (sal >= 50000) return { foir: 65.0, salarySlab: "50K – 75K" };
        if (sal >= 35000) return { foir: 50.0, salarySlab: "35K – 50K" };
        if (sal >= 25000) return { foir: 50.0, salarySlab: "25K – 35K" };
        return { foir: 40.0, salarySlab: "< 25K" };
    }

    // 6. CAT D / CATGD
    if (
        cleanCat === "CATD" ||
        cleanCat === "CATGD" ||
        cleanCat === "CATEGORYD"
    ) {
        if (sal >= 75000) return { foir: 65.0, salarySlab: "> 75K" };
        if (sal >= 50000) return { foir: 60.0, salarySlab: "50K – 75K" };
        if (sal >= 35000) return { foir: 50.0, salarySlab: "35K – 50K" };
        return { foir: 40.0, salarySlab: "< 35K" };
    }

    // 7. Default Fallback
    if (sal >= 75000) return { foir: 70.0, salarySlab: "> 75K" };
    if (sal >= 50000) return { foir: 65.0, salarySlab: "50K – 75K" };
    if (sal >= 25000) return { foir: 55.0, salarySlab: "25K – 50K" };
    return { foir: 40.0, salarySlab: "< 25K" };
}

export function resolveMultiplier(category: string, salary: number, tenureMonths: number = 60): number {
    const sal = Number(salary) || 0;
    const cleanCat = cleanCategoryKey(category);
    const tenure = Number(tenureMonths) || 60;

    // CAT A Multipliers
    if (cleanCat === "CATA" || cleanCat === "SCATA") {
        if (tenure <= 12) return sal >= 75000 ? 7 : (sal >= 50000 ? 7 : (sal >= 35000 ? 6 : 5));
        if (tenure <= 24) return sal >= 75000 ? 13 : (sal >= 50000 ? 13 : 10);
        if (tenure <= 36) return sal >= 75000 ? 18 : (sal >= 50000 ? 18 : (sal >= 35000 ? 16 : 14));
        if (tenure <= 48) return sal >= 75000 ? 23 : (sal >= 50000 ? 23 : (sal >= 35000 ? 20 : 16));
        return sal >= 75000 ? 27 : (sal >= 50000 ? 25 : (sal >= 35000 ? 22 : 19));
    }

    // CAT B Multipliers
    if (cleanCat === "CATB") {
        if (tenure <= 12) return sal >= 75000 ? 7 : 5;
        if (tenure <= 24) return sal >= 75000 ? 13 : 10;
        if (tenure <= 36) return sal >= 75000 ? 18 : 14;
        if (tenure <= 48) return sal >= 75000 ? 22 : 17;
        return sal >= 75000 ? 25 : (sal >= 50000 ? 20 : 15);
    }

    // CAT C Multipliers
    if (cleanCat === "CATC") {
        if (tenure <= 12) return 5;
        if (tenure <= 24) return sal >= 50000 ? 11 : 7;
        if (tenure <= 36) return sal >= 50000 ? 15 : 9;
        if (tenure <= 48) return sal >= 50000 ? 18 : 11;
        return sal >= 75000 ? 21 : (sal >= 50000 ? 20 : 13);
    }

    // CAT D Multipliers
    if (cleanCat === "CATD") {
        if (sal >= 75000) return 15;
        if (sal >= 50000) return 14;
        if (sal >= 35000) return 12;
        return 10;
    }

    // CAT GA Multipliers
    if (cleanCat === "CATGA" || cleanCat === "GA") {
        return sal >= 75000 ? 20 : (sal >= 50000 ? 20 : 15);
    }

    // CAT GB Multipliers
    if (cleanCat === "CATGB" || cleanCat === "GB") {
        if (sal >= 75000) return 22;
        if (sal >= 35000) return 20;
        return 10;
    }

    // CAT GO Multipliers
    if (cleanCat === "CATGO" || cleanCat === "GO") {
        if (sal >= 75000) return 22;
        if (sal >= 50000) return 20;
        if (sal >= 35000) return 15;
        return 10;
    }

    // CAT RA Multipliers
    if (cleanCat === "CATRA" || cleanCat === "RA") {
        return sal >= 75000 ? 25 : (sal >= 50000 ? 23 : 15);
    }

    // CAT RB Multipliers
    if (cleanCat === "CATRB" || cleanCat === "RB") {
        if (sal >= 75000) return 25;
        if (sal >= 50000) return 23;
        if (sal >= 35000) return 18;
        return 10;
    }

    // CAT RC Multipliers
    if (cleanCat === "CATRC" || cleanCat === "RC") {
        if (sal >= 75000) return 22;
        if (sal >= 50000) return 20;
        if (sal >= 25000) return 14;
        return 10;
    }

    // CAT RO Multipliers
    if (cleanCat === "CATRO" || cleanCat === "RO") {
        if (sal >= 75000) return 25;
        if (sal >= 50000) return 23;
        if (sal >= 35000) return 18;
        if (sal >= 25000) return 14;
        return 10;
    }

    // CAT EDU Multipliers
    if (cleanCat === "CATEDU" || cleanCat === "EDU") {
        if (sal >= 75000) return 21;
        if (sal >= 50000) return 20;
        if (sal >= 35000) return 13;
        return 10;
    }

    // EDU ALPHA Multipliers
    if (cleanCat === "EDUALPHA") {
        return sal >= 75000 ? 27 : (sal >= 50000 ? 25 : 15);
    }

    // EDU BETA Multipliers
    if (cleanCat === "EDUBETA") {
        return sal >= 75000 ? 22 : (sal >= 50000 ? 20 : 15);
    }

    // Generic fallback
    if (tenure <= 12) return 5;
    if (tenure <= 24) return 9;
    if (tenure <= 36) return 13;
    if (tenure <= 48) return 16;
    return sal >= 75000 ? 24 : 18;
}
