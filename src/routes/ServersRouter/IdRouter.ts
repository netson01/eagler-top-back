import prisma from "../../db";
import { Router, Request, Response } from "express";
import {
    ExplicitTypesOnFields,
    StringsOnly,
    User,
    Optional,
} from "../../middleware";
import { daysFromNow, validateCaptcha } from "../../utils";
import { WebSocket } from "ws";
import { createHash } from "crypto";
import { AnalyticType } from "@prisma/client";
import rateLimit from "express-rate-limit";

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

const router = Router({
    mergeParams: true,
});

router.get("/", Optional, async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
        select: {
            comments: {
                select: {
                    content: true,
                    poster: {
                        select: {
                            uuid: true,
                            username: true,
                            avatar: true,
                        },
                    },
                    postedAt: true,
                },
            },
            user: {
                select: {
                    uuid: true,
                    username: true,
                    avatar: true,
                },
            },
            uuid: true,
            name: true,
            description: true,
            address: true,
            discord: true,
            createdAt: true,
            updatedAt: true,
            disabled: true,
            approved: true,
            verified: true,
            tags: true,
            votes: true,
            code: true,
        },
    });

    if (!server)
        return res.status(404).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    if (server.disabled)
        return res.status(400).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    if (!req.user || req.user.uuid != server.user.uuid) delete server.code;

    if (!server.verified && (!req.user || req.user.uuid != server.user.uuid))
        return res.status(400).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    return res.json({
        success: true,
        message: "Successfully fetched data for this server.",
        data: server,
    });
});

router.get("/analytics", User, async (req: Request, res: Response) => {
    const yesterday = daysFromNow(-1);

    const playerCount = await prisma.analytic.findMany({
        where: {
            serverId: req.params.uuid,
            type: AnalyticType.PLAYER_COUNT,
            AND: {
                createdAt: {
                    gte: yesterday,
                },
            },
        },
        select: {
            data: true,
            createdAt: true,
        },
    });

    const uptimeCount = await prisma.analytic.findMany({
        where: {
            serverId: req.params.uuid,
            type: AnalyticType.UPTIME,
            AND: {
                createdAt: {
                    gte: yesterday,
                },
            },
        },
        select: {
            data: true,
            createdAt: true,
        },
    });

    if (
        (!playerCount && !uptimeCount) ||
        (playerCount.length == 0 && uptimeCount.length == 0)
    )
        return res.status(400).json({
            success: false,
            message:
                "Sorry, this server has no analytics/does not exist. If you just recently created your server, it will show up here in a bit",
        });

    return res.json({
        success: true,
        message: "Successfully retrieved analytics for the last 24 hours.",
        data: {
            playerCount: playerCount.map((pc, index) => {
                return {
                    playerCount: parseInt(pc.data),
                    createdAt: pc.createdAt,
                };
            }),
            uptime: uptimeCount.map((pc, index) => {
                return {
                    up: pc.data == "true" ? 1 : 0,
                    createdAt: pc.createdAt,
                };
            }),
        },
    });
});
router.get("/full", User, async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
        include: {
            comments: {
                select: {
                    content: true,
                    poster: {
                        select: {
                            uuid: true,
                            username: true,
                            avatar: true,
                        },
                    },
                    postedAt: true,
                },
            },
        },
    });

    if (server && req.user.admin)
        return res.json({
            success: true,
            message: "Successfully fetched data for this server.",
            data: server,
        });

    if (!server || server.disabled)
        return res.status(400).json({
            success: false,
            message: "Could not find a server with that UUID.",
        });

    if (server.owner !== req.user.uuid) {
        return res.status(403).json({
            success: false,
            message: "You do not have permission to view this information.",
        });
    }
    return res.json({
        success: true,
        message: "Successfully fetched data for this server.",
        data: server,
    });
});

router.post(
    "/",
    rateLimit({
        windowMs: 30 * 1000, // 30 seconds per comment
        max: 1,
        standardHeaders: true,
        legacyHeaders: false,
    }),
    StringsOnly,
    User,
    async (req: Request, res: Response) => {
        if (!req.body)
            return res.status(400).json({
                success: false,
                message: "Request did not contain a body.",
            });

        const { content, captcha } = req.body;

        if (!content || !captcha)
            return res.status(400).json({
                success: false,
                message: "The request was missing one or more required fields.",
            });

        if (content.length > 200)
            return res.status(400).json({
                success: false,
                message: "Comments may not exceed 200 characters.",
            });

        const server = await prisma.server.findUnique({
            where: {
                uuid: req.params.uuid,
            },
        });

        if (!server)
            return res.status(400).json({
                success: false,
                message: "Could not find a server with that UUID.",
            });

        if (!server.verified)
            return res.status(400).json({
                success: false,
                message: "You may not comment on an unverified server.",
            });

        try {
            await validateCaptcha(captcha);
        } catch (_) {
            return res.status(400).json({
                success: false,
                message: "Invalid CAPTCHA response.",
            });
        }

        const comment = await prisma.comment.create({
            data: {
                content,
                serverId: server.uuid,
                posterId: req.user.uuid,
            },
            select: {
                poster: {
                    select: {
                        uuid: true,
                        username: true,
                        avatar: true,
                    },
                },
                content: true,
                postedAt: true,
            },
        });

        return res.json({
            success: true,
            message: "Comment successfully posted.",
            data: comment,
        });
    }
);

