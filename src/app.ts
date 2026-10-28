import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import options from "../config/options";
import configOptions from "../config/configOptions";
import { correlationMiddleware } from "./utils/correlation";
import { decryptionMiddleware, encryptionMiddleware } from "./encryption/encryption";
import { requestInfo } from "./utils/logger";
import { staffAuthProtected, customerAuthProtected, optionalCustomerAuth } from "./utils/jwt";
import { internalAuthProtected } from "./utils/internalAuth";
import { errorHandler } from "./utils/errorHandler";
import { getErrorResponse } from "./utils/apiResponse";

// Routers
import { healthCheckRouter } from "./controllers/healthCheckController";
import { authRouter } from "./controllers/auth/authController";
import { loanRouter } from "./controllers/loans/loanController";
import { companyRouter } from "./controllers/loans/companyController";
import { staffRouter } from "./controllers/staff/staffController";
import { userRouter } from "./controllers/users/userController";
import { matrixRouter } from "./controllers/settings/matrixController";
import { portalRouter } from "./controllers/portal/portalController";
import { inboxInternalRouter } from "./controllers/inbox/inboxInternalController";

const app = express();

// ============================================================
// 1. CORS, JSON (1MB), BAD-JSON HANDLER, HELMET
// ============================================================
app.use(cors({
    origin: options.corsOrigin === "*" ? true : options.corsOrigin,
    credentials: true,
    exposedHeaders: ["x-correlation-id"]
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Bad-JSON syntax & entity too large handler
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err && (err.type === "entity.too.large" || err.status === 413)) {
        return res.status(413).json(getErrorResponse("The uploaded file is too large (maximum allowed size is 50MB).", 413));
    }
    if (err instanceof SyntaxError && "body" in err) {
        return res.status(400).json(getErrorResponse("Malformed JSON in request body.", 400));
    }
    next(err);
});

app.use(helmet({
    contentSecurityPolicy: false // Allow local admin/SPA resources
}));

// ============================================================
// 2. CORRELATION MIDDLEWARE (x-correlation-id)
// ============================================================
app.use(correlationMiddleware);

// ============================================================
// 3. DECRYPTION MIDDLEWARE (AES-256-GCM)
// ============================================================
app.use(decryptionMiddleware);

// ============================================================
// 4. REQUEST INFO (LOGGING)
// ============================================================
app.use(requestInfo);

// ============================================================
// 8. RESPONSE ENCRYPTION STAGE
// ============================================================
app.use(encryptionMiddleware);

// Backend REST API - Pure JSON responses

// ============================================================
// 5 & 6. ROUTE MOUNTING UNDER defaultRouteURL ("/api/crm")
// ============================================================
const crmRouter = express.Router();

// A. Public Routes: /check, /auth, /loans/companies
crmRouter.use("/", healthCheckRouter);
crmRouter.use("/auth", authRouter);
crmRouter.use("/loans/companies", companyRouter);

// B. Customer Portal:
// /portal/eligibility -> optionalCustomerAuth + rate limit
// /portal/* -> customerAuthProtected
crmRouter.use("/portal", (req, res, next) => {
    if (req.path === "/eligibility" || req.path.startsWith("/eligibility/")) {
        return optionalCustomerAuth(req, res, next);
    }
    return customerAuthProtected(req, res, next);
}, portalRouter);

// C. Internal Service-to-Service: /internal/* -> internalAuthProtected
crmRouter.use("/internal/inbox", internalAuthProtected, inboxInternalRouter);

// D. Staff Protected Routes: /users, /kyc, /loans, /staff, /dashboard, /settings, /branches
crmRouter.use("/users", staffAuthProtected, userRouter);
crmRouter.use("/loans", staffAuthProtected, loanRouter);
crmRouter.use("/staff", staffAuthProtected, staffRouter);
crmRouter.use("/settings/matrix", staffAuthProtected, matrixRouter);

// Mount under configured prefix: /api/crm
app.use(configOptions.defaultRouteURL, crmRouter);

// Frontend LoanSense API router (/api/health, /api/companies, /api/company-mappings, /api/foir/calculate, /api/admin/*)
import createApiRouter from "./routes";
import { BANK_CONFIGS } from "./constants/bankConfigs";
import { createDatabasePool } from "./utils/dbUtil";

const frontendApiRouter = createApiRouter({
    get pool() { return createDatabasePool(); },
    memoryStore: { applications: [], decisions: [] },
    BANK_CONFIGS,
    adminApiToken: options.adminApiToken
});

app.use(frontendApiRouter);



// Friendly redirect for browser visits to /admin or / on backend port 5104
app.get(["/admin", "/admin/"], (_req, res) => {
    res.redirect("http://localhost:3000/admin");
});

app.get("/", (_req, res) => {
    res.redirect("http://localhost:3000/");
});

// ============================================================
// 9. 404 HANDLER & GLOBAL ERROR HANDLER
// ============================================================
app.use((req, res) => {
    res.status(404).json(getErrorResponse(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404));
});

app.use(errorHandler);

module.exports = app;
module.exports.default = app;
export default app;
