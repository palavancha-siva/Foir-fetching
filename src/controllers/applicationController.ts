// @ts-nocheck
"use strict";

const {
    evaluateApplication,
    getApplicationHistory
} = require("../services/applicationService");

function createApplicationController(state) {
    return {
        async evaluate(req, res) {
            try {
                const result = await evaluateApplication(req.body || {}, state);
                return res.json(result);
            } catch (error) {
                console.error("Evaluation error:", error.message);
                return res.status(500).json({
                    error: "Could not evaluate application. Check server logs."
                });
            }
        },

        async history(_req, res) {
            try {
                return res.json(await getApplicationHistory(state));
            } catch (error) {
                console.error("History error:", error.message);
                return res.status(500).json({
                    error: "Could not load application history."
                });
            }
        }
    };
}

module.exports = createApplicationController;

