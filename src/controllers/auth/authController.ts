import { Router } from "express";
import { authService } from "../../services/auth/authService";
import { loginSchema } from "../../schemas/auth/authSchema";
import { validateSchema } from "../../utils/validateSchema";
import { sendApiResponse, getOkResponse } from "../../utils/apiResponse";

export const authRouter = Router();

authRouter.post("/login", validateSchema(loginSchema, "BODY"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const result = await authService.loginStaff(req.body);
        return getOkResponse(result, 1, "Login successful");
    });
});

authRouter.post("/logout", (req: any, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const result = await authService.logoutStaff(req.sessionKey);
        return getOkResponse(result, 0, "Logged out successfully");
    });
});
