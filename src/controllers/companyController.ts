// @ts-nocheck
"use strict";

const companyService = require("../services/companyService");
const { getDynamicFoirFromDb } = require("../services/policyMatrixService");
const { resolveDynamicFoir } = require("../helpers/policyMatrix");
const { resolveBreFoir } = require("../services/breService");
const { lookupPincode, isBankServiceableForPincode } = require("../services/pincodeService");
const { categoryMatches } = require("../utils/categoryMatcher");

function sortLendersByFoirDesc(a, b) {
    const foirA = Number(a && a.foir) || 0;
    const foirB = Number(b && b.foir) || 0;
    if (foirB !== foirA) {
        return foirB - foirA; // High to Low based on FOIR %
    }
    const nameA = String(a && a.bank_name || "").toUpperCase();
    const nameB = String(b && b.bank_name || "").toUpperCase();
    return nameA.localeCompare(nameB);
}

async function evaluateFinnableLender(companyName, salary, pincode, enquiries30d, pool) {
    if (salary < 15000) return null;

    // Finnable strictly requires a valid 6-digit entered PIN code that is confirmed serviceable
    const cleanPin = String(pincode || "").trim().replace(/\D/g, "");
    if (!cleanPin || cleanPin.length !== 6) {
        return null; // Do NOT show Finnable until a 6-digit PIN code is entered
    }

    let pincodeInfo = null;
    try {
        pincodeInfo = await lookupPincode(cleanPin);
    } catch (_e) { }

    if (!pincodeInfo || !pincodeInfo.is_serviceable) {
        return null; // Do NOT show Finnable if the location is not serviceable
    }

    const tier = pincodeInfo.tier || "TIER 2";
    const breCat = tier === "TIER 1" ? "TIER 1 (METROS)" : "TIER 2";
    let breResult = null;
    try {
        breResult = await resolveBreFoir("FINNABLE", breCat, salary, { dbOrPool: pool });
    } catch (_e) { }

    const foirVal = breResult ? breResult.foir_percent : (tier === "TIER 1" ? 60 : 50);
    const slabVal = breResult ? breResult.rule_name : `Finnable ₹15k+ Policy (${tier})`;

    let inquiryStatus = "approved";
    let inquiryMessage = "Clean inquiry velocity (≤ 4 enquiries in 30 days)";
    if (enquiries30d > 7) {
        inquiryStatus = "rejected";
        inquiryMessage = "Declined: Excessive recent bureau enquiries (> 7 in 30 days)";
    } else if (enquiries30d > 4) {
        inquiryStatus = "deviation";
        inquiryMessage = "Requires deviation approval (5 to 7 enquiries in 30 days)";
    }

    return {
        id: 999999,
        company_name: companyName,
        bank_name: "FINNABLE",
        cat: breCat,
        foir: foirVal,
        salary_slab: slabVal,
        cc_obligation_percent: 5,
        is_finnable: true,
        low_salary_eligible: true,
        tier: tier,
        min_salary: 15000,
        serviceable: true,
        pincode_info: pincodeInfo ? {
            pincode: pincodeInfo.pincode,
            city: pincodeInfo.city,
            state: pincodeInfo.state,
            tier: pincodeInfo.tier
        } : null,
        mandatory_docs: ["Bank Statement (Last 3 Months) - Mandatory"],
        inquiry_check: {
            enquiries_count: enquiries30d,
            status: inquiryStatus,
            message: inquiryMessage
        }
    };
}

