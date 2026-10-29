// @ts-nocheck
"use strict";

const { lookupPincode, ensurePincodeMasterTable, getCityTier, seedPincodes } = require("../services/pincodeService");
const { parseCsv } = require("../utils/csvParser");

function createPincodeController(state) {
    return {
        async lookup(req, res) {
            const pincode = String(req.query.pincode || req.query.pin || "").trim();
            if (!pincode) {
                return res.status(400).json({
                    success: false,
                    message: "A 6-digit PIN code is required."
                });
            }

            try {
                const pool = state.getPool ? state.getPool() : null;
                const result = await lookupPincode(pincode);
                return res.json({
                    success: true,
                    data: result
                });
            } catch (err) {
                console.error("Pincode lookup error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: "Pincode lookup failed."
                });
            }
        },

        async stats(req, res) {
            try {
                const { db } = require("../utils/dbUtil");
                await ensurePincodeMasterTable(db);
                const stats = await db("pincode_master")
                    .select("state", "tier")
                    .count("id as count")
                    .where({ active: 1 })
                    .groupBy("state", "tier")
                    .orderBy("state", "asc");

                const totalRes = await db("pincode_master")
                    .count("id as total")
                    .where({ active: 1 })
                    .first();

                return res.json({
                    success: true,
                    total: Number(totalRes?.total || 0),
                    stats
                });
            } catch (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }
        },

        async list(req, res) {
            try {
                const { db } = require("../utils/dbUtil");
                await ensurePincodeMasterTable(db);

                const page = Math.max(1, parseInt(req.query.page, 10) || 1);
                const limit = Math.min(200, Math.max(10, parseInt(req.query.limit, 10) || 50));
                const offset = (page - 1) * limit;

                const search = String(req.query.search || "").trim();
                const stateFilter = String(req.query.state || "").trim();
                const tierFilter = String(req.query.tier || "").trim();
                const serviceableFilter = req.query.serviceable !== undefined && req.query.serviceable !== ""
                    ? parseInt(req.query.serviceable, 10)
                    : null;

                let query = db("pincode_master").where({ active: 1 });

                if (search) {
                    query = query.where(builder => {
                        builder.where("pincode", "ilike", `%${search}%`)
                            .orWhere("city", "ilike", `%${search}%`)
                            .orWhere("state", "ilike", `%${search}%`);
                    });
                }

                if (stateFilter && stateFilter !== "all") {
                    query = query.where("state", "ilike", stateFilter);
                }

                if (tierFilter && tierFilter !== "all") {
                    query = query.where("tier", "ilike", tierFilter);
                }

                if (serviceableFilter !== null && !isNaN(serviceableFilter)) {
                    query = query.where("serviceable_finnable", serviceableFilter);
                }

                const countRes = await query.clone().count("id as total").first();
                const total = parseInt(countRes?.total || 0, 10);

                const items = await query
                    .select("id", "pincode", "location", "region", "city", "state", "tier", "serviceable_finnable", "active", "updated_at")
                    .orderBy("state", "asc")
                    .orderBy("city", "asc")
                    .orderBy("pincode", "asc")
                    .limit(limit)
                    .offset(offset);

                const pins = items.map(i => i.pincode);
                const servRows = pins.length > 0
                    ? await db("bank_pincode_serviceability")
                        .whereIn("pincode", pins)
                        .andWhere({ is_serviceable: 1 })
                        .select("bank_name", "pincode")
                    : [];

                const bankMap = {};
                servRows.forEach(sr => {
                    if (!bankMap[sr.pincode]) bankMap[sr.pincode] = [];
                    bankMap[sr.pincode].push(sr.bank_name);
                });

                items.forEach(it => {
                    it.location = it.location || it.city;
                    it.region = it.region || it.city;
                    it.serviceable_banks = bankMap[it.pincode] || (it.serviceable_finnable === 1 ? ["FINNABLE"] : []);
                });

                const availableStates = await db("pincode_master")
                    .distinct("state")
                    .where({ active: 1 })
                    .orderBy("state", "asc")
                    .pluck("state");

                return res.json({
                    success: true,
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit) || 1,
                    availableStates: availableStates || [],
                    items: items || []
                });
            } catch (err) {
                console.error("Pincode list error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to load pincodes."
                });
            }
        },

        async toggleServiceable(req, res) {
            try {
                const { db } = require("../utils/dbUtil");
                const id = parseInt(req.params.id, 10);
                if (!id) return res.status(400).json({ success: false, message: "Invalid ID." });
                const row = await db("pincode_master").where({ id }).first();
                if (!row) return res.status(404).json({ success: false, message: "Pincode not found." });

                const newStatus = row.serviceable_finnable === 1 ? 0 : 1;
                await db("pincode_master").where({ id }).update({
                    serviceable_finnable: newStatus,
                    updated_at: db.fn.now()
                });

                // Also update bank_pincode_serviceability for FINNABLE
                await db("bank_pincode_serviceability")
                    .insert({
                        bank_name: "FINNABLE",
                        pincode: row.pincode,
                        is_serviceable: newStatus,
                        updated_at: db.fn.now()
                    })
                    .onConflict(["bank_name", "pincode"])
                    .merge(["is_serviceable", "updated_at"]);

                return res.json({
                    success: true,
                    message: `Pincode ${row.pincode} serviceability updated to ${newStatus === 1 ? "Serviceable" : "Non-Serviceable"}.`,
                    serviceable: newStatus
                });
            } catch (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
        },

        async addState(req, res) {
            try {
                const { db } = require("../utils/dbUtil");
                await ensurePincodeMasterTable(db);

                const stateName = String(req.body.stateName || req.body.state || "").trim();
                const pin = String(req.body.pincode || req.body.pin || "").trim().replace(/\D/g, "");
                const location = String(req.body.location || req.body.city || stateName).trim();
                const region = String(req.body.region || location).trim();
                const tier = req.body.tier === "TIER 1" ? "TIER 1" : (getCityTier(location, region) || "TIER 2");

                if (!stateName) {
                    return res.status(400).json({ success: false, message: "State name is required." });
                }
                if (!pin || pin.length < 5 || pin.length > 6) {
                    return res.status(400).json({ success: false, message: "A valid 6-digit PIN code is required to initialize the state." });
                }

                await db("pincode_master")
                    .insert({
                        pincode: pin,
                        state: stateName,
                        city: location,
                        location: location,
                        region: region,
                        tier: tier,
                        serviceable_finnable: 1,
                        active: 1
                    })
                    .onConflict("pincode")
                    .merge(["state", "city", "location", "region", "tier", "active", "updated_at"]);

                await db("bank_pincode_serviceability")
                    .insert({
                        bank_name: "FINNABLE",
                        pincode: pin,
                        is_serviceable: 1,
                        updated_at: db.fn.now()
                    })
                    .onConflict(["bank_name", "pincode"])
                    .merge(["is_serviceable", "updated_at"]);

                return res.json({
                    success: true,
                    message: `State "${stateName}" and initial PIN ${pin} added successfully.`
                });
            } catch (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
        },

        async editState(req, res) {
            try {
                const { db } = require("../utils/dbUtil");
                const stateName = decodeURIComponent(String(req.params.stateName || "").trim());
                if (!stateName || stateName === "all") {
                    return res.status(400).json({ success: false, message: "Select a valid state to edit." });
                }

                const newStateName = req.body.newStateName ? String(req.body.newStateName).trim() : "";
                const newTier = req.body.tier ? String(req.body.tier).trim() : "";

                const updates = { updated_at: db.fn.now() };
                if (newStateName) updates.state = newStateName;
                if (newTier === "TIER 1" || newTier === "TIER 2") updates.tier = newTier;

                const count = await db("pincode_master")
                    .where("state", "ilike", stateName)
                    .update(updates);

                return res.json({
                    success: true,
                    message: `Successfully updated ${count} records for state "${newStateName || stateName}".`,
                    updatedCount: count
                });
            } catch (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
        },

        async deleteState(req, res) {
            try {
                const { db } = require("../utils/dbUtil");
                const stateName = decodeURIComponent(String(req.params.stateName || "").trim());
                if (!stateName || stateName === "all") {
                    return res.status(400).json({ success: false, message: "Select a valid state to delete." });
                }

                const pins = await db("pincode_master")
                    .where("state", "ilike", stateName)
                    .pluck("pincode");

                if (pins.length > 0) {
                    await db("bank_pincode_serviceability")
                        .whereIn("pincode", pins)
                        .delete();
                }

                const deletedCount = await db("pincode_master")
                    .where("state", "ilike", stateName)
                    .delete();

                return res.json({
                    success: true,
                    message: `Successfully deleted all ${deletedCount} PIN codes for state "${stateName}".`
                });
            } catch (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
        },

        async editPincode(req, res) {
            try {
                const { db } = require("../utils/dbUtil");
                const id = parseInt(req.params.id, 10);
                if (!id) return res.status(400).json({ success: false, message: "Invalid ID." });

                const location = String(req.body.location || req.body.city || "").trim();
                const region = String(req.body.region || location).trim();
                const state = String(req.body.state || "").trim();
                const tier = req.body.tier === "TIER 1" ? "TIER 1" : "TIER 2";

                const updates = { updated_at: db.fn.now() };
                if (location) {
                    updates.location = location;
                    updates.city = location;
                }
                if (region) updates.region = region;
                if (state) updates.state = state;
                if (tier) updates.tier = tier;

                await db("pincode_master").where({ id }).update(updates);

                return res.json({
                    success: true,
                    message: "PIN code details updated successfully."
                });
            } catch (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
        },

        async uploadMaster(req, res) {
            const csvContent = req.body && (req.body.csvContent || req.body.csv || req.body.fileContent);
            if (!csvContent || typeof csvContent !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "CSV content is required."
                });
            }

            try {
                const { db } = require("../utils/dbUtil");
                await ensurePincodeMasterTable(db);
                const rawRows = parseCsv(csvContent);

                if (rawRows.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "The uploaded CSV file is empty or formatted incorrectly."
                    });
                }

                const defaultState = String(req.body.defaultState || req.body.state || req.body.targetState || "").trim();
                const hasDefaultState = Boolean(defaultState && defaultState.toLowerCase() !== "auto");

                const pinMap = new Map();
                for (const row of rawRows) {
                    const pin = String(row.pincode || row.pin || row.pin_code || row.postal_code || "").trim().replace(/\D/g, "");
                    if (!pin || pin.length < 3 || pin.length > 6) continue;

                    let location = String(
                        row.division ||
                        row.location ||
                        row.officename ||
                        row.office ||
                        row.city ||
                        row.town ||
                        row.mandal ||
                        row.area ||
                        row.location_name ||
                        "Unknown"
                    ).trim().replace(/\s+Division$/i, "").slice(0, 140);

                    let region = String(
                        row.region ||
                        row.regionname ||
                        row.district ||
                        row.districtname ||
                        row.district_name ||
                        location
                    ).trim().replace(/\s+Region$/i, "").slice(0, 140);

                    const rawState = String(
                        row.state ||
                        row.statename ||
                        row.state_name ||
                        row.circle ||
                        row.circlename ||
                        ""
                    ).trim().replace(/\s+Circle$/i, "").slice(0, 95);

                    let state = rawState;
                    if (!state || state.toLowerCase() === "unknown") {
                        state = hasDefaultState ? defaultState : "Telangana";
                    }

                    if ((!location || location === "Unknown") && row.division) {
                        location = String(row.division).replace(/\s+Division$/i, "").trim().slice(0, 140);
                    }

                    // Apply rule: Tier 1 cities list => TIER 1, all others => TIER 2
                    const tier = getCityTier(location, region);

                    if (pinMap.has(pin)) {
                        const existing = pinMap.get(pin);
                        if (tier === "TIER 1" && existing.tier !== "TIER 1") {
                            existing.tier = "TIER 1";
                            existing.location = location;
                            existing.region = region;
                        }
                    } else {
                        pinMap.set(pin, {
                            pincode: pin,
                            location,
                            region,
                            city: location,
                            state,
                            tier,
                            serviceable_finnable: 1,
                            active: 1
                        });
                    }
                }

                const validRows = Array.from(pinMap.values());

                const BATCH_SIZE = 1000;
                let inserted = 0;
                for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
                    const batch = validRows.slice(i, i + BATCH_SIZE);
                    await db("pincode_master")
                        .insert(batch)
                        .onConflict("pincode")
                        .merge(["location", "region", "city", "state", "tier", "active", "updated_at"]);
                    inserted += batch.length;
                }

                return res.json({
                    success: true,
                    message: `Successfully processed ${inserted} unique master pincodes with auto-assigned Tiers.`,
                    count: inserted
                });
            } catch (err) {
                console.error("Master pincode upload error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: err.message || "Failed to upload master pincodes."
                });
            }
        },

        async uploadBankServiceability(req, res) {
            const bankName = String(req.body.bank_name || req.body.bank || "").trim().toUpperCase();
            const csvContent = req.body && (req.body.csvContent || req.body.csv || req.body.fileContent);

            if (!bankName) {
                return res.status(400).json({
                    success: false,
                    message: "A target bank name is required (e.g. FINNABLE, POONAWALLA FINCORP, INCRID)."
                });
            }
            if (!csvContent || typeof csvContent !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "CSV content with serviceable pincodes is required."
                });
            }

            try {
                const { db } = require("../utils/dbUtil");
                await ensurePincodeMasterTable(db);
                const rawRows = parseCsv(csvContent);

                if (rawRows.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "The uploaded CSV file is empty or formatted incorrectly."
                    });
                }

                const pinMap = new Map();
                for (const row of rawRows) {
                    const pin = String(row.pincode || row.pin || row.pin_code || row.postal_code || "").trim().replace(/\D/g, "");
                    if (!pin || pin.length < 3 || pin.length > 6) continue;

                    const servRaw = row.serviceable !== undefined ? row.serviceable : (row.status !== undefined ? row.status : 1);
                    const isServ = (servRaw === "0" || servRaw === "false" || servRaw === false || servRaw === "no" || servRaw === "No") ? 0 : 1;

                    pinMap.set(pin, {
                        bank_name: bankName,
                        pincode: pin,
                        is_serviceable: isServ
                    });
                }

                const validRows = Array.from(pinMap.values());

                const BATCH_SIZE = 1000;
                let inserted = 0;
                for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
                    const batch = validRows.slice(i, i + BATCH_SIZE);
                    await db("bank_pincode_serviceability")
                        .insert(batch)
                        .onConflict(["bank_name", "pincode"])
                        .merge(["is_serviceable", "updated_at"]);
                    inserted += batch.length;
                }

                // If FINNABLE, also sync pincode_master for backward compatibility
                if (bankName === "FINNABLE") {
                    const servPins = validRows.filter(r => r.is_serviceable === 1).map(r => r.pincode);
                    if (servPins.length > 0) {
                        await db("pincode_master")
                            .whereIn("pincode", servPins)
                            .update({ serviceable_finnable: 1 });
                    }
                }

                return res.json({
                    success: true,
                    message: `Successfully updated ${inserted} serviceable locations for ${bankName}.`,
                    count: inserted,
                    bank_name: bankName
                });
            } catch (err) {
                console.error("Bank serviceability upload error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload bank serviceability list."
                });
            }
        },

        async upload(req, res) {
            // Unified upload: if bank_name is provided, delegates to uploadBankServiceability, else uploadMaster
            if (req.body && req.body.bank_name) {
                return this.uploadBankServiceability(req, res);
            }
            return this.uploadMaster(req, res);
        }
    };
}

module.exports = createPincodeController;
