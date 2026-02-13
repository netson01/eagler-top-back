import prisma from "../db";
import { Router, Request, Response } from "express";
import { Admin, User } from "../middleware";

const router = Router();

router.get("/@me", User, async (req: Request, res: Response) => {
    return res.json({
        success: true,
        data: req.user,
    });
});

router.get("/:uuid", async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
        where: {
            uuid: req.params.uuid,
        },
        include: {
            servers: {
                where: {
                    disabled: false,
                },
                select: {
                    uuid: true,
                    name: true,
                    address: true,
                    votes: true,
                    disabled: true,
                    verified: true,
                    createdAt: true,
                },
            },
            comments: {
                where: {
                    server: {
                        disabled: false,
                    },
                },
                select: {
                    content: true,
                    postedAt: true,
                    poster: {
                        select: {
                            uuid: true,
                            username: true,
                            avatar: true,
                        },
                    },
                    server: {
                        select: {
                            uuid: true,
                            name: true,
                        },
                    },
                },
                orderBy: {
                    postedAt: "desc",
                },
                take: 10,
            },
        },
    });

    if (!user)
        return res.status(400).json({
            success: false,
            message: "A user with that UUID could not be found.",
        });

    return res.json({
        success: true,
        message: "Successfully grabbed data for that user.",
        data: user,
    });
});

router.get("/:uuid/full", Admin, async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
        where: {
            uuid: req.params.uuid,
        },
        include: {
            servers: {
                select: {
                    uuid: true,
                    name: true,
                    address: true,
                    verified: true,
                    approved: true,
                    disabled: true,
                    votes: true,
                },
            },
        },
    });

    if (!user)
        return res.status(400).json({
            success: false,
            message: "A user with that UUID could not be found.",
        });

    return res.json({
        success: true,
        message: "Successfully fetched data for that user.",
        data: user,
    });
});

router.delete("/:uuid", Admin, async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!user)
        return res.status(400).json({
            success: false,
            message: "A user with that UUID could not be found.",
        });

    if (user.admin)
        return res.status(403).json({
            success: false,
            message: "Admin accounts cannot be deleted via this endpoint.",
        });

    await prisma.user.delete({
        where: {
            uuid: req.params.uuid,
        },
    });

    return res.json({
        success: true,
        message: "Successfully deleted that user.",
    });
});

router.post("/:uuid/ban", Admin, async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!user)
        return res.status(400).json({
            success: false,
            message: "A user with that UUID could not be found.",
        });

    if (user.admin)
        return res.status(400).json({
            success: false,
            message: "You cannot ban this user, as this user is an admin.",
        });

    if (user.banned)
        return res.status(400).json({
            success: false,
            message: "You cannot ban a user who is already banned.",
        });

    let reason;
    if (!req.body) reason = "No reason specified.";

    reason = req.body.reason;

    await prisma.user.update({
        where: {
            uuid: user.uuid,
        },
        data: {
            banned: true,
            banReason: reason,
            updatedAt: new Date(),
        },
    });

    await prisma.session.deleteMany({
        where: {
            userId: user.uuid,
        },
    });

    await prisma.server.updateMany({
        where: {
            owner: user.uuid,
        },
        data: {
            disabled: true,
            updatedAt: new Date(),
        },
    });

    await prisma.comment.deleteMany({
        where: {
            posterId: user.uuid,
        },
    });

    return res.json({
        success: true,
        message: "This user has successfully been banned.",
    });
});

router.post("/:uuid/unban", Admin, async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!user)
        return res.status(400).json({
            success: false,
            message: "A user with that UUID could not be found.",
        });

    if (!user.banned)
        return res.status(400).json({
            success: false,
            message: "This user is not banned.",
        });

    await prisma.user.update({
        where: {
            uuid: user.uuid,
        },
        data: {
            banned: false,
            banReason: null,
            updatedAt: new Date(),
        },
    });

    await prisma.server.updateMany({
        where: {
            owner: user.uuid,
        },
        data: {
            disabled: false,
        },
    });

    return res.json({
        success: true,
        message: "This user has successfully been unbanned.",
    });
});

export default router;
