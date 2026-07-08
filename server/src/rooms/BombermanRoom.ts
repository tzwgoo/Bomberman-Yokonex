import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";

import { verifyAuthToken, type AuthRoomUser } from "../authService";
import { saveMatchResult } from "../matchPersistence";
import { DEFAULT_BOMBERMAN_MAP_ID, resolveBombermanMap, type BombermanMapDefinition } from "./BombermanMaps";

export interface BombermanInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  placeBomb: boolean;
  tick?: number;
}

export interface BombermanJoinOptions {
  nickname?: string;
  privateRoom?: boolean;
  mapId?: string;
  password?: string;
  maxClients?: number;
  color?: string;
  roleId?: string;
  token?: string;
}

type PowerUpType = "bomb" | "range" | "speed" | "shield";

type PlayerRolePreset = {
  id: string;
  title: string;
  avatar: string;
  skinId: string;
};

const POWER_UP_LABELS: Record<PowerUpType, string> = {
  bomb: "炸弹容量",
  range: "爆炸范围",
  speed: "移动速度",
  shield: "能量护盾",
};

const PLAYER_ROLES: PlayerRolePreset[] = [
  { id: "rookie", title: "新晋爆破手", avatar: "🙂", skinId: "rookie" },
  { id: "blazer", title: "火花队长", avatar: "🔥", skinId: "blazer" },
  { id: "bolt", title: "闪电游侠", avatar: "⚡", skinId: "bolt" },
  { id: "guard", title: "护盾卫士", avatar: "🛡️", skinId: "guard" },
];

const DEFAULT_PLAYER_ROLE = PLAYER_ROLES[0];

export class BombermanPlayer extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") tick = 0;
  @type("string") color = "#f6c453";
  @type("string") userId = "";
  @type("string") nickname = "玩家";
  @type("string") roleId = DEFAULT_PLAYER_ROLE.id;
  @type("string") title = DEFAULT_PLAYER_ROLE.title;
  @type("string") avatar = DEFAULT_PLAYER_ROLE.avatar;
  @type("string") skinId = DEFAULT_PLAYER_ROLE.skinId;
  @type("boolean") alive = true;
  @type("boolean") ready = false;
  @type("boolean") isHost = false;
  @type("number") bombLimit = 1;
  @type("number") activeBombs = 0;
  @type("number") blastRange = 2;
  @type("number") speed = 2;
  @type("boolean") shield = false;
  @type("number") score = 0;

  inputQueue: BombermanInput[] = [];
}

export class BombermanTile extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") type = "solid";
}

export class BombermanBomb extends Schema {
  @type("string") id = "";
  @type("string") ownerId = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") timerMs = 1800;
  @type("number") range = 2;
}

export class BombermanExplosion extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") ttlMs = 450;
}

export class BombermanPowerUp extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") type = "bomb";
}

export class BombermanState extends Schema {
  @type("number") mapWidth = 800;
  @type("number") mapHeight = 600;
  @type("number") tileSize = 48;
  @type("number") columns = 15;
  @type("number") rows = 11;
  @type("number") offsetX = 40;
  @type("number") offsetY = 36;
  @type("string") mapId = DEFAULT_BOMBERMAN_MAP_ID;
  @type("string") mapName = "经典工厂";
  @type("string") mapDescription = "标准箱子密度，适合快速上手。";
  @type("string") mapDifficulty = "普通";
  @type("string") mapRecommendedPlayers = "2-4";
  @type("string") mapPreview = "";
  @type("string") phase = "lobby";
  @type("string") roundStatus = "playing";
  @type("string") matchStatus = "playing";
  @type("number") countdownMs = 0;
  @type("number") maxPlayers = 4;
  @type("boolean") hasPassword = false;
  @type("string") winnerSessionId = "";
  @type("string") matchWinnerSessionId = "";
  @type("number") roundNumber = 0;
  @type("number") roundTimerMs = 120000;
  @type("number") roundIntroMs = 0;
  @type("number") targetScore = 3;
  @type({ map: BombermanTile }) tiles = new MapSchema<BombermanTile>();
  @type({ map: BombermanBomb }) bombs = new MapSchema<BombermanBomb>();
  @type({ map: BombermanExplosion }) explosions = new MapSchema<BombermanExplosion>();
  @type({ map: BombermanPowerUp }) powerUps = new MapSchema<BombermanPowerUp>();
  @type({ map: BombermanPlayer }) players = new MapSchema<BombermanPlayer>();
}

