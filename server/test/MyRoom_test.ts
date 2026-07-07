import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config";
import { BombermanInput, BombermanPowerUp, BombermanRoom, BombermanState } from "../src/rooms/BombermanRoom";

describe("bomberman room", () => {
  let colyseus: ColyseusTestServer;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());

  beforeEach(async () => await colyseus.cleanup());

  it("lets players join and place a bomb", async () => {
    const room = await colyseus.createRoom<BombermanState>("bomberman_room", {});
    const client1 = await colyseus.connectTo(room);
    const client2 = await colyseus.connectTo(room);

    assert.strictEqual(client1.sessionId, room.clients[0].sessionId);
    assert.strictEqual(client2.sessionId, room.clients[1].sessionId);

    await room.waitForNextPatch();

    assert.strictEqual(room.state.players.size, 2);
    assert.strictEqual(room.state.phase, "lobby");
    assert.ok(room.state.tiles.size > 0);

    client1.send("setReady", true);
    client2.send("setReady", true);
    await room.waitForNextPatch();

    client1.send("startGame");
    await room.waitForNextPatch();

    assert.strictEqual(room.state.phase, "playing");

    // 放炸弹只发输入，具体创建、倒计时和爆炸都由服务端固定帧处理。
    const input: BombermanInput = {
      left: false,
      right: false,
      up: false,
      down: false,
      placeBomb: true,
      tick: 1,
    };

    client1.send("input", input);
    await room.waitForNextPatch();

    assert.strictEqual(room.state.bombs.size, 1);
  });

  it("keeps players in lobby until host starts after everyone is ready", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });

    await room.waitForNextPatch();

    const hostPlayer = room.state.players.get(host.sessionId);
    const guestPlayer = room.state.players.get(guest.sessionId);

    assert.strictEqual(hostPlayer?.nickname, "Host");
    assert.strictEqual(hostPlayer?.isHost, true);
    assert.strictEqual(guestPlayer?.isHost, false);
    assert.strictEqual(room.state.phase, "lobby");

    guest.send("setReady", true);
    guest.send("startGame");
    await room.waitForNextPatch();
    assert.strictEqual(room.state.phase, "lobby");

    host.send("setReady", true);
    await room.waitForNextPatch();

    host.send("startGame");
    await room.waitForNextPatch();
    assert.strictEqual(room.state.phase, "playing");
  });

  it("moves host role to another player after host leaves", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });

    await room.waitForNextPatch();
    await host.leave();
    await room.waitForNextPatch();

    const guestPlayer = room.state.players.get(guest.sessionId);
    assert.strictEqual(room.state.players.size, 1);
    assert.strictEqual(guestPlayer?.isHost, true);
  });

  it("applies selected map when creating a room", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", { mapId: "open-yard" });

    assert.strictEqual(room.state.mapId, "open-yard");
    assert.strictEqual(room.state.mapName, "开阔庭院");

    const fallbackRoom = await colyseus.createRoom<BombermanRoom>("bomberman_room", { mapId: "missing-map" });
    assert.strictEqual(fallbackRoom.state.mapId, "classic");
  });

  it("applies power up effects on the server", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });

    await room.waitForNextPatch();
    host.send("setReady", true);
    guest.send("setReady", true);
    await room.waitForNextPatch();
    host.send("startGame");
    await room.waitForNextPatch();

    const player = room.state.players.get(host.sessionId);
    assert.ok(player);

    const collectedMessages: string[] = [];
    host.onMessage("powerUpCollected", (message) => collectedMessages.push(message.type));
    guest.onMessage("powerUpCollected", () => {});

    const playerTile = room.worldToTile(player.x, player.y);
    let tick = 1;
    const collect = async (type: string) => {
      const powerUp = new BombermanPowerUp();
      powerUp.id = `test-${type}`;
      powerUp.x = playerTile.tileX;
      powerUp.y = playerTile.tileY;
      powerUp.type = type;
      room.state.powerUps.set(room.tileKey(powerUp.x, powerUp.y), powerUp);

      const input: BombermanInput = {
        left: false,
        right: false,
        up: false,
        down: false,
        placeBomb: false,
        tick: tick++,
      };

      host.send("input", input);
      await room.waitForNextPatch();
    };

    await collect("bomb");
    assert.strictEqual(player.bombLimit, 2);
    await collect("range");
    assert.strictEqual(player.blastRange, 3);
    await collect("speed");
    assert.ok(player.speed > 2);
    await collect("shield");
    assert.strictEqual(player.shield, true);
    assert.strictEqual(room.state.powerUps.size, 0);
    assert.deepStrictEqual(collectedMessages, ["bomb", "range", "speed", "shield"]);
  });

  it("tracks multi-round score and match winner", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });

    await room.waitForNextPatch();
    host.send("setReady", true);
    guest.send("setReady", true);
    await room.waitForNextPatch();
    host.send("startGame");
    await room.waitForNextPatch();

    room.finishRound(host.sessionId);
    room.resetRound();
    room.finishRound(host.sessionId);
    room.resetRound();
    room.finishRound(host.sessionId);

    const hostPlayer = room.state.players.get(host.sessionId);
    assert.strictEqual(hostPlayer?.score, 3);
    assert.strictEqual(room.state.matchStatus, "settled");
    assert.strictEqual(room.state.matchWinnerSessionId, host.sessionId);
  });
});
