import knex, { Knex } from "knex";
import options from "../../config/options";

const activeOptions = (options as any)?.default || options;
let knexInstance: Knex | null = null;

export function getKnex(): Knex | null {
    if (!knexInstance && activeOptions?.databaseUrl) {
        knexInstance = knex({
            client: "pg",
            connection: activeOptions.databaseUrl,
            pool: {
                min: 2,
                max: 10
            }
        });
    }
    return knexInstance;
}

module.exports = {
    getKnex,
    get knex() { return getKnex(); }
};
