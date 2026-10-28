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
    city: string;
    tier: "TIER 1" | "TIER 2";
    is_serviceable: boolean;
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
    "pune",
    "ahmedabad",
    "kolkata"
];

export function getCityTier(cityName: string): "TIER 1" | "TIER 2" {
    const clean = String(cityName || "").trim().toLowerCase();
    if (!clean) return "TIER 2";
    const isTier1 = TIER_1_CITIES.some(t => clean === t || clean.includes(t) || t.includes(clean));
    return isTier1 ? "TIER 1" : "TIER 2";
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

    // Seed key pincodes if empty
    const countRes = await k("pincode_master").count<{ count: string }>("id as count").first();
    const count = Number(countRes?.count || 0);

    if (count === 0) {
        await seedPincodes(k);
    }

    tableEnsured = true;
}

export async function seedPincodes(k: Knex = defaultDb): Promise<void> {
    const seedRows: PincodeRecord[] = [];

    // Helper to generate range
    const addRange = (start: number, count: number, state: string, city: string) => {
        const tier = getCityTier(city);
        for (let i = 0; i < count; i++) {
            const pin = String(start + i);
            seedRows.push({
                pincode: pin,
                state,
                city,
                tier,
                serviceable_finnable: 1,
                active: 1
            });
        }
    };

    // 1. Telangana Cities (As specified by User)
    addRange(500001, 160, "Telangana", "Hyderabad"); // 160 pin codes (Tier 1)
    addRange(506167, 8, "Telangana", "Jangoan");      // 8 pin codes (Tier 2)
    addRange(503111, 11, "Telangana", "Kamareddy");   // 11 pin codes (Tier 2)
    addRange(507001, 25, "Telangana", "Khammam");     // 25 pin codes (Tier 2)
    addRange(508206, 6, "Telangana", "Kodad");        // 6 pin codes (Tier 2)
    addRange(507101, 4, "Telangana", "Kothagudem");   // 4 pin codes (Tier 2)
    addRange(504208, 17, "Telangana", "Mancherial");  // 17 pin codes (Tier 2)
    addRange(502110, 19, "Telangana", "Medak");       // 19 pin codes (Tier 2)
    addRange(508001, 9, "Telangana", "Nalgonda");     // 9 pin codes (Tier 2)
    addRange(507115, 2, "Telangana", "Palwancha");    // 2 pin codes (Tier 2)
    addRange(502001, 14, "Telangana", "Sangareddy");  // 14 pin codes (Tier 2)
    addRange(507303, 4, "Telangana", "Sathupalli");   // 4 pin codes (Tier 2)
    addRange(502103, 12, "Telangana", "Siddipet");    // 12 pin codes (Tier 2)
    addRange(506001, 36, "Telangana", "Warangal");    // 36 pin codes (Tier 2)
    addRange(507111, 4, "Telangana", "Bhadrachalam"); // 4 pin codes (Tier 2)

    // 2. Andhra Pradesh Cities (As specified by User)
    addRange(515001, 43, "Andhra Pradesh", "Ananthapur");     // 43 pin codes (Tier 2)
    addRange(522101, 6, "Andhra Pradesh", "Bapatla");         // 6 pin codes (Tier 2)
    addRange(534201, 27, "Andhra Pradesh", "Bhimavaram");     // 27 pin codes (Tier 2)
    addRange(517001, 80, "Andhra Pradesh", "Chittoor");       // 80 pin codes (Tier 2)
    addRange(516003, 2, "Andhra Pradesh", "Cuddapah");        // 2 pin codes (Tier 2)
    addRange(534001, 78, "Andhra Pradesh", "Eluru");          // 78 pin codes (Tier 2)
    addRange(521101, 12, "Andhra Pradesh", "Gannavaram");     // 12 pin codes (Tier 2)
    addRange(521301, 2, "Andhra Pradesh", "Gudivada");        // 2 pin codes (Tier 2)
    addRange(522001, 19, "Andhra Pradesh", "Guntur");         // 19 pin codes (Tier 2)
    addRange(516001, 83, "Andhra Pradesh", "Kadapa");         // 83 pin codes (Tier 2)
    addRange(533001, 68, "Andhra Pradesh", "Kakinada");       // 68 pin codes (Tier 2)
    addRange(518001, 47, "Andhra Pradesh", "Kurnool");        // 47 pin codes (Tier 2)
    addRange(524001, 32, "Andhra Pradesh", "Nellore");        // 32 pin codes (Tier 2)
    addRange(523001, 9, "Andhra Pradesh", "Ongole");          // 9 pin codes (Tier 2)
    addRange(533101, 50, "Andhra Pradesh", "Rajahmundry");    // 50 pin codes (Tier 2)
    addRange(517501, 21, "Andhra Pradesh", "Tirupati");       // 21 pin codes (Tier 2)
    addRange(520001, 100, "Andhra Pradesh", "Vijayawada");    // 100 pin codes (Tier 2)
    addRange(530001, 86, "Andhra Pradesh", "Vishakapatnam");  // 86 pin codes (Tier 2)
    addRange(535001, 28, "Andhra Pradesh", "Vizianagaram");   // 28 pin codes (Tier 2)

    // 3. Other Tier 1 Metros (Mumbai, Bangalore, Chennai, Pune, Delhi-NCR, Ahmedabad, Kolkata)
    addRange(400001, 100, "Maharashtra", "Mumbai");          // Tier 1
    addRange(560001, 100, "Karnataka", "Bangalore");         // Tier 1
    addRange(600001, 100, "Tamil Nadu", "Chennai");          // Tier 1
    addRange(411001, 60, "Maharashtra", "Pune");             // Tier 1
    addRange(110001, 90, "Delhi", "Delhi-NCR");              // Tier 1
    addRange(122001, 20, "Haryana", "Delhi-NCR");            // Tier 1 (Gurgaon)
    addRange(201301, 20, "Uttar Pradesh", "Delhi-NCR");      // Tier 1 (Noida)
    addRange(380001, 60, "Gujarat", "Ahmedabad");            // Tier 1
    addRange(700001, 100, "West Bengal", "Kolkata");         // Tier 1

    // Batch insert into database
    const BATCH_SIZE = 1000;
    for (let i = 0; i < seedRows.length; i += BATCH_SIZE) {
        const batch = seedRows.slice(i, i + BATCH_SIZE);
        await k("pincode_master")
            .insert(batch)
            .onConflict("pincode")
            .ignore();
    }
}

/**
 * Looks up any 6-digit PIN code.
 * Falls back to prefix matching (first 3 digits for Telangana/AP/Metros) if exact 6-digit is not found.
 */
export async function lookupPincode(pincodeRaw: string, k: Knex = defaultDb): Promise<PincodeLookupResult> {
    await ensurePincodeMasterTable(k);

    const pin = String(pincodeRaw || "").trim().replace(/\D/g, "");

    if (!pin || pin.length < 3 || pin.length > 6) {
        return {
            pincode: pin,
            found: false,
            state: "Unknown",
            city: "Unknown",
            tier: "TIER 2",
            is_serviceable: false,
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
        return {
            pincode: exact.pincode,
            found: true,
            state: exact.state,
            city: exact.city,
            tier: exact.tier as "TIER 1" | "TIER 2",
            is_serviceable: exact.serviceable_finnable === 1,
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
        return {
            pincode: pin,
            found: true,
            state: prefixMatch.state,
            city: prefixMatch.city,
            tier: prefixMatch.tier as "TIER 1" | "TIER 2",
            is_serviceable: prefixMatch.serviceable_finnable === 1,
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
        city: "Non-Serviceable Area",
        tier: "TIER 2",
        is_serviceable: false,
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
