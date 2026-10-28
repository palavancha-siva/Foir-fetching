import { Knex } from "knex";
import { db as defaultDb } from "../utils/dbUtil";

function getKnex(dbOrPool?: any): Knex | null {
    if (dbOrPool && typeof dbOrPool === "function" && typeof dbOrPool.raw === "function") {
        return dbOrPool as Knex;
    }
    if (dbOrPool) {
        return defaultDb;
    }
    return null;
}

export async function getHealth(dbOrPool: any) {
    let database = "disconnected";

    if (dbOrPool) {
        try {
            const k = getKnex(dbOrPool);
            if (k) {
                await k.raw("SELECT 1");
                database = "connected";
            }
        } catch (_error) {
            database = "error";
        }
    }

    return {
        status: "ok",
        database,
        mode: dbOrPool ? "postgresql" : "demo"
    };
}

export function getBankNames(bankConfigs: any[]) {
    return bankConfigs.map(bankConfig => bankConfig.name);
}

module.exports = { getHealth, getBankNames };