router.put(
    "/",
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

        let { name, description, discord } = req.body;
        const tags: string[] = req.body.tags;

        if (!name && !description && !discord && !tags)
            return res.status(400).json({
                success: false,
                message: "No fields specified that can be updated.",
            });

        if (name && name.length > 100)
            return res.status(400).json({
                success: false,
                message: "The server name specified is too long!",
            });

        if (description && description.length > 1500)
            return res.status(400).json({
                success: false,
                message: "The server description specified is too long!",
            });

        if (discord && discord.length > 10)
            return res.status(400).json({
                success: false,
                message: "The Discord invite code specified is too long.",
            });

        if (tags && !Array.isArray(tags))
            return res.status(400).json({
                success: false,
                message: "Tags must be an array.",
            });

        if (tags)
            try {
                tags.forEach((tag) => {
                    if (!validTags.includes(tag)) throw new Error();
                });
            } catch (_) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid tags specified.",
                });
            }

        const server = await prisma.server.findUnique({
            where: {
                uuid: req.params.uuid,
            },
        });

        if (!server)
            return res.status(404).json({
                success: false,
                message: "A server with that UUID could not be found.",
            });

        if (server.disabled)
            return res.status(400).json({
                success: false,
                message: "A server with that UUID could not be found.",
            });

        if (server.owner !== req.user.uuid && !req.user.admin)
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to update other users' servers.",
            });

        name = name == "" ? server.name : name;

        const newServer = await prisma.server.update({
            where: {
                uuid: server.uuid,
            },
            data: {
                name,
                description: description ?? server.description,
                tags: tags ?? server.tags,
                discord: discord ?? server.discord,
                updatedAt: new Date(),
            },
        });

        return res.json({
            success: true,
            message: "Successfully updated server.",
            data: newServer,
        });
    }
);

router.post("/vote", User, async (req: Request, res: Response) => {
    if (!req.body)
        return res.status(400).json({
            success: false,
            message: "Request did not specify a body.",
        });

    const { captcha, value } = req.body;

    if (!captcha)
        return res.status(400).json({
            success: false,
            message:
                "One or more required fields in the request body were missing.",
        });

    try {
        await validateCaptcha(captcha);
    } catch (_) {
        return res.status(400).json({
            success: false,
            message: "Invalid CAPTCHA response.",
        });
    }

    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!server)
        return res.status(400).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    if (!server.verified)
        return res.status(400).json({
            success: false,
            message: "You may not vote for a server that is unverified.",
        });

    if (server.disabled)
        return res.status(400).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    const cooldown = await prisma.voteCooldown.findFirst({
        where: {
            userId: req.user.uuid,
            serverId: server.uuid,
        },
    });

    if (cooldown)
        return res.status(400).json({
            success: false,
            message: "You are currently on a vote cooldown.",
        });

    const updatedServer = await prisma.server.update({
        where: {
            uuid: server.uuid,
        },
        data: {
            votes: Boolean(value)
                ? {
                      increment: 1,
                  }
                : {
                      decrement: 1,
                  },
        },
        select: {
            votes: true,
        },
    });

    await prisma.voteCooldown.create({
        data: {
            userId: req.user.uuid,
            serverId: server.uuid,
            expiresAt: daysFromNow(1),
        },
    });

    return res.json({
        success: true,
        message:
            "Successfully voted for this server. You can vote again in 24 hours.",
        data: updatedServer,
    });
});

router.delete("/", User, async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!server)
        return res.status(400).json({
            success: false,
            message: "Could not find a server with that UUID.",
        });

    if (server.owner !== req.user.uuid && !req.user.admin)
        return res.status(403).json({
            success: false,
            message:
                "You do not have permission to delete other users' servers.",
        });

    await prisma.server.delete({
        where: {
            uuid: req.params.uuid,
        },
    });

    return res.json({
        success: true,
        message: "Successfully deleted server.",
    });
});

router.post("/verify", User, async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    const { captcha } = req.body;

    if (!captcha)
        return res.status(400).json({
            success: false,
            message: "Missing CAPTCHA from request body.",
        });

    try {
        await validateCaptcha(captcha);
    } catch (_) {
        return res.status(400).json({
            success: false,
            message: "Invalid CAPTCHA response.",
        });
    }

    if (!server)
        return res.status(404).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    if (server.verified)
        return res.status(400).json({
            success: false,
            message: "This server has already been verified.",
        });

    if (server.owner !== req.user.uuid && !req.user.admin)
        return res.status(403).json({
            success: false,
            message: "You do not have permission to verify this server.",
        });

    try {
        const ws = await new WebSocket(server.address);
        let shasum = createHash("sha1");
        let msg = "";
        ws.onopen = async () =>
            ws.send("Accept:" + shasum.update(server.code).digest("hex"));
        try {
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(reject, 1000);
                ws.onmessage = async (message) => {
                    msg = message.data.toString();
                    clearTimeout(timer);
                    resolve();
                };
                ws.onerror = reject;
            });
        } catch (_) {
            ws.close();
            return res.status(400).json({
                success: false,
                message: "Could not verify server, please try again.",
            });
        }
        ws.close();
        if (msg == "OK") {
            await prisma.server.update({
                where: {
                    uuid: server.uuid,
                },
                data: {
                    verified: true,
                },
            });
            return res.json({
                success: true,
                message: "Successfully verified server.",
            });
        } else {
            return res.status(400).json({
                success: false,
                message: "Could not verify server, please try again.",
            });
        }
    } catch (_) {
        return res.status(400).json({
            success: false,
            message: "Could not verify server, please try again.",
        });
    }
});

export default router;
