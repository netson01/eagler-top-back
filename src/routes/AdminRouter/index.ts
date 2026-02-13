import { Router } from "express";
import ServersRouter from "./ServersRouter";

const router = Router();

router.use("/servers", ServersRouter);

export default router;
