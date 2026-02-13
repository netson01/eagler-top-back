import express, { NextFunction, Request, Response } from "express";
import { logger } from "./utils";
import cookieParser from "cookie-parser";
import cors from "cors";
import RootRouter from "./routes";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.disable("x-powered-by"); // anti-skid (ish?)
app.use(
    cors({
        credentials: true,
        origin: [
            "http://localhost:3000", // development
            process.env.FRONTEND_URI,
        ],
        exposedHeaders: [
            "Retry-After",
            "RateLimit-Reset",
            "RateLimit-Limit",
            "RateLimit-Remaining",
        ],
    })
);
app.use((_err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.warn("Request contained malformed JSON data.");
    res.status(400).json({
        success: false,
        message:
            "Body of request contained malformed JSON data. Check your syntax.",
    });
});

app.use("/api", RootRouter);

export default function listen(port: number) {
    return new Promise<void>((resolve) => app.listen(port, resolve));
}
