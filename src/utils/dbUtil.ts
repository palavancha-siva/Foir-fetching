import knex, { Knex } from "knex";
import { Model } from "objection";
import { Pool } from "pg";
import configOptions from "../../config/configOptions";
import options from "../../config/options";

const activeConfig = (configOptions as any)?.default || configOptions;
const activeOptions = (options as any)?.default || options;

// Initialize Knex instance
export const db: Knex = knex(activeConfig?.knexConfig || {
    client: "pg",
    connection: activeOptions?.databaseUrl || "postgresql://postgres:postgres@localhost:5432/foir_data",
    pool: { min: 2, max: 20 }
});

// Bind Objection to Knex
Model.knex(db);

// Legacy pool for pg direct queries if needed
let cachedPool: Pool | null = null;

export function createDatabasePool(_opts?: any): Pool {
    if (!cachedPool) {
        cachedPool = new Pool({
            connectionString: options.databaseUrl,
            ssl: options.postgresSslMode === "require" ? { rejectUnauthorized: false } : false
        });
    }
    return cachedPool;
}

export default db;
