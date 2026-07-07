import { defineServer, defineRoom, matchMaker, monitor, playground } from "colyseus";

/**
 * Import your Room files
 */
import { Part1Room } from "./rooms/Part1Room";
import { Part2Room } from "./rooms/Part2Room";
import { Part3Room } from "./rooms/Part3Room";
import { Part4Room } from "./rooms/Part4Room";
import { BombermanRoom } from "./rooms/BombermanRoom";
import { BOMBERMAN_MAPS } from "./rooms/BombermanMaps";

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
