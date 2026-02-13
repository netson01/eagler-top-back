import { NextFunction, Request, Response, Router } from "express";
import OAuthRouter from "./OAuthRouter";
import ServersRouter from "./ServersRouter";
import UsersRouter from "./UsersRouter";
import AdminRouter from "./AdminRouter";
import { Admin, StringsOnly } from "../middleware";
import { logger } from "../utils";

const router = Router();

router.use((req: Request, _res: Response, next: NextFunction) => {
    if (process.env.VERBOSE_LOG)
        logger.info(
            `${req.method} ${req.path} - ${req.headers["user-agent"]}, ${req.ip}`
        );
    return next();
});
router.use("/oauth", StringsOnly, OAuthRouter);
router.use("/users", UsersRouter);
router.use("/servers", ServersRouter);
router.use("/admin", Admin, AdminRouter);

router.use((req: Request, res: Response, next: NextFunction) => {
    if (process.env.VERBOSE_LOG)
        logger.info(
            `${req.method} request received from ${
                req.ip
            } on an invalid endpoint. Request method: ${req.method.toString()}`
        );
    res.status(404).json({
        success: false,
        message: "Unknown endpoint.",
    });
    return next();
});

export default router;
