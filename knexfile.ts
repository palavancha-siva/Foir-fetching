import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config();

const config = {
    development: {
        client: "pg",
        connection: process.env.DATABASE_URL || {
            host: "localhost",
            port: 5432,
            user: "postgres",
            database: "foir data"
        },
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
        connection: process.env.DATABASE_URL,
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