const PLAYER_RADIUS = 16;
const BOMB_TIMER_MS = 1800;
const EXPLOSION_TTL_MS = 450;
const ROUND_RESTART_DELAY_MS = 2500;
const ROUND_DURATION_MS = 120000;
const ROUND_INTRO_MS = 3000;
const TARGET_SCORE = 3;
const START_COUNTDOWN_MS = 3000;
const POWER_UP_TYPES: PowerUpType[] = ["bomb", "range", "speed", "shield"];

export class BombermanRoom extends Room {
  maxClients = 4;
  fixedTimeStep = 1000 / 60;
  state = new BombermanState();
  nextBombId = 1;
  nextExplosionId = 1;
  roundRestartTimerMs = 0;
  privateRoom = false;
  roomPassword = "";
  selectedMap: BombermanMapDefinition = resolveBombermanMap();
  matchStartedAt = new Date();
  matchPersisted = false;

  onCreate(options: BombermanJoinOptions = {}) {
    this.maxClients = this.normalizeMaxClients(options.maxClients);
    this.state.maxPlayers = this.maxClients;
    this.roomPassword = this.normalizePassword(options.password);
    this.state.hasPassword = this.roomPassword.length > 0;
    this.privateRoom = Boolean(options.privateRoom);
    this.selectedMap = resolveBombermanMap(options.mapId);
    this.applyMapDefinition();
    this.createMap();
    this.updateRoomMetadata();

    // 固定帧推进房间状态，后续炸弹、爆炸、道具都放在这里统一结算。
    let elapsedTime = 0;
    this.setSimulationInterval((deltaTime) => {
      elapsedTime += deltaTime;

      while (elapsedTime >= this.fixedTimeStep) {
        elapsedTime -= this.fixedTimeStep;
        this.fixedTick();
      }
    });

    this.onMessage("input", (client, input: BombermanInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        return;
      }

      // 先缓存输入，再由固定帧消费，避免不同客户端帧率影响战斗结果。
      player.inputQueue.push(input);
    });

    this.onMessage("setNickname", (client, nickname: string) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        return;
      }