async function evaluateCatalogFreeLenders(companyName, salary, knownCategories = [], pool = null, hasHomeLoan = false) {
    if (!pool || salary <= 0) return [];

    try {
        // Query lenders that have active BRE rules but NO company-specific catalog in company_bank_mappings (e.g. INCRID)
        const q = `
            SELECT DISTINCT b.bank_name
            FROM bre_rules b
            WHERE b.active = 1
              AND LOWER(TRIM(b.bank_name)) != 'finnable'
              AND NOT EXISTS (
                  SELECT 1 FROM company_bank_mappings c
                  WHERE LOWER(TRIM(c.bank_name)) = LOWER(TRIM(b.bank_name))
                     OR LOWER(TRIM(c.bank_name)) = LOWER(TRIM(REPLACE(b.bank_name, ' BANK', '')))
              )
            ORDER BY b.bank_name ASC
        `;
        const res = await pool.query(q);
        const catalogFreeBanks = res.rows.map(r => r.bank_name);
        if (catalogFreeBanks.length === 0) return [];

        const openLenders = [];

        for (const bankName of catalogFreeBanks) {
            const catRes = await pool.query(
                "SELECT DISTINCT category FROM bre_rules WHERE LOWER(TRIM(bank_name)) = LOWER(TRIM($1)) AND active = 1",
                [bankName]
            );
            const bankCats = catRes.rows.map(r => r.category);

            let targetCategory = null;

            // 1. Try to match known categories from other banks (e.g. if company is CAT A in HDFC, match InCred CAT A)
            if (Array.isArray(knownCategories) && knownCategories.length > 0) {
                for (const kc of knownCategories) {
                    for (const bc of bankCats) {
                        if (categoryMatches(kc, bc)) {
                            targetCategory = bc;
                            break;
                        }
                    }
                    if (targetCategory) break;
                }
            }

            // 2. If unlisted or no known category matches, select the unlisted / startup / default category
            if (!targetCategory) {
                targetCategory = bankCats.find(c => /unlisted|startup|llp|open|all|default/i.test(c)) || bankCats[0];
            }

            if (!targetCategory) continue;

            let breResult = null;
            try {
                breResult = await resolveBreFoir(bankName, targetCategory, salary, { hasHomeLoan, dbOrPool: pool });
            } catch (_e) { }

            if (breResult) {
                openLenders.push({
                    id: 999100 + openLenders.length,
                    company_name: companyName,
                    bank_name: bankName,
                    cat: targetCategory,
                    foir: breResult.foir_percent,
                    salary_slab: breResult.rule_name,
                    cc_obligation_percent: 5,
                    is_open_market: true
                });
            }
        }

        return openLenders;
    } catch (err) {
        console.error("evaluateCatalogFreeLenders error:", err);
        return [];
    }
}

