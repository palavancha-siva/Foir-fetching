import options from "./options";
import type { Knex } from "knex";

export interface ConfigOptions {
    defaultRouteURL: string;
    apiPrefix: string;
    knexConfig: Knex.Config;
}

const configOptions: ConfigOptions = {
    defaultRouteURL: process.env.DEFAULT_ROUTE_URL || "/api/crm",
    apiPrefix: "/api",
    knexConfig: {
        client: "pg",
        connection: options.databaseUrl,
        pool: {
            min: 2,
            max: 20
        }
    }
};

module.exports = configOptions;
(module.exports as any).default = configOptions;
export default configOptions;
