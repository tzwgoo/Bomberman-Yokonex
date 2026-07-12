import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config";
import { ratingDelta } from "../src/matchPersistence";
import { BOMBERMAN_MAPS } from "../src/rooms/BombermanMaps";
import { BombermanInput, BombermanPowerUp, BombermanRoom } from "../src/rooms/BombermanRoom";

describe("bomberman room", () => {
  let colyseus: ColyseusTestServer;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());

  beforeEach(async () => await colyseus.cleanup());

  it("calculates rating deltas from match rank", () => {
    assert.strictEqual(ratingDelta({ currentScore: 800, playerCount: 2, rank: 1, isWinner: true, isDraw: false }), 26);
    assert.strictEqual(ratingDelta({ currentScore: 800, playerCount: 2, rank: 2, isWinner: false, isDraw: false }), -6);
    assert.strictEqual(ratingDelta({ currentScore: 1300, playerCount: 4, rank: 2, isWinner: false, isDraw: false }), 8);
    assert.strictEqual(ratingDelta({ currentScore: 1300, playerCount: 4, rank: 3, isWinner: false, isDraw: false }), -5);
    assert.strictEqual(ratingDelta({ currentScore: 1900, playerCount: 2, rank: 1, isWinner: true, isDraw: false }), 12);
    assert.strictEqual(ratingDelta({ currentScore: 1900, playerCount: 4, rank: 4, isWinner: false, isDraw: false }), -18);
    assert.strictEqual(ratingDelta({ currentScore: 1900, playerCount: 2, rank: 1, isWinner: false, isDraw: true }), 0);
  });

  async function startGameAfterCountdown(room: BombermanRoom, host: any, guest: any) {
    host.send("setReady", true);
    guest.send("setReady", true);
    await room.waitForNextPatch();

    host.send("startGame");
    await room.waitForNextPatch();

    room.state.countdownMs = 1;
    room.updateStartCountdown();
    room.state.roundIntroMs = 0;
  }

  it("lets players join and place a bomb", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const client1 = await colyseus.connectTo(room);
    const client2 = await colyseus.connectTo(room);

    assert.strictEqual(client1.sessionId, room.clients[0].sessionId);
    assert.strictEqual(client2.sessionId, room.clients[1].sessionId);

    await room.waitForNextPatch();

    assert.strictEqual(room.state.players.size, 2);
    assert.strictEqual(room.state.phase, "lobby");
    assert.ok(room.state.tiles.size > 0);

    await startGameAfterCountdown(room, client1, client2);

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
    assert.strictEqual(room.state.phase, "lobby");
    assert.ok(room.state.countdownMs > 0);

    room.state.countdownMs = 1;
    room.updateStartCountdown();
    room.state.roundIntroMs = 0;
    assert.strictEqual(room.state.phase, "playing");
  });

  it("blocks gameplay input during round intro countdown", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });

    host.send("setReady", true);
    guest.send("setReady", true);
    await room.waitForNextPatch();
    host.send("startGame");
    await room.waitForNextPatch();

    room.state.countdownMs = 1;
    room.updateStartCountdown();
    assert.strictEqual(room.state.phase, "playing");
    assert.ok(room.state.roundIntroMs > 0);

    host.send("input", {
      left: false,
      right: false,
      up: false,
      down: false,
      placeBomb: true,
      tick: 1,
    });
    await room.waitForNextPatch();
    assert.strictEqual(room.state.bombs.size, 0);

    room.state.roundIntroMs = 1;
    room.fixedTick();
    host.send("input", {
      left: false,
      right: false,
      up: false,
      down: false,
      placeBomb: true,
      tick: 2,
    });
    await room.waitForNextPatch();
    assert.strictEqual(room.state.bombs.size, 1);
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
    assert.strictEqual(room.state.mapDifficulty, "简单");
    assert.strictEqual(room.state.mapRecommendedPlayers, "2-3");
    assert.ok(room.state.mapPreview.includes("#"));
    assert.strictEqual(room.metadata.mapDifficulty, "简单");

    const fallbackRoom = await colyseus.createRoom<BombermanRoom>("bomberman_room", { mapId: "missing-map" });
    assert.strictEqual(fallbackRoom.state.mapId, "classic");
  });

  it("resolves random map from server whitelist", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", { mapId: "random" });
    const validMapIds = BOMBERMAN_MAPS.map((map) => map.id);

    assert.ok(validMapIds.includes(room.state.mapId));
    assert.notStrictEqual(room.state.mapId, "random");
    assert.ok(room.state.mapPreview.length > 0);
    assert.ok(room.metadata.mapPreview.length > 0);
  });

  it("syncs player profile role and color", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const playerClient = await colyseus.connectTo(room, {
      nickname: "Bolt",
      color: "#63d2ff",
      roleId: "bolt",
    });
    const fallbackClient = await colyseus.connectTo(room, {
      nickname: "Fallback",
      color: "not-a-color",
      roleId: "missing-role",
    });

    await room.waitForNextPatch();

    const player = room.state.players.get(playerClient.sessionId);
    const fallback = room.state.players.get(fallbackClient.sessionId);

    assert.strictEqual(player?.nickname, "Bolt");
    assert.strictEqual(player?.color, "#63d2ff");
    assert.strictEqual(player?.roleId, "bolt");
    assert.strictEqual(player?.title, "闪电游侠");
    assert.strictEqual(player?.avatar, "⚡");
    assert.strictEqual(player?.skinId, "bolt");

    assert.strictEqual(fallback?.roleId, "rookie");
    assert.strictEqual(fallback?.avatar, "🙂");
    assert.ok(fallback?.color.startsWith("#"));

    room.resetRound();
    assert.strictEqual(room.state.players.get(playerClient.sessionId)?.color, "#63d2ff");
    assert.strictEqual(room.state.players.get(playerClient.sessionId)?.avatar, "⚡");
  });

  it("clamps selected max clients and rejects extra players", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", { maxClients: 2 });
    await colyseus.connectTo(room, { nickname: "P1" });
    await colyseus.connectTo(room, { nickname: "P2" });

    assert.strictEqual(room.maxClients, 2);
    assert.strictEqual(room.state.maxPlayers, 2);
    assert.strictEqual(room.state.players.size, 2);

    await assert.rejects(() => colyseus.connectTo(room, { nickname: "P3" }));
  });

  it("requires password for protected rooms", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {
      privateRoom: true,
      password: "1234",
    });
    const host = await colyseus.connectTo(room, { nickname: "Host", password: "1234" });
    await room.waitForNextPatch();

    await assert.rejects(() => colyseus.connectTo(room, { nickname: "Wrong", password: "0000" }));
    await assert.rejects(() => colyseus.connectTo(room, { nickname: "Missing" }));

    const client = await colyseus.connectTo(room, { nickname: "Right", password: "1234" });
    await room.waitForNextPatch();

    assert.strictEqual(room.state.hasPassword, true);
    assert.strictEqual(room.state.players.get(host.sessionId)?.isHost, true);
    assert.strictEqual(room.state.players.get(client.sessionId)?.nickname, "Right");
  });

  it("lets host manage members but rejects non-host management", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });
    const third = await colyseus.connectTo(room, { nickname: "Third" });

    await room.waitForNextPatch();

    guest.send("kickPlayer", third.sessionId);
    await room.waitForNextPatch();
    assert.ok(room.state.players.has(third.sessionId));

    guest.send("transferHost", third.sessionId);
    await room.waitForNextPatch();
    assert.strictEqual(room.state.players.get(host.sessionId)?.isHost, true);
    assert.strictEqual(room.state.players.get(third.sessionId)?.isHost, false);

    host.send("transferHost", guest.sessionId);
    await room.waitForNextPatch();
    assert.strictEqual(room.state.players.get(host.sessionId)?.isHost, false);
    assert.strictEqual(room.state.players.get(guest.sessionId)?.isHost, true);

    guest.send("kickPlayer", third.sessionId);
    await room.waitForNextPatch();
    assert.strictEqual(room.state.players.has(third.sessionId), false);
  });

  it("cancels start countdown when readiness changes", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });

    host.send("setReady", true);
    guest.send("setReady", true);
    await room.waitForNextPatch();

    host.send("startGame");
    await room.waitForNextPatch();
    assert.ok(room.state.countdownMs > 0);

    guest.send("setReady", false);
    await room.waitForNextPatch();
    assert.strictEqual(room.state.countdownMs, 0);
    assert.strictEqual(room.state.phase, "lobby");
  });

  it("applies power up effects on the server", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });

    await room.waitForNextPatch();
    await startGameAfterCountdown(room, host, guest);

    const player = room.state.players.get(host.sessionId);
    assert.ok(player);

    const collectedMessages: string[] = [];
    const pickerDeviceMessages: Array<{ strength: number }> = [];
    const otherDeviceMessages: Array<{ strength: number; durationMs: number; commandId: string }> = [];
    host.onMessage("powerUpCollected", (message) => collectedMessages.push(message.type));
    guest.onMessage("powerUpCollected", () => {});
    host.onMessage("fixedStrengthPowerUp", (message) => pickerDeviceMessages.push(message));
    guest.onMessage("fixedStrengthPowerUp", (message) => otherDeviceMessages.push(message));

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
    await collect("ems_low");
    await collect("ems_medium");
    await collect("ems_high");
    assert.strictEqual(room.state.powerUps.size, 0);
    assert.deepStrictEqual(collectedMessages, ["bomb", "range", "speed", "shield", "ems_low", "ems_medium", "ems_high"]);
    assert.deepStrictEqual(pickerDeviceMessages, []);
    assert.deepStrictEqual(otherDeviceMessages.map((message) => message.strength), [40, 80, 120]);
    assert.ok(otherDeviceMessages.every((message) => message.durationMs === 800));
    assert.deepStrictEqual(otherDeviceMessages.map((message) => message.commandId), [
      "power_up_ems_low",
      "power_up_ems_medium",
      "power_up_ems_high",
    ]);
  });

  it("tracks multi-round score and match winner", async () => {
    const room = await colyseus.createRoom<BombermanRoom>("bomberman_room", {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const guest = await colyseus.connectTo(room, { nickname: "Guest" });

    await room.waitForNextPatch();
    await startGameAfterCountdown(room, host, guest);

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
