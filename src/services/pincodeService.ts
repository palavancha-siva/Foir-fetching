import { Knex } from "knex";
import { db as defaultDb } from "../utils/dbUtil";

export interface PincodeRecord {
    id?: number;
    pincode: string;
    state: string;
    city: string;
    tier: "TIER 1" | "TIER 2";
    serviceable_finnable: number;
    active?: number;
}

export interface PincodeLookupResult {
    pincode: string;
    found: boolean;
    state: string;
    region: string;
    location: string;
    city: string;
    tier: "TIER 1" | "TIER 2";
    is_serviceable: boolean;
    serviceable_banks: string[];
    partner: string;
    min_salary: number;
    mandatory_docs: string[];
    inquiry_rules: {
        max_acceptable_enquiries: number;
        deviation_enquiries_range: string;
        rejection_enquiries_threshold: number;
    };
}

export const TIER_1_CITIES = [
    "mumbai",
    "chennai",
    "delhi",
    "delhi-ncr",
    "delhi ncr",
    "new delhi",
    "gurgaon",
    "gurugram",
    "noida",
    "ghaziabad",
    "faridabad",
    "bangalore",
    "bengaluru",
    "hyderabad",
    "secunderabad",
    "pune",
    "ahmedabad",
    "kolkata"
];

export function getCityTier(cityName: string, regionName: string = ""): "TIER 1" | "TIER 2" {
    const cleanCity = String(cityName || "").trim().toLowerCase();
    const cleanRegion = String(regionName || "").trim().toLowerCase();
    
    if (cleanCity && cleanCity !== "unknown") {
        const isTier1City = TIER_1_CITIES.some(t => cleanCity === t || cleanCity.includes(t) || t.includes(cleanCity));
        return isTier1City ? "TIER 1" : "TIER 2";
    }

    if (cleanRegion && cleanRegion !== "unknown") {
        const isTier1Region = TIER_1_CITIES.some(t => cleanRegion === t || cleanRegion.includes(t) || t.includes(cleanRegion));
        return isTier1Region ? "TIER 1" : "TIER 2";
    }

    return "TIER 2";
}

let tableEnsured = false;

