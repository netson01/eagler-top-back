import { Router, Request, Response } from "express";
import prisma from "../../db";
import { ExplicitTypesOnFields } from "../../middleware";

const router = Router();

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
const validWssRegex = /^(wss?:\/\/)([0-9]{1,3}(?:\.[0-9]{1,3}){3}|[^\/]+)/;

router.put(
    "/:id",
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
            name: "votes",
            type: "number",
        },
        {
            name: "discord",
            type: "string",
        },
        {
            name: "tags",
            type: "object",
        },
        {
            name: "approved",
            type: "boolean",
        },
        {
            name: "verified",
            type: "boolean",
        },
        {
            name: "disabled",
            type: "boolean",
        },
        {
            name: "owner",
            type: "string",
        },
    ]),
    async (req: Request, res: Response) => {
        if (!req.body)
            return res.status(400).json({
                success: false,
                message: "Request did not contain a body.",
            });

        const {
            name,
            description,
            address,
            votes,
            discord,
            approved,
            verified,
            disabled,
            owner,
        } = req.body;
        const tags: string[] = req.body.tags;

        if (
            !name &&
            !description &&
            !address &&
            !String(votes) &&
            !discord &&
            !tags &&
            !approved &&
            !verified &&
            !disabled &&
            !owner
        )
            return res.status(400).json({
                success: false,
                message: "No fields were specified to update.",
            });

        if (name && name.length > 100)
            return res.status(400).json({
                success: false,
                message: "The server name specified is too long.",
            });

        if (description && description.length > 1500)
            return res.status(400).json({
                success: false,
                message: "The server description is too long.",
            });

        if (discord && discord.length > 10)
            return res.status(400).json({
                success: false,
                message: "The Discord invite specified is too long.",
            });

        if (address && !validWssRegex.test(address))
            return res.status(400).json({
                success: false,
                message: "Invalid address specified.",
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
                uuid: req.params.id,
            },
        });

        if (!server)
            return res.status(400).json({
                success: false,
                message: "A server with this ID could not be found.",
            });

        if (address) {
            const addressLookup = await prisma.server.findFirst({
                where: {
                    address,
                },
            });

            if (addressLookup)
                return res.status(400).json({
                    success: false,
                    message: "A server with this address already exists.",
                });
        }

        if (owner) {
            const userLookup = await prisma.user.findUnique({
                where: {
                    uuid: owner,
                },
            });

            if (!userLookup)
                return res.status(400).json({
                    success: false,
                    message: "An invalid owner UUID was specified.",
                });
        }

        await prisma.server.update({
            where: {
                uuid: server.uuid,
            },
            data: {
                address: address ?? server.address,
                approved:
                    approved != null ? Boolean(approved) : server.approved,
                disabled:
                    disabled != null ? Boolean(disabled) : server.disabled,
                verified:
                    verified != null ? Boolean(verified) : server.verified,
                description: description ?? server.description,
                discord: discord ?? server.discord,
                name: name ?? server.name,
                tags: tags ?? server.tags,
                owner: owner ?? server.owner,
                votes: votes ?? server.votes,
                updatedAt: new Date(),
            },
        });

        return res.json({
            success: true,
            message: "Successfully updated server.",
        });
    }
);

router.post("/:id/clear", async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.id,
        },
    });

    if (!server)
        return res.status(400).json({
            success: false,
            message: "An invalid server ID was specified.",
        });

    await prisma.comment.deleteMany({
        where: {
            serverId: server.uuid,
        },
    });

    return res.json({
        success: true,
        message: "Successfully deleted all comments.",
    });
});

export default router;
