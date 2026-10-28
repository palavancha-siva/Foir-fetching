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

        async upload(req, res) {
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

                const validRows = [];
                for (const row of rawRows) {
                    const pin = String(row.pincode || row.pin || row.pincodes || "").trim().replace(/\D/g, "");
                    const state = String(row.state || row.statename || "Telangana").trim();
                    const city = String(row.city || row.district || row.cityname || "Hyderabad").trim();
                    if (!pin || pin.length < 3) continue;

                    const tier = row.tier ? String(row.tier).toUpperCase().trim() : getCityTier(city);
                    const serviceable = row.serviceable === "0" || row.serviceable === "false" || row.serviceable === false ? 0 : 1;

                    validRows.push({
                        pincode: pin,
                        state,
                        city,
                        tier: tier === "TIER 1" ? "TIER 1" : "TIER 2",
                        serviceable_finnable: serviceable,
                        active: 1
                    });
                }

                const BATCH_SIZE = 1000;
                let inserted = 0;
                for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
                    const batch = validRows.slice(i, i + BATCH_SIZE);
                    await db("pincode_master")
                        .insert(batch)
                        .onConflict("pincode")
                        .merge(["state", "city", "tier", "serviceable_finnable", "active", "updated_at"]);
                    inserted += batch.length;
                }

                return res.json({
                    success: true,
                    message: `Successfully processed ${inserted} pincodes for partner serviceability.`,
                    count: inserted
                });
            } catch (err) {
                console.error("Pincode upload error:", err.message);
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload pincodes."
                });
            }
        }
    };
}

module.exports = createPincodeController;