function createCompanyController(state) {
    return {
        async search(req, res) {
            const search = String(req.query.search || req.query.q || req.query.query || "").trim();
            if (search.length < 2) return res.json([]);

            const pool = state.getPool();
            if (!pool) {
                const demoCompanies = [
                    { id: 1, name: "TCS" },
                    { id: 2, name: "Infosys" },
                    { id: 3, name: "Wipro" },
                    { id: 4, name: "Accenture" },
                    { id: 5, name: "Cognizant" },
                    { id: 6, name: "Capgemini" },
                    { id: 7, name: "Government" },
                    { id: 8, name: "Amazon" },
                    { id: 9, name: "Google" },
                    { id: 10, name: "Microsoft" },
                    { id: 11, name: "IBM" }
                ];
                return res.json(demoCompanies.filter(c => c.name.toLowerCase().includes(search.toLowerCase())));
            }

            try {
                return res.json(await companyService.searchCompanies(search, pool));
            } catch (error) {
                console.error("Company autocomplete error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to search companies."
                });
            }
        },

        async categories(_req, res) {
            const pool = state.getPool();
            if (!pool) {
                return res.json([
                    { id: 1, name: "CAT A" },
                    { id: 2, name: "CAT B" }
                ]);
            }

            try {
                return res.json(await companyService.listCategories("", pool));
            } catch (error) {
                console.error("Bank category list error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch bank categories."
                });
            }
        },

        async mappings(req, res) {
            const companyName = String(req.query.company || "").trim();
            const salary = Number(req.query.salary || req.query.income || req.query.monthly_income) || 0;
            const hasHomeLoan = req.query.hasHomeLoan === "true" || req.query.hasHomeLoan === "1" || req.query.hasHomeLoan === true;
            const pincode = String(req.query.pincode || req.query.pin || "").trim();
            const enquiries30d = Number(req.query.enquiries || req.query.enquiries30d || 0);

            if (!companyName) {
                return res.status(400).json({
                    success: false,
                    message: "Company name is required."
                });
            }

            const pool = state.getPool();
            if (!pool) {
                const DEMO_MAPPINGS = {
                    tcs: [
                        { bank_name: "HDFC Bank", cat: "CAT A", foir: 75 },
                        { bank_name: "ICICI Bank", cat: "CAT A", foir: 75 },
                        { bank_name: "Axis Bank", cat: "CAT A", foir: 70 },
                        { bank_name: "SBI", cat: "CAT A", foir: 70 },
                        { bank_name: "Kotak Mahindra", cat: "CAT B", foir: 65 }
                    ],
                    infosys: [
                        { bank_name: "HDFC Bank", cat: "CAT A", foir: 75 },
                        { bank_name: "ICICI Bank", cat: "CAT A", foir: 75 },
                        { bank_name: "Axis Bank", cat: "CAT A", foir: 70 },
                        { bank_name: "SBI", cat: "CAT A", foir: 70 },
                        { bank_name: "Kotak Mahindra", cat: "CAT B", foir: 65 }
                    ],
                    wipro: [
                        { bank_name: "HDFC Bank", cat: "CAT A", foir: 70 },
                        { bank_name: "ICICI Bank", cat: "CAT A", foir: 70 },
                        { bank_name: "Axis Bank", cat: "CAT B", foir: 65 },
                        { bank_name: "SBI", cat: "CAT A", foir: 68 },
                        { bank_name: "Kotak Mahindra", cat: "CAT B", foir: 60 }
                    ]
                };

                const found = DEMO_MAPPINGS[companyName.toLowerCase()] || [];
                const demoList = found.map((m, idx) => {
                    const dynamicMatrix = resolveDynamicFoir(m.cat, salary);
                    return {
                        id: idx + 1,
                        company_name: companyName,
                        bank_name: m.bank_name,
                        cat: m.cat,
                        foir: dynamicMatrix.foir,
                        salary_slab: dynamicMatrix.salarySlab,
                        cc_obligation_percent: 5
                    };
                });

                const finnableDemo = await evaluateFinnableLender(companyName, salary, pincode, enquiries30d, null);
                if (finnableDemo) {
                    demoList.push(finnableDemo);
                }

                demoList.sort(sortLendersByFoirDesc);

                if (demoList.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: `No lender mappings found for company "${companyName}".`
                    });
                }

                return res.json({
                    success: true,
                    company_name: companyName,
                    mappings: demoList
                });
            }

            try {
                const result = await companyService.getCompanyMappings(companyName, pool);
                const finnableLender = await evaluateFinnableLender(companyName, salary, pincode, enquiries30d, pool);
                const knownCategories = result.rows.map(r => r.cat).filter(Boolean);
                const catalogFreeLenders = await evaluateCatalogFreeLenders(companyName, salary, knownCategories, pool, hasHomeLoan);

                if (result.rows.length === 0) {
                    let fallbackLenders = [];
                    if (finnableLender) fallbackLenders.push(finnableLender);
                    if (catalogFreeLenders && catalogFreeLenders.length > 0) fallbackLenders.push(...catalogFreeLenders);

                    const cleanPin = String(pincode || "").trim().replace(/\D/g, "");
                    if (cleanPin.length === 6) {
                        const filtered = [];
                        for (const m of fallbackLenders) {
                            if (m.is_finnable || (m.bank_name && m.bank_name.toUpperCase().includes("FINNABLE"))) {
                                filtered.push(m);
                                continue;
                            }
                            const isServ = await isBankServiceableForPincode(m.bank_name, cleanPin);
                            if (isServ) filtered.push(m);
                        }
                        fallbackLenders = filtered;
                    }

                    fallbackLenders.sort(sortLendersByFoirDesc);

                    if (fallbackLenders.length > 0) {
                        return res.json({
                            success: true,
                            company_name: companyName,
                            mappings: fallbackLenders
                        });
                    }
                    return res.status(404).json({
                        success: false,
                        message: `No lender mappings found for company "${companyName}".`
                    });
                }

                const mappingsWithFoir = await Promise.all(
                    result.rows.map(async row => {
                        let breResult = null;
                        try {
                            breResult = await resolveBreFoir(row.bank_name, row.cat, salary, { hasHomeLoan, dbOrPool: pool });
                        } catch (err) {
                            // Fallback if bre_rules is not ready
                        }

                        if (breResult) {
                            return {
                                id: Number(row.id),
                                company_name: row.company_name,
                                bank_name: row.bank_name,
                                cat: row.cat,
                                foir: breResult.foir_percent,
                                salary_slab: breResult.rule_name,
                                cc_obligation_percent: Number(row.cc_obligation_percent || 5)
                            };
                        }

                        const dynamicMatrix = await getDynamicFoirFromDb(row.cat, salary, pool, row.bank_name);
                        return {
                            id: Number(row.id),
                            company_name: row.company_name,
                            bank_name: row.bank_name,
                            cat: row.cat,
                            foir: dynamicMatrix.foir,
                            salary_slab: dynamicMatrix.salarySlab,
                            cc_obligation_percent: Number(row.cc_obligation_percent || 5)
                        };
                    })
                );

                if (catalogFreeLenders && catalogFreeLenders.length > 0) {
                    for (const cfl of catalogFreeLenders) {
                        const existingIdx = mappingsWithFoir.findIndex(m => m.bank_name.toLowerCase().trim() === cfl.bank_name.toLowerCase().trim());
                        if (existingIdx >= 0) {
                            mappingsWithFoir[existingIdx] = { ...mappingsWithFoir[existingIdx], ...cfl };
                        } else {
                            mappingsWithFoir.push(cfl);
                        }
                    }
                }

                if (finnableLender) {
                    const existingIndex = mappingsWithFoir.findIndex(m => m.bank_name.toLowerCase().includes("finnable"));
                    if (existingIndex >= 0) {
                        mappingsWithFoir[existingIndex] = { ...mappingsWithFoir[existingIndex], ...finnableLender };
                    } else {
                        mappingsWithFoir.push(finnableLender);
                    }
                }

                let finalMappings = mappingsWithFoir;
                const cleanPin = String(pincode || "").trim().replace(/\D/g, "");
                if (cleanPin.length === 6) {
                    const filtered = [];
                    for (const m of mappingsWithFoir) {
                        if (m.is_finnable || (m.bank_name && m.bank_name.toUpperCase().includes("FINNABLE"))) {
                            filtered.push(m);
                            continue;
                        }
                        const isServ = await isBankServiceableForPincode(m.bank_name, cleanPin);
                        if (isServ) filtered.push(m);
                    }
                    finalMappings = filtered;
                }

                // Sort High to Low based on FOIR %
                finalMappings.sort(sortLendersByFoirDesc);

                return res.json({
                    success: true,
                    company_name: result.rows[0].company_name,
                    mappings: finalMappings
                });
            } catch (error) {
                console.error("Company mappings error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch company lender mappings."
                });
            }
        },

        async mapping(req, res) {
            const companyName = String(req.query.company || "").trim();
            const monthlyIncome = Number(req.query.monthly_income);
            const hasHomeLoan = req.query.hasHomeLoan === "true" || req.query.hasHomeLoan === "1" || req.query.hasHomeLoan === true;

            if (!companyName) {
                return res.status(400).json({
                    success: false,
                    message: "Company name is required."
                });
            }
            if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Enter a valid monthly income greater than zero."
                });
            }

            const pool = state.getPool();
            if (!pool) {
                return res.status(503).json({
                    success: false,
                    message: "PostgreSQL is not connected."
                });
            }

            try {
                const result = await companyService.getCompanyMapping(companyName, pool);

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: `No mapping found for company "${companyName}".`
                    });
                }

                const row = result.rows[0];
                let breResult = null;
                try {
                    breResult = await resolveBreFoir(row.bank_name, row.cat, monthlyIncome, { hasHomeLoan, dbOrPool: pool });
                } catch (err) {}

                let foirVal = null;
                let slabVal = null;
                if (breResult) {
                    foirVal = breResult.foir_percent;
                    slabVal = breResult.rule_name;
                } else {
                    const dynamicMatrix = await getDynamicFoirFromDb(row.cat, monthlyIncome, pool, row.bank_name);
                    foirVal = dynamicMatrix.foir;
                    slabVal = dynamicMatrix.salarySlab;
                }

                return res.json({
                    success: true,
                    mapping: {
                        company_name: row.company_name,
                        bank_name: row.bank_name,
                        cat: row.cat,
                        foir: foirVal,
                        salary_slab: slabVal,
                        cc_obligation_percent: Number(row.cc_obligation_percent || 2)
                    }
                });
            } catch (error) {
                console.error("Company mapping error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch company mapping from PostgreSQL."
                });
            }
        }
    };
}

module.exports = createCompanyController;

