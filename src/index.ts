import { config } from "dotenv";
import prisma from "./db";
import listen from "./app";
import { logger } from "./utils";
config();

const requiredEnvVariables = [
    "DATABASE_URL",
    "PORT",
    "FRONTEND_URI",
    "RECAPTCHA_SECRET_KEY",
];

const errors = [];
for (const env of requiredEnvVariables)
    if (!process.env.hasOwnProperty(env)) errors.push(env);

if (errors.length > 0) {
    logger.error(`Missing environment variables: ${errors.join(", ")}`);
    logger.info(`Aborting startup...`);
    process.exit(255);
}

const verifyConnection = () =>
    new Promise<void>(async (resolve, reject) => {
        await prisma.user.findMany().catch(reject);
        resolve();
    });

verifyConnection().then(() => {
    logger.info("Established a connection to the database.");
    listen(parseInt(process.env.PORT!)).then(() =>
        logger.info(`Successfully running on port ${process.env.PORT!}`)
    );
});
