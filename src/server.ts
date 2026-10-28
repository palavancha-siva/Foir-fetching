import app from "./app";
import options from "../config/options";
import configOptions from "../config/configOptions";
import { db } from "./utils/dbUtil";
import { logger } from "./utils/logger";

const expressApp = typeof (app as any) === "function" ? (app as any) : ((app as any)?.default || app);
const activeOptions = (options as any)?.default || options;
const activeConfig = (configOptions as any)?.default || configOptions;

async function bootstrap() {
    try {
        await db.raw("SELECT 1;");
        logger.info("PostgreSQL database connection verified (Knex + Objection.js).");
    } catch (err: any) {
        logger.warn(`PostgreSQL connection failed: ${err.message}. Running in fallback mode.`);
    }

    const port = activeOptions?.port || 5104;
    const server = expressApp.listen(port, () => {
        logger.info(`=======================================================`);
        logger.info(`fin_crm_app running on http://localhost:${port}`);
        logger.info(`Gateway prefix mounted at: ${activeConfig?.defaultRouteURL || "/api/crm"}`);
        logger.info(`Environment: ${activeOptions?.nodeEnv || "development"}`);
        logger.info(`=======================================================`);
    });
    server.timeout = 300000;
    server.keepAliveTimeout = 65000;

    const shutdown = async () => {
        logger.info("Shutting down fin_crm_app gracefully...");
        server.close(async () => {
            await db.destroy();
            logger.info("Database pool closed. Exiting process.");
            process.exit(0);
        });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

bootstrap();
