// @ts-nocheck
"use strict";

const systemService = require("../services/systemService");

function createSystemController(state) {
    return {
        async health(_req, res) {
            return res.json(await systemService.getHealth(state.pool));
        },

        banks(_req, res) {
            return res.json(systemService.getBankNames(state.bankConfigs));
        }
    };
}

module.exports = createSystemController;

