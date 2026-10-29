import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config();

const connection = process.env.DATABASE_URL || {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_SCHEMA || "foir_data"
};

const config = {
    development: {
        client: "pg",
        connection,
        pool: {
            min: 2,
            max: 10
        },
        migrations: {
            directory: "./migrations",
            tableName: "knex_migrations"
        }
    },
    production: {
        client: "pg",
        connection: process.env.DATABASE_URL || connection,
        pool: {
            min: 2,
            max: 10
        },
        migrations: {
            directory: "./migrations",
            tableName: "knex_migrations"
        }
    }
};

module.exports = config;
export default config;
