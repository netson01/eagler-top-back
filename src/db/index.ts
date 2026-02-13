import { PrismaClient, User, Session } from "@prisma/client";
const prisma = new PrismaClient();

declare global {
    namespace Express {
        interface Request {
            user?: User;
            session?: Session;
        }
    }
}

export default prisma;