      player.nickname = this.normalizeNickname(nickname);
      this.updateRoomMetadata();
    });

    this.onMessage("setReady", (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "lobby") {
        return;
      }

      player.ready = Boolean(ready);
      this.cancelCountdownIfNeeded();
      this.updateRoomMetadata();
    });

    this.onMessage("startGame", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isHost || !this.canStartGame()) {
        return;
      }

      this.startCountdown();
      this.updateRoomMetadata();
    });

    this.onMessage("kickPlayer", (client, targetSessionId: string) => {
      this.kickPlayer(client, targetSessionId);
    });

    this.onMessage("transferHost", (client, targetSessionId: string) => {
      this.transferHost(client.sessionId, targetSessionId);
    });
  }

  onAuth(_client: Client, options: BombermanJoinOptions = {}) {
    if (this.roomPassword && this.normalizePassword(options.password) !== this.roomPassword) {
      return false;
    }

    const authUser = verifyAuthToken(options.token);
    if (authUser) {
      return authUser;
    }

    // 开发测试默认允许游客进房；正式服可用环境变量强制房间必须登录。
    return process.env.AUTH_REQUIRED_FOR_ROOMS === "1" ? false : true;
  }

  onJoin(client: Client, options: BombermanJoinOptions = {}) {
    const player = new BombermanPlayer();
    const spawn = this.spawnPointAt(this.state.players.size);

    player.x = this.tileToWorldX(spawn.tileX);
    player.y = this.tileToWorldY(spawn.tileY);
    const role = this.findPlayerRole(options.roleId);
    const authUser = this.clientAuth(client);
    player.color = this.normalizeColor(options.color, spawn.color);
    player.userId = authUser?.userId ?? "";
    player.nickname = this.normalizeNickname(authUser?.nickname || options.nickname);
    player.roleId = role.id;
    player.title = role.title;
    player.avatar = role.avatar;
    player.skinId = role.skinId;
    player.isHost = this.state.players.size === 0;

    this.state.players.set(client.sessionId, player);
    this.updateRoomMetadata();
    console.log("Bomberman joined", { roomId: this.roomId, sessionId: client.sessionId });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.cancelCountdownIfNeeded();
    this.ensureHost();
    this.updateRoomMetadata();
    console.log("Bomberman left", { roomId: this.roomId, sessionId: client.sessionId });
  }

  async onDrop(client: Client) {
    try {
      // 非主动掉线时保留座位 10 秒，客户端可用重连令牌回到原房间。
      await this.allowReconnection(client, 10);
    } catch {
      // 超时后交给 onLeave 做最终清理和房主转让。
    }
  }

  fixedTick() {
    if (this.state.phase === "lobby") {
      this.updateStartCountdown();
      return;
    }

    if (this.state.phase !== "playing") {
      return;
    }

    if (this.state.roundIntroMs > 0) {
      this.state.roundIntroMs = Math.max(0, this.state.roundIntroMs - this.fixedTimeStep);
      return;
    }

    if (this.state.roundStatus === "ended") {
      if (this.state.matchStatus === "settled") {
        return;
      }

      this.roundRestartTimerMs -= this.fixedTimeStep;
      if (this.roundRestartTimerMs <= 0) {
        this.resetRound();
      }

      return;
    }

    this.state.players.forEach((player, sessionId) => {
      let input: BombermanInput | undefined;

      while ((input = player.inputQueue.shift())) {
        if (!player.alive || this.state.roundStatus !== "playing") {
          continue;
        }

        if (input.placeBomb) {
          this.placeBomb(sessionId, player);
        }

        let nextX = player.x;
        let nextY = player.y;
        const velocity = player.speed;

        if (input.left) {
          nextX -= velocity;
        } else if (input.right) {
          nextX += velocity;
        }

        if (input.up) {
          nextY -= velocity;
        } else if (input.down) {
          nextY += velocity;
        }

        // 地图边界先在服务端兜底，避免玩家同步到非法位置。
        if (!this.isBlockedAt(nextX, player.y)) {
          player.x = Math.max(PLAYER_RADIUS, Math.min(this.state.mapWidth - PLAYER_RADIUS, nextX));
        }

        if (!this.isBlockedAt(player.x, nextY)) {
          player.y = Math.max(PLAYER_RADIUS, Math.min(this.state.mapHeight - PLAYER_RADIUS, nextY));
        }

        player.tick = input.tick ?? player.tick;
        this.collectPowerUp(player);
      }
    });

    this.state.roundTimerMs = Math.max(0, this.state.roundTimerMs - this.fixedTimeStep);
    if (this.state.roundTimerMs <= 0) {
      this.finishRound(this.pickTimedWinner());
      return;
    }

    this.updateBombs();
    this.updateExplosions();
    this.checkRoundEnd();
  }

  createMap() {
    const solidTiles = new Set(this.selectedMap.solidTiles ?? []);
    const emptyTiles = new Set(this.selectedMap.emptyTiles ?? []);

    for (let y = 0; y < this.state.rows; y++) {
      for (let x = 0; x < this.state.columns; x++) {
        if (this.isSpawnSafeTile(x, y)) {
          continue;
        }

        const isBorder = x === 0 || y === 0 || x === this.state.columns - 1 || y === this.state.rows - 1;
        const isFixedWall = x % 2 === 0 && y % 2 === 0;
        const key = this.tileKey(x, y);
        const isForcedSolid = solidTiles.has(key);
        const isForcedEmpty = emptyTiles.has(key);
        const shouldCreateCrate = !isForcedEmpty && (x * 7 + y * 11) % this.selectedMap.crateModulo < this.selectedMap.crateThreshold;

        if (isBorder || isFixedWall || isForcedSolid || shouldCreateCrate) {
          const tile = new BombermanTile();
          tile.x = x;
          tile.y = y;
          tile.type = isBorder || isFixedWall || isForcedSolid ? "solid" : "crate";
          this.state.tiles.set(key, tile);
        }
      }
    }
  }

  placeBomb(ownerId: string, player: BombermanPlayer) {
    const { tileX, tileY } = this.worldToTile(player.x, player.y);
    const key = this.tileKey(tileX, tileY);

    if (this.state.bombs.has(key) || player.activeBombs >= player.bombLimit) {
      return;
    }

    const bomb = new BombermanBomb();
    bomb.id = String(this.nextBombId++);
    bomb.ownerId = ownerId;
    bomb.x = tileX;
    bomb.y = tileY;
    bomb.timerMs = BOMB_TIMER_MS;
    bomb.range = player.blastRange;
    this.state.bombs.set(key, bomb);
    player.activeBombs++;
  }

  updateBombs() {
    const explodedBombs: BombermanBomb[] = [];

    this.state.bombs.forEach((bomb) => {
      bomb.timerMs -= this.fixedTimeStep;
      if (bomb.timerMs <= 0) {
        explodedBombs.push(bomb);
      }
    });

    explodedBombs.forEach((bomb) => {
      this.state.bombs.delete(this.tileKey(bomb.x, bomb.y));
      this.explodeBomb(bomb);
    });
  }

  explodeBomb(bomb: BombermanBomb) {
    const owner = this.state.players.get(bomb.ownerId);
    if (owner) {
      owner.activeBombs = Math.max(0, owner.activeBombs - 1);
    }

    const blastTiles = [{ x: bomb.x, y: bomb.y }];
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    // 爆炸按格子向四个方向扩散，固定墙阻挡，可破坏障碍物被命中后消失。
    directions.forEach((direction) => {
      for (let range = 1; range <= bomb.range; range++) {
        const x = bomb.x + direction.x * range;
        const y = bomb.y + direction.y * range;
        const key = this.tileKey(x, y);
        const tile = this.state.tiles.get(key);

        if (tile?.type === "solid") {
          break;
        }

        blastTiles.push({ x, y });

        if (tile?.type === "crate") {
          this.state.tiles.delete(key);
          this.maybeDropPowerUp(x, y);
          break;
        }
      }
    });

    blastTiles.forEach(({ x, y }) => {
      const explosion = new BombermanExplosion();
      explosion.id = String(this.nextExplosionId++);
      explosion.x = x;
      explosion.y = y;
      explosion.ttlMs = EXPLOSION_TTL_MS;
      this.state.explosions.set(this.tileKey(x, y), explosion);
    });

    this.state.players.forEach((player) => {
      if (!player.alive) {
        return;
      }

      const playerTile = this.worldToTile(player.x, player.y);
      const isHit = blastTiles.some((tile) => tile.x === playerTile.tileX && tile.y === playerTile.tileY);
      if (isHit) {
        if (player.shield) {
          player.shield = false;
        } else {
          player.alive = false;
        }
      }
    });
  }

  updateExplosions() {
    const expiredExplosions: string[] = [];

    this.state.explosions.forEach((explosion, key) => {
      explosion.ttlMs -= this.fixedTimeStep;
      if (explosion.ttlMs <= 0) {
        expiredExplosions.push(key);
      }
    });

    expiredExplosions.forEach((key) => this.state.explosions.delete(key));
  }

  checkRoundEnd() {
    if (this.state.phase !== "playing" || this.state.roundStatus !== "playing" || this.state.players.size < 2) {
      return;
    }

    const alivePlayers = Array.from(this.state.players.entries()).filter(([, player]) => player.alive);
    if (alivePlayers.length <= 1) {
      this.finishRound(alivePlayers[0]?.[0] ?? "");
    }
  }

  resetRound() {
    this.state.phase = "playing";
    this.state.countdownMs = 0;
    this.state.roundStatus = "playing";
    this.state.matchStatus = "playing";
    this.state.winnerSessionId = "";
    this.state.matchWinnerSessionId = "";
    this.roundRestartTimerMs = 0;
    this.state.roundNumber++;
    this.state.roundIntroMs = ROUND_INTRO_MS;
    this.state.roundTimerMs = ROUND_DURATION_MS;
    this.state.targetScore = TARGET_SCORE;

    // 新回合清掉局内临时物，再重新生成地图和出生点。
    this.clearMap(this.state.tiles);
    this.clearMap(this.state.bombs);
    this.clearMap(this.state.explosions);
    this.clearMap(this.state.powerUps);
    this.createMap();

    let playerIndex = 0;
    this.state.players.forEach((player) => {
      const spawn = this.spawnPointAt(playerIndex);
      player.x = this.tileToWorldX(spawn.tileX);
      player.y = this.tileToWorldY(spawn.tileY);
      player.alive = true;
      player.ready = false;
      player.bombLimit = 1;
      player.activeBombs = 0;
      player.blastRange = 2;
      player.speed = 2;
      player.shield = false;
      player.inputQueue = [];
      playerIndex++;
    });
  }

  clearMap<T>(map: MapSchema<T>) {
    Array.from(map.keys()).forEach((key) => map.delete(key));
  }

  maybeDropPowerUp(x: number, y: number) {
    const seed = x * 13 + y * 17 + this.state.roundNumber * 19;
    if (seed % 3 !== 0) {
      return;
    }

    const powerUp = new BombermanPowerUp();
    powerUp.id = `${this.state.roundNumber}:${x},${y}`;
    powerUp.x = x;
    powerUp.y = y;
    powerUp.type = this.powerUpTypeAt(seed);
    this.state.powerUps.set(this.tileKey(x, y), powerUp);
  }

  collectPowerUp(player: BombermanPlayer) {
    const { tileX, tileY } = this.worldToTile(player.x, player.y);
    const key = this.tileKey(tileX, tileY);
    const powerUp = this.state.powerUps.get(key);
    if (!powerUp) {
      return;
    }

    // 道具只在服务端结算，客户端不能自己加属性，避免多人状态不一致。
    if (powerUp.type === "bomb") {
      player.bombLimit = Math.min(4, player.bombLimit + 1);
    } else if (powerUp.type === "range") {
      player.blastRange = Math.min(5, player.blastRange + 1);
    } else if (powerUp.type === "speed") {
      player.speed = Math.min(3.5, player.speed + 0.35);
    } else if (powerUp.type === "shield") {
      player.shield = true;
    }

    this.state.powerUps.delete(key);
    this.broadcast("powerUpCollected", {
      nickname: player.nickname,
      type: powerUp.type,
      label: POWER_UP_LABELS[powerUp.type as PowerUpType],
    });
  }

  powerUpTypeAt(seed: number) {
    return POWER_UP_TYPES[Math.abs(seed) % POWER_UP_TYPES.length];
  }

  finishRound(winnerSessionId: string) {
    if (this.state.roundStatus === "ended") {
      return;
    }

    this.state.roundStatus = "ended";
    this.state.winnerSessionId = winnerSessionId;
    this.roundRestartTimerMs = ROUND_RESTART_DELAY_MS;

    if (winnerSessionId) {
      const winner = this.state.players.get(winnerSessionId);
      if (winner) {
        winner.score++;
        if (winner.score >= TARGET_SCORE) {
          this.state.matchStatus = "settled";
          this.state.matchWinnerSessionId = winnerSessionId;
          void this.persistMatchResult();
        }
      }
    }
  }

  pickTimedWinner() {
    const alivePlayers = Array.from(this.state.players.entries()).filter(([, player]) => player.alive);
    if (alivePlayers.length === 1) {
      return alivePlayers[0][0];
    }

    return "";
  }

  resetScores() {
    this.state.roundNumber = 0;
    this.state.matchWinnerSessionId = "";
    this.state.players.forEach((player) => {
      player.score = 0;
    });
  }

  isBlockedAt(x: number, y: number) {
    const points = [
      { x: x - PLAYER_RADIUS, y: y - PLAYER_RADIUS },
      { x: x + PLAYER_RADIUS, y: y - PLAYER_RADIUS },
      { x: x - PLAYER_RADIUS, y: y + PLAYER_RADIUS },
      { x: x + PLAYER_RADIUS, y: y + PLAYER_RADIUS },
    ];

    return points.some((point) => {
      const { tileX, tileY } = this.worldToTile(point.x, point.y);
      return this.state.tiles.has(this.tileKey(tileX, tileY));
    });
  }

  isSpawnSafeTile(x: number, y: number) {
    return this.selectedMap.spawnPoints.some((spawn) => {
      const distance = Math.abs(spawn.tileX - x) + Math.abs(spawn.tileY - y);
      return distance <= 1;
    });
  }

  applyMapDefinition() {
    // 地图尺寸和偏移由服务端统一写入状态，客户端只按同步数据绘制。
    this.state.mapId = this.selectedMap.id;
    this.state.mapName = this.selectedMap.name;
    this.state.mapDescription = this.selectedMap.description;
    this.state.mapDifficulty = this.selectedMap.difficulty;
    this.state.mapRecommendedPlayers = this.selectedMap.recommendedPlayers;
    this.state.mapPreview = this.selectedMap.previewRows.join("|");
    this.state.columns = this.selectedMap.columns;
    this.state.rows = this.selectedMap.rows;
    this.state.tileSize = this.selectedMap.tileSize;
    this.state.offsetX = this.selectedMap.offsetX;
    this.state.offsetY = this.selectedMap.offsetY;
  }

  spawnPointAt(index: number) {
    return this.selectedMap.spawnPoints[index % this.selectedMap.spawnPoints.length];
  }

  tileToWorldX(tileX: number) {
    return this.state.offsetX + tileX * this.state.tileSize + this.state.tileSize / 2;
  }

  tileToWorldY(tileY: number) {
    return this.state.offsetY + tileY * this.state.tileSize + this.state.tileSize / 2;
  }

  worldToTile(x: number, y: number) {
    return {
      tileX: Math.floor((x - this.state.offsetX) / this.state.tileSize),
      tileY: Math.floor((y - this.state.offsetY) / this.state.tileSize),
    };
  }

  tileKey(x: number, y: number) {
    return `${x},${y}`;
  }

  canStartGame() {
    if (this.state.countdownMs > 0) {
      return false;
    }

    if (this.state.players.size < 2) {
      return false;
    }

    return Array.from(this.state.players.values()).every((player) => player.ready);
  }

  startCountdown() {
    this.state.countdownMs = START_COUNTDOWN_MS;
  }

  updateStartCountdown() {
    if (this.state.countdownMs <= 0) {
      return;
    }

    if (!this.canContinueCountdown()) {
      this.state.countdownMs = 0;
      this.updateRoomMetadata();
      return;
    }

    this.state.countdownMs = Math.max(0, this.state.countdownMs - this.fixedTimeStep);
    if (this.state.countdownMs <= 0) {
      this.state.phase = "playing";
      this.lock();
      this.matchStartedAt = new Date();
      this.matchPersisted = false;
      this.resetScores();
      this.resetRound();
      this.updateRoomMetadata();
    }
  }

  canContinueCountdown() {
    return this.state.players.size >= 2 && Array.from(this.state.players.values()).every((player) => player.ready);
  }

  cancelCountdownIfNeeded() {
    if (this.state.phase === "lobby" && this.state.countdownMs > 0 && !this.canContinueCountdown()) {
      this.state.countdownMs = 0;
    }
  }

  kickPlayer(client: Client, targetSessionId: string) {
    const actor = this.state.players.get(client.sessionId);
    const target = this.state.players.get(targetSessionId);
    if (!actor?.isHost || !target || targetSessionId === client.sessionId || this.state.phase !== "lobby") {
      return;
    }

    const targetClient = this.clients.find((roomClient) => roomClient.sessionId === targetSessionId);
    targetClient?.leave(4000, "kicked");
  }

  transferHost(actorSessionId: string, targetSessionId: string) {
    const actor = this.state.players.get(actorSessionId);
    const target = this.state.players.get(targetSessionId);
    if (!actor?.isHost || !target || targetSessionId === actorSessionId || this.state.phase !== "lobby") {
      return;
    }

    // 房主身份只允许一个玩家持有，转让时先清空再赋给目标玩家。
    this.state.players.forEach((player) => {
      player.isHost = false;
    });
    target.isHost = true;
    this.updateRoomMetadata();
  }

  ensureHost() {
    if (Array.from(this.state.players.values()).some((player) => player.isHost)) {
      return;
    }

    const nextHost = Array.from(this.state.players.values())[0];
    if (nextHost) {
      nextHost.isHost = true;
    }
  }

  updateRoomMetadata() {
    const players = Array.from(this.state.players.values());
    const readyCount = players.filter((player) => player.ready).length;

    this.setMetadata({
      listed: !this.privateRoom && this.state.phase === "lobby",
      phase: this.state.phase,
      mapId: this.state.mapId,
      mapName: this.state.mapName,
      mapDescription: this.state.mapDescription,
      mapDifficulty: this.state.mapDifficulty,
      mapRecommendedPlayers: this.state.mapRecommendedPlayers,
      mapPreview: this.state.mapPreview,
      playerCount: this.state.players.size,
      maxClients: this.maxClients,
      hasPassword: this.state.hasPassword,
      countdownMs: this.state.countdownMs,
      readyCount,
    });
  }

  normalizeNickname(nickname?: string) {
    const value = String(nickname ?? "").trim().slice(0, 16);
    return value || "玩家";
  }

  normalizePassword(password?: string) {
    return String(password ?? "").trim().slice(0, 24);
  }

  normalizeColor(color?: string, fallback = "#f6c453") {
    const value = String(color ?? "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  findPlayerRole(roleId?: string) {
    // 角色只接受服务端白名单，保证所有客户端看到的头像和皮肤一致。
    return PLAYER_ROLES.find((role) => role.id === roleId) ?? DEFAULT_PLAYER_ROLE;
  }

  normalizeMaxClients(maxClients?: number) {
    const value = Number(maxClients);
    if (!Number.isFinite(value)) {
      return 4;
    }

    return Math.max(2, Math.min(4, Math.floor(value)));
  }

  async persistMatchResult() {
    if (this.matchPersisted) {
      return;
    }

    this.matchPersisted = true;
    const winner = this.state.players.get(this.state.matchWinnerSessionId);
    const endedAt = new Date();

    try {
      const result = await saveMatchResult({
        roomId: this.roomId,
        mapKey: this.state.mapId,
        startedAt: this.matchStartedAt,
        endedAt,
        winnerUserId: winner?.userId || undefined,
        players: Array.from(this.state.players.entries()).map(([sessionId, player]) => ({
          sessionId,
          userId: player.userId,
          nickname: player.nickname,
          score: player.score,
          alive: player.alive,
        })),
        rawData: {
          roundNumber: this.state.roundNumber,
          targetScore: TARGET_SCORE,
          winnerSessionId: this.state.matchWinnerSessionId,
          players: Array.from(this.state.players.entries()).map(([sessionId, player]) => ({
            sessionId,
            userId: player.userId,
            nickname: player.nickname,
            score: player.score,
          })),
        },
      });

      if (result.skipped) {
        console.log("Match persistence skipped", { roomId: this.roomId, reason: result.reason });
      }
    } catch (error) {
      console.error("Failed to persist match result", { roomId: this.roomId, error });
    }
  }

  clientAuth(client: Client) {
    const auth = (client as Client & { auth?: AuthRoomUser | boolean }).auth;
    return typeof auth === "object" ? auth : null;
  }
}
