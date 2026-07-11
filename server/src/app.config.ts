import { defineServer, defineRoom, matchMaker, monitor, playground } from "colyseus";
import express from "express";

/**
 * Import your Room files
 */
import { Part1Room } from "./rooms/Part1Room.js";
import { Part2Room } from "./rooms/Part2Room.js";
import { Part3Room } from "./rooms/Part3Room.js";
import { Part4Room } from "./rooms/Part4Room.js";
import { BombermanRoom } from "./rooms/BombermanRoom.js";
import { BOMBERMAN_MAPS } from "./rooms/BombermanMaps.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { registerDeviceAdminRoutes } from "./deviceAdminRoutes.js";

const server = defineServer({
    rooms: {
        part1_room: defineRoom(Part1Room),
        part2_room: defineRoom(Part2Room),
        part3_room: defineRoom(Part3Room),
        part4_room: defineRoom(Part4Room),
        bomberman_room: defineRoom(BombermanRoom),
    },

    express: (app) => {
        /**
         * Bind your custom express routes here:
         */
        app.use(express.json());
        registerAuthRoutes(app);
        registerDeviceAdminRoutes(app);

        app.get("/hello", (req, res) => {
            res.send("Bomberman Yokonex server is running.");
        });

        app.get("/rooms/bomberman", async (_req, res) => {
            const rooms = await matchMaker.query({ name: "bomberman_room" });
            res.json(rooms.filter((room) => room.metadata?.listed !== false));
        });

        app.get("/maps/bomberman", (_req, res) => {
            res.json(BOMBERMAN_MAPS.map(({ id, name, description, difficulty, recommendedPlayers, previewRows }) => ({
                id,
                name,
                description,
                difficulty,
                recommendedPlayers,
                previewRows,
            })));
        });

        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }

        /**
         * Bind @colyseus/monitor
         * It is recommended to protect this route with a password.
         * Read more: https://docs.colyseus.io/tools/monitor/
         */
        app.use("/monitor", monitor());
    },
});

export default server;