export async function ensurePincodeMasterTable(k: Knex = defaultDb): Promise<void> {
    if (tableEnsured) return;

    const exists = await k.schema.hasTable("pincode_master");
    if (!exists) {
        await k.schema.createTable("pincode_master", table => {
            table.bigIncrements("id").primary();
            table.string("pincode", 10).notNullable().unique();
            table.string("state", 100).notNullable();
            table.string("city", 100).notNullable();
            table.string("location", 150).nullable();
            table.string("region", 150).nullable();
            table.string("tier", 20).notNullable().defaultTo("TIER 2");
            table.smallint("serviceable_finnable").notNullable().defaultTo(1);
            table.smallint("active").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(k.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(k.fn.now());
        });

        await k.raw(`
            CREATE INDEX IF NOT EXISTS idx_pincode_master_city ON pincode_master (LOWER(TRIM(city)));
            CREATE INDEX IF NOT EXISTS idx_pincode_master_state ON pincode_master (LOWER(TRIM(state)));
        `);
    }

    const hasBankServ = await k.schema.hasTable("bank_pincode_serviceability");
    if (!hasBankServ) {
        await k.schema.createTable("bank_pincode_serviceability", table => {
            table.bigIncrements("id").primary();
            table.string("bank_name", 100).notNullable();
            table.string("pincode", 10).notNullable();
            table.smallint("is_serviceable").notNullable().defaultTo(1);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(k.fn.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(k.fn.now());
            table.unique(["bank_name", "pincode"]);
        });
        await k.raw(`CREATE INDEX IF NOT EXISTS idx_bank_pin ON bank_pincode_serviceability(bank_name, pincode);`);
    }

    tableEnsured = true;
}

export async function getServiceableBanks(pincode: string, k: Knex = defaultDb): Promise<string[]> {
    try {
        const rows = await k("bank_pincode_serviceability")
            .where({ pincode, is_serviceable: 1 })
            .pluck("bank_name");
        return rows || [];
    } catch (_err) {
        return [];
    }
}

export async function isBankServiceableForPincode(bankName: string, pincode: string, k: Knex = defaultDb): Promise<boolean> {
    try {
        const cleanBank = String(bankName || "").trim().toUpperCase();
        if (cleanBank.includes("FINNABLE")) {
            const pinInfo = await lookupPincode(pincode, k);
            return Boolean(pinInfo && pinInfo.found && pinInfo.is_serviceable);
        }

        // Check if bank has ANY entries in serviceability table
        const bankConfigured = await k("bank_pincode_serviceability")
            .whereRaw("UPPER(bank_name) = ?", [cleanBank])
            .first();

        // If this bank hasn't uploaded a restrictive serviceability list, it operates open-market
        if (!bankConfigured) {
            return true;
        }

        // 1. Strict exact check
        const row = await k("bank_pincode_serviceability")
            .whereRaw("UPPER(bank_name) = ? AND pincode = ?", [cleanBank, pincode])
            .first();

        if (row) {
            return Boolean(row.is_serviceable === 1);
        }

        // 2. Prefix intelligent fallback (first 3 digits)
        const prefix3 = pincode.slice(0, 3);
        const prefixRow = await k("bank_pincode_serviceability")
            .whereRaw("UPPER(bank_name) = ? AND pincode LIKE ?", [cleanBank, `${prefix3}%`])
            .first();

        if (prefixRow) {
            return Boolean(prefixRow.is_serviceable === 1);
        }

        return false;
    } catch (_err) {
        return true;
    }
}

/**
 * Looks up any 6-digit PIN code.
 * Returns state, region, location, tier, and list of serviceable banks.
 */
export async function lookupPincode(pincodeRaw: string, k: Knex = defaultDb): Promise<PincodeLookupResult> {
    await ensurePincodeMasterTable(k);

    const pin = String(pincodeRaw || "").trim().replace(/\D/g, "");

    if (!pin || pin.length < 3 || pin.length > 6) {
        return {
            pincode: pin,
            found: false,
            state: "Unknown",
            region: "Unknown",
            location: "Unknown",
            city: "Unknown",
            tier: "TIER 2",
            is_serviceable: false,
            serviceable_banks: [],
            partner: "FINNABLE",
            min_salary: 15000,
            mandatory_docs: ["Bank Statement (Last 3 Months) - Mandatory"],
            inquiry_rules: {
                max_acceptable_enquiries: 4,
                deviation_enquiries_range: "5 to 7 enquiries",
                rejection_enquiries_threshold: 7
            }
        };
    }

    // 1. Exact match search
    const exact = await k("pincode_master")
        .where({ pincode: pin, active: 1 })
        .first();

    if (exact) {
        const banks = await getServiceableBanks(exact.pincode, k);
        const isServ = banks.includes("FINNABLE") || exact.serviceable_finnable === 1;

        return {
            pincode: exact.pincode,
            found: true,
            state: exact.state,
            region: exact.region || exact.city,
            location: exact.location || exact.city,
            city: exact.location || exact.city,
            tier: exact.tier as "TIER 1" | "TIER 2",
            is_serviceable: isServ,
            serviceable_banks: banks,
            partner: "FINNABLE",
            min_salary: 15000,
            mandatory_docs: ["Bank Statement (Last 3 Months) - Mandatory"],
            inquiry_rules: {
                max_acceptable_enquiries: 4,
                deviation_enquiries_range: "5 to 7 enquiries",
                rejection_enquiries_threshold: 7
            }
        };
    }

    // 2. Prefix intelligent fallback (e.g. 500xxx -> Hyderabad Tier 1, 520xxx -> Vijayawada Tier 2)
    const prefix3 = pin.slice(0, 3);
    const prefixMatch = await k("pincode_master")
        .where("pincode", "like", `${prefix3}%`)
        .andWhere("active", 1)
        .first();

    if (prefixMatch) {
        const banks = await getServiceableBanks(prefixMatch.pincode, k);
        const isServ = banks.includes("FINNABLE") || prefixMatch.serviceable_finnable === 1;

        return {
            pincode: pin,
            found: true,
            state: prefixMatch.state,
            region: prefixMatch.region || prefixMatch.city,
            location: prefixMatch.location || prefixMatch.city,
            city: prefixMatch.location || prefixMatch.city,
            tier: prefixMatch.tier as "TIER 1" | "TIER 2",
            is_serviceable: isServ,
            serviceable_banks: banks,
            partner: "FINNABLE",
            min_salary: 15000,
            mandatory_docs: ["Bank Statement (Last 3 Months) - Mandatory"],
            inquiry_rules: {
                max_acceptable_enquiries: 4,
                deviation_enquiries_range: "5 to 7 enquiries",
                rejection_enquiries_threshold: 7
            }
        };
    }

    // Default unknown pincode (unserviceable)
    return {
        pincode: pin,
        found: false,
        state: "Non-Serviceable Region",
        region: "Non-Serviceable District",
        location: "Non-Serviceable Area",
        city: "Non-Serviceable Area",
        tier: "TIER 2",
        is_serviceable: false,
        serviceable_banks: [],
        partner: "FINNABLE",
        min_salary: 15000,
        mandatory_docs: ["Bank Statement (Last 3 Months) - Mandatory"],
        inquiry_rules: {
            max_acceptable_enquiries: 4,
            deviation_enquiries_range: "5 to 7 enquiries",
            rejection_enquiries_threshold: 7
        }
    };
}
