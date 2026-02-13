import prisma from "../../db";
import { Router, Request, Response } from "express";
import { ExplicitTypesOnFields, User } from "../../middleware";
import { randomString } from "../../utils";
import rateLimit from "express-rate-limit";
import IdRouter from "./IdRouter";

const validTags = [
    "PVP",
    "PVE",
    "FACTIONS",
    "MINIGAMES",
    "SURVIVAL",
    "CREATIVE",
    "SKYBLOCK",
    "PRISON",
    "RPG",
    "MISCELLANEOUS",
];
const router = Router();
const validWssRegex = /^(wss?:\/\/)([0-9]{1,3}(?:\.[0-9]{1,3}){3}|[^\/]+)/;

router.get("/", async (req: Request, res: Response) => {
    let limit: number = 25;
    let page: number = 0;
    if (req.query) {
        if (req.query.limit) limit = parseInt(req.query.limit as string);
        if (req.query.page) page = parseInt(req.query.page as string);
    }
    page = page * limit;
    const servers = await prisma.server.findMany({
        where: {
            disabled: false,
            verified: true,
        },
        select: {
            uuid: true,
            name: true,
            verified: true,
            approved: true,
            address: true,
            votes: true,
            tags: true,
            user: {
                select: {
                    uuid: true,
                    username: true,
                    avatar: true,
                },
            },
        },
        orderBy: {
            votes: "desc",
        },
        take: limit,
        skip: page,
    });

    return res.json({
        success: true,
        message: `Successfully retrieved ${servers.length} servers.`,
        data: servers,
    });
});

router.get("/@me", User, async (req: Request, res: Response) => {
    const servers = await prisma.server.findMany({
        where: {
            owner: req.user.uuid,
            disabled: false,
        },
    });

    return res.json({
        success: true,
        message: `Successfully retrieved ${servers.length} servers.`,
        data: servers,
    });
});

router.post(
    "/",
    rateLimit({
        windowMs: 5 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
    }),
    ExplicitTypesOnFields([
        {
            name: "name",
            type: "string",
        },
        {
            name: "description",
            type: "string",
        },
        {
            name: "address",
            type: "string",
        },
        {
            name: "discord",
            type: "string",
        },
        {
            name: "tags",
            type: "object",
        },
    ]),
    User,
    async (req: Request, res: Response) => {
        if (!req.body)
            return res.status(400).json({
                success: false,
                message: "Request did not contain a body.",
            });

        const { name, description, discord, address } = req.body;
        const tags: string[] = req.body.tags;

        if (!name || !description || !address || !tags)
            return res.status(400).json({
                success: false,
                message: "The request is missing one or more required fields.",
            });

        if (!validWssRegex.test(address))
            return res.status(400).json({
                success: false,
                message: "The address specified is invalid.",
            });

        if (name.length > 100)
            return res.status(400).json({
                success: false,
                message: "The server name specified is too long!",
            });

        if (description.length > 1500)
            return res.status(400).json({
                success: false,
                message: "The description specified is too long!",
            });

        if (discord && discord.length > 10)
            return res.status(400).json({
                success: false,
                message: "The Discord invite code specified is too long.",
            });

        const nameLookup = await prisma.server.findFirst({
            where: {
                owner: req.user.uuid,
                name: {
                    mode: "insensitive",
                    equals: name,
                },
            },
        });

        if (nameLookup)
            return res.status(400).json({
                success: false,
                message: "You cannot create two servers with the same name.",
            });

        const addressLookup = await prisma.server.findFirst({
            where: {
                address,
            },
        });

        if (addressLookup)
            return res.status(400).json({
                success: false,
                message: "A server already exists with this address.",
            });

        const servers = await prisma.server.findMany({
            where: {
                owner: req.user.uuid,
            },
        });

        if (servers.length >= 5)
            return res.status(400).json({
                success: false,
                message: "You cannot own more than 5 servers.",
            });

        if (tags && !Array.isArray(tags))
            return res.status(400).json({
                success: false,
                message: "Tags must be an array.",
            });

        try {
            tags.forEach((tag) => {
                if (!validTags.includes(tag)) throw new Error();
            });
        } catch (_) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid tags specified. Allowed values: " +
                    validTags.join(", "),
            });
        }

        const server = await prisma.server.create({
            data: {
                name,
                description,
                address,
                owner: req.user.uuid,
                discord: discord ?? null,
                tags,
                code: randomString(10, "0123456789abcdef"),
            },
        });

        return res.json({
            success: true,
            message: "The server was successfully created.",
            data: server,
        });
    }
);

router.use("/:uuid", IdRouter);

export default router;
