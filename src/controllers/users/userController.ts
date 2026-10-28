import { Router } from "express";
import { userService } from "../../services/users/userService";
import { createUserSchema } from "../../schemas/users/userSchema";
import { validateSchema } from "../../utils/validateSchema";
import { authorizePermission } from "../../utils/permissionMiddleware";
import { sendApiResponse, getOkResponse } from "../../utils/apiResponse";

export const userRouter = Router();

userRouter.get("/", authorizePermission("users_read"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const users = await userService.listUsers(req.query);
        return getOkResponse(users, users.length, "Users retrieved successfully");
    });
});

userRouter.post("/", authorizePermission("users_write"), validateSchema(createUserSchema, "BODY"), (req, res, next) => {
    sendApiResponse(req, res, next, async () => {
        const user = await userService.createUser(req.body);
        return getOkResponse(user, 1, "User created successfully");
    });
});
