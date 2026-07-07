import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

import { BACKEND_HTTP_URL, BACKEND_URL } from "../backend";
import { BOMBERMAN_MAP_OPTIONS, type BombermanMapOption } from "../bombermanMaps";
import { loadProfileState, recordMatchResult, updateProfile } from "../profileStore";

import type server from "../../../server/src/app.config";
import type { BombermanInput, BombermanRoom } from "../../../server/src/rooms/BombermanRoom";

type RoomSummary = {
    roomId: string;
    clients: number;
    maxClients: number;
    metadata?: {
        listed?: boolean;
        phase?: string;
        mapId?: string;
        mapName?: string;
        playerCount?: number;
        readyCount?: number;
        maxClients?: number;
    };
};

type LobbyView = "rooms" | "create" | "joined";

type PowerUpCollectedMessage = {
    nickname: string;
    type: string;
    label: string;
};

export class BombermanScene extends Phaser.Scene {
    client = new Client<typeof server>(BACKEND_URL);
    room?: Room<BombermanRoom>;

    cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
    wasdKeys: Record<string, Phaser.Input.Keyboard.Key>;
    currentPlayer?: Phaser.GameObjects.Rectangle;
    playerEntities: Record<string, Phaser.GameObjects.Rectangle> = {};
    tileEntities: Record<string, Phaser.GameObjects.Rectangle> = {};
    bombEntities: Record<string, Phaser.GameObjects.Arc> = {};
    explosionEntities: Record<string, Phaser.GameObjects.Rectangle> = {};
    powerUpEntities: Record<string, Phaser.GameObjects.Text> = {};
    arenaEntities: Phaser.GameObjects.GameObject[] = [];
    statusText: Phaser.GameObjects.Text;
    footerText: Phaser.GameObjects.Text;
    lobbyPanel?: HTMLElement;
    resultPanel?: HTMLElement;
    touchControls?: HTMLElement;
    powerUpPanel?: HTMLElement;
    roomListEl?: HTMLElement;
    playerListEl?: HTMLElement;
    lobbyMessageEl?: HTMLElement;
    lobbyView: LobbyView = "rooms";
    selectedMapId = BOMBERMAN_MAP_OPTIONS[0].id;
    mapOptions: BombermanMapOption[] = BOMBERMAN_MAP_OPTIONS;
    touchInput = {
        left: false,
        right: false,
        up: false,
        down: false,
    };
    touchBombQueued = false;
    soundEnabled = true;
    powerUpToastTimer?: number;
    recordedMatchRoomId = "";

    inputPayload: BombermanInput = {
        left: false,
        right: false,
        up: false,
        down: false,
        placeBomb: false,
        tick: undefined,
    };

    elapsedTime = 0;
    fixedTimeStep = 1000 / 60;
    currentTick = 0;

    constructor() {
        super({ key: "bomberman" });
    }

    create() {
        this.cameras.main.setBackgroundColor(0x17202a);
        this.cursorKeys = this.input.keyboard.createCursorKeys();
        this.wasdKeys = this.input.keyboard.addKeys("W,A,S,D,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;

        this.drawArenaFrame();
        this.statusText = this.add.text(16, 12, "大厅", {
            color: "#f8f3d4",
            fontFamily: "Verdana",
            fontSize: "16px",
        }).setDepth(20);

        this.createLobbyPanel();
        this.createResultPanel();
        this.createPowerUpPanel();
        this.createTouchControls();
        this.refreshRoomList();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.destroyLobbyPanel();
            this.destroyResultPanel();
            this.destroyPowerUpPanel();
            this.destroyTouchControls();
        });
    }

    update(_time: number, delta: number) {
        if (!this.room || !this.currentPlayer || this.room.state.phase !== "playing") {
            return;
        }

        this.elapsedTime += delta;
        while (this.elapsedTime >= this.fixedTimeStep) {
            this.elapsedTime -= this.fixedTimeStep;
            this.fixedTick();
        }

        this.pulseExplosions();
    }

    fixedTick() {
        if (!this.room) {
            return;
        }

        this.currentTick++;

        this.inputPayload.left = this.cursorKeys.left.isDown || this.wasdKeys.A.isDown || this.touchInput.left;
        this.inputPayload.right = this.cursorKeys.right.isDown || this.wasdKeys.D.isDown || this.touchInput.right;
        this.inputPayload.up = this.cursorKeys.up.isDown || this.wasdKeys.W.isDown || this.touchInput.up;
        this.inputPayload.down = this.cursorKeys.down.isDown || this.wasdKeys.S.isDown || this.touchInput.down;
        this.inputPayload.placeBomb = Phaser.Input.Keyboard.JustDown(this.wasdKeys.SPACE) || this.consumeTouchBomb();
        this.inputPayload.tick = this.currentTick;

        this.room.send("input", this.inputPayload);
    }

    createLobbyPanel() {
        const panel = document.createElement("section");
        panel.className = "lobby-panel";
        panel.innerHTML = `
            <div class="lobby-shell">
                <header class="lobby-header">
                    <div>
                        <p>YOKONEX</p>
                        <h2>多人对战大厅</h2>
                    </div>
                    <div class="lobby-player">
                        <label for="bomberman-nickname">昵称</label>
                        <input id="bomberman-nickname" type="text" maxlength="16" value="${loadProfileState().profile.nickname}" />
                    </div>
                </header>

                <nav class="lobby-tabs" aria-label="大厅页面">
                    <button data-action="show-rooms" data-view="rooms">房间列表</button>
                    <button data-action="show-create" data-view="create">创建房间</button>
                </nav>

                <p class="lobby-note" data-role="message"></p>

                <section class="lobby-view" data-view-panel="rooms">
                    <div class="lobby-section-title">
                        <div>
                            <h3>可加入房间</h3>
                            <span>选择房间加入，或输入房间号直连。</span>
                        </div>
                        <button class="secondary" data-action="refresh">刷新</button>
                    </div>
                    <div class="join-card">
                        <label for="bomberman-room-id">房间号</label>
                        <div class="lobby-row">
                            <input id="bomberman-room-id" type="text" placeholder="输入房间号" />
                            <button data-action="join">加入</button>
                        </div>
                    </div>
                    <div class="room-list" data-role="room-list"></div>
                </section>

                <section class="lobby-view" data-view-panel="create" hidden>
                    <div class="lobby-section-title">
                        <div>
                            <h3>创建房间</h3>
                            <span>选择地图后创建，等待好友准备。</span>
                        </div>
                        <label class="private-toggle">
                            <input id="bomberman-private" type="checkbox" />
                            私人房间
                        </label>
                    </div>
                    <div class="map-grid" data-role="map-list"></div>
                    <div class="lobby-actions">
                        <button data-action="create">创建房间</button>
                    </div>
                </section>

                <section class="lobby-view" data-view-panel="joined" hidden>
                    <div class="lobby-section-title">
                        <div>
                            <h3 data-role="room-title">当前房间</h3>
                            <span data-role="room-map">地图待同步</span>
                        </div>
                        <button class="danger" data-action="leave">离开</button>
                    </div>
                    <div class="player-list" data-role="player-list"></div>
                    <div class="lobby-actions">
                        <button data-action="ready">准备</button>
                        <button data-action="start">开始</button>
                    </div>
                </section>
            </div>
        `;

        panel.addEventListener("click", (event) => this.handleLobbyClick(event));
        document.body.appendChild(panel);

        this.lobbyPanel = panel;
        this.roomListEl = panel.querySelector<HTMLElement>("[data-role='room-list']");
        this.playerListEl = panel.querySelector<HTMLElement>("[data-role='player-list']");
        this.lobbyMessageEl = panel.querySelector<HTMLElement>("[data-role='message']");
        this.renderMapOptions();
        this.switchLobbyView("rooms");
    }

    destroyLobbyPanel() {
        this.lobbyPanel?.remove();
        this.lobbyPanel = undefined;
    }

    createResultPanel() {
        const panel = document.createElement("section");
        panel.className = "result-panel";
        panel.hidden = true;
        panel.innerHTML = `
            <h2 data-role="result-title">比赛结束</h2>
            <p data-role="result-detail"></p>
            <button data-action="result-leave">返回大厅</button>
        `;
        panel.addEventListener("click", async (event) => {
            const target = event.target as HTMLElement;
            if (target.dataset.action === "result-leave") {
                await this.leaveRoom();
            }
        });
        document.body.appendChild(panel);
        this.resultPanel = panel;
    }

    destroyResultPanel() {
        this.resultPanel?.remove();
        this.resultPanel = undefined;
    }

    createPowerUpPanel() {
        const panel = document.createElement("section");
        panel.className = "powerup-panel";
        panel.hidden = true;
        panel.innerHTML = `
            <div class="powerup-toast" data-role="powerup-toast" hidden></div>
            <div class="powerup-grid">
                <span><i>💣</i>炸弹 <strong data-stat="bomb">1</strong></span>
                <span><i>🔥</i>火力 <strong data-stat="range">2</strong></span>
                <span><i>⚡</i>速度 <strong data-stat="speed">2.0</strong></span>
                <span><i>🛡️</i>护盾 <strong data-stat="shield">无</strong></span>
            </div>
        `;
        document.body.appendChild(panel);
        this.powerUpPanel = panel;
    }

    destroyPowerUpPanel() {
        if (this.powerUpToastTimer) {
            window.clearTimeout(this.powerUpToastTimer);
        }
        this.powerUpPanel?.remove();
        this.powerUpPanel = undefined;
    }

    createTouchControls() {
        const controls = document.createElement("section");
        controls.className = "touch-controls";
        controls.hidden = true;
        controls.innerHTML = `
            <div class="touch-pad" aria-label="Movement">
                <button class="touch-button" data-dir="up" aria-label="向上移动">▲</button>
                <button class="touch-button" data-dir="left" aria-label="向左移动">◀</button>
                <button class="touch-button" data-dir="right" aria-label="向右移动">▶</button>
                <button class="touch-button" data-dir="down" aria-label="向下移动">▼</button>
            </div>
            <div class="touch-actions">
                <button class="touch-button skill" disabled aria-label="技能预留">技</button>
                <button class="touch-button bomb" data-action="touch-bomb" aria-label="放置炸弹">弹</button>
            </div>
            <button class="touch-button sound-toggle" data-action="sound-toggle" aria-label="音效开关">音</button>
        `;

        controls.addEventListener("pointerdown", (event) => this.handleTouchPointer(event, true));
        controls.addEventListener("pointerup", (event) => this.handleTouchPointer(event, false));
        controls.addEventListener("pointercancel", (event) => this.handleTouchPointer(event, false));
        controls.addEventListener("pointerleave", (event) => this.handleTouchPointer(event, false));
        document.body.appendChild(controls);
        this.touchControls = controls;
    }

    destroyTouchControls() {
        this.touchControls?.remove();
        this.touchControls = undefined;
    }

    handleTouchPointer(event: PointerEvent, pressed: boolean) {
        const target = event.target as HTMLElement;
        const button = target.closest<HTMLButtonElement>("button");
        if (!button || button.disabled) {
            return;
        }

        event.preventDefault();

        const direction = button.dataset.dir as keyof typeof this.touchInput | undefined;
        if (direction) {
            this.touchInput[direction] = pressed;
            button.classList.toggle("is-active", pressed);
            return;
        }

        if (!pressed) {
            return;
        }

        if (button.dataset.action === "touch-bomb") {
            this.touchBombQueued = true;
            button.classList.add("is-active");
            window.setTimeout(() => button.classList.remove("is-active"), 120);
        } else if (button.dataset.action === "sound-toggle") {
            this.soundEnabled = !this.soundEnabled;
            button.textContent = this.soundEnabled ? "音" : "静";
        }
    }

    consumeTouchBomb() {
        const queued = this.touchBombQueued;
        this.touchBombQueued = false;
        return queued;
    }

    async handleLobbyClick(event: Event) {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
        if (!target) {
            return;
        }

        const action = target.dataset.action;
        if (action === "show-rooms") {
            this.switchLobbyView("rooms");
        } else if (action === "show-create") {
            this.switchLobbyView("create");
        } else if (action === "select-map") {
            this.selectedMapId = target.dataset.mapId ?? this.selectedMapId;
            this.renderMapOptions();
        } else if (action === "create") {
            await this.createRoom();
        } else if (action === "join") {
            await this.joinRoomById();
        } else if (action === "refresh") {
            await this.refreshRoomList();
        } else if (action === "ready") {
            this.toggleReady();
        } else if (action === "start") {
            this.room?.send("startGame");
        } else if (action === "leave") {
            await this.leaveRoom();
        } else if (action === "join-listed") {
            await this.joinRoom(target.dataset.roomId ?? "");
        }
    }

    async createRoom() {
        try {
            this.setLobbyMessage("正在创建房间...");
            const room = await this.client.create("bomberman_room", {
                nickname: this.nickname(),
                privateRoom: this.privateRoom(),
                mapId: this.selectedMapId,
            });
            await this.useRoom(room);
        } catch {
            this.setLobbyMessage("创建失败");
        }
    }

    async joinRoomById() {
        const roomId = this.roomIdInput();
        if (!roomId) {
            this.setLobbyMessage("请输入房间号");
            return;
        }

        await this.joinRoom(roomId);
    }

    async joinRoom(roomId: string) {
        try {
            this.setLobbyMessage("正在加入房间...");
            const room = await this.client.joinById(roomId, {
                nickname: this.nickname(),
            });
            await this.useRoom(room);
        } catch {
            this.setLobbyMessage("加入失败");
        }
    }

    async refreshRoomList() {
        if (!this.roomListEl) {
            return;
        }

        try {
            const response = await fetch(`${BACKEND_HTTP_URL}/rooms/bomberman`);
            const rooms = await response.json() as RoomSummary[];
            const listedRooms = rooms.filter((room) => room.metadata?.listed !== false);
            this.renderRoomList(listedRooms);
            this.setLobbyMessage(listedRooms.length ? "" : "暂无可加入房间");
        } catch {
            this.setLobbyMessage("服务暂不可用");
        }
    }

    async useRoom(room: Room<BombermanRoom>) {
        this.room = room;
        this.recordedMatchRoomId = "";
        this.clearGameObjects();
        this.drawArenaFloor();
        this.statusText.setText(`Room: ${room.roomId}`);
        this.setLobbyMessage("");
        this.switchLobbyView("joined");

        const $ = getStateCallbacks(room);

        room.onMessage("powerUpCollected", (message: PowerUpCollectedMessage) => {
            this.showPowerUpToast(`${message.nickname} 获得 ${message.label}`);
        });

        $(room.state).listen("phase", () => {
            this.renderLobbyState();
            this.updateTouchControlsVisibility();
            this.updatePowerUpPanel();
            this.updateRoundStatus(room.state.roundStatus);
        });

        $(room.state).listen("roundTimerMs", () => {
            this.updateRoundStatus(room.state.roundStatus);
        });

        $(room.state).listen("matchStatus", () => {
            this.renderResultPanel();
            this.updateRoundStatus(room.state.roundStatus);
        });

        $(room.state).listen("matchWinnerSessionId", () => {
            this.renderResultPanel();
        });

        $(room.state).listen("roundStatus", (status) => {
            this.updateRoundStatus(status);
        });

        $(room.state).listen("winnerSessionId", () => {
            this.updateRoundStatus(room.state.roundStatus);
        });

        $(room.state).tiles.onAdd((tile, key) => {
            const { x, y } = this.tileToWorld(tile.x, tile.y);
            const color = tile.type === "solid" ? 0x35495f : 0x9f7148;
            const entity = this.add.rectangle(x, y, room.state.tileSize - 4, room.state.tileSize - 4, color).setDepth(1);
            entity.setStrokeStyle(2, tile.type === "solid" ? 0x1b2733 : 0x6f4b2f);
            this.tileEntities[key] = entity;
        });

        $(room.state).tiles.onRemove((_tile, key) => {
            this.tileEntities[key]?.destroy();
            delete this.tileEntities[key];
        });

        $(room.state).bombs.onAdd((bomb, key) => {
            const { x, y } = this.tileToWorld(bomb.x, bomb.y);
            const entity = this.add.circle(x, y, 17, 0x101820).setDepth(3);
            entity.setStrokeStyle(4, 0xffd166);
            this.bombEntities[key] = entity;

            // 炸弹倒计时由服务端维护，客户端只显示临近爆炸的提示。
            $(bomb).onChange(() => {
                entity.setScale(bomb.timerMs < 450 ? 1.18 : 1);
            });
        });

        $(room.state).bombs.onRemove((_bomb, key) => {
            this.bombEntities[key]?.destroy();
            delete this.bombEntities[key];
        });

        $(room.state).explosions.onAdd((explosion, key) => {
            const { x, y } = this.tileToWorld(explosion.x, explosion.y);
            const entity = this.add.rectangle(x, y, room.state.tileSize - 8, room.state.tileSize - 8, 0xffd166).setDepth(2);
            entity.setStrokeStyle(3, 0xff6b35);
            this.explosionEntities[key] = entity;

            $(explosion).onChange(() => {
                entity.alpha = Phaser.Math.Clamp(explosion.ttlMs / 450, 0.25, 1);
            });
        });

        $(room.state).explosions.onRemove((_explosion, key) => {
            this.explosionEntities[key]?.destroy();
            delete this.explosionEntities[key];
        });

        $(room.state).powerUps.onAdd((powerUp, key) => {
            const { x, y } = this.tileToWorld(powerUp.x, powerUp.y);
            const icon = this.powerUpIcon(powerUp.type);
            const entity = this.add.text(x, y, icon, {
                color: "#ffffff",
                backgroundColor: "#101820",
                fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Microsoft YaHei",
                fontSize: "25px",
                padding: { x: 5, y: 4 },
            }).setOrigin(0.5).setDepth(3);
            this.powerUpEntities[key] = entity;
        });

        $(room.state).powerUps.onRemove((_powerUp, key) => {
            this.powerUpEntities[key]?.destroy();
            delete this.powerUpEntities[key];
        });

        $(room.state).players.onAdd((player, sessionId) => {
            const entity = this.add.rectangle(player.x, player.y, 34, 34, Phaser.Display.Color.HexStringToColor(player.color).color).setDepth(4);
            entity.setStrokeStyle(3, 0x101820);
            this.playerEntities[sessionId] = entity;

            if (sessionId === room.sessionId) {
                this.currentPlayer = entity;
                entity.setStrokeStyle(4, 0xffffff);
            }

            // 玩家昵称、准备状态和房主身份都由服务端同步，客户端只负责展示。
            $(player).onChange(() => {
                entity.x = player.x;
                entity.y = player.y;
                entity.fillColor = Phaser.Display.Color.HexStringToColor(player.color).color;
                entity.alpha = player.alive ? 1 : 0.28;
                this.renderLobbyState();
                this.updatePowerUpPanel();
                this.updateRoundStatus(room.state.roundStatus);
                this.renderResultPanel();
            });

            this.renderLobbyState();
        });

        $(room.state).players.onRemove((_player, sessionId) => {
            this.playerEntities[sessionId]?.destroy();
            delete this.playerEntities[sessionId];
            this.renderLobbyState();
        });

        this.renderLobbyState();
        this.updateTouchControlsVisibility();
        this.updatePowerUpPanel();
        this.renderResultPanel();
    }

    async leaveRoom() {
        if (!this.room) {
            return;
        }

        await this.room.leave();
        this.room = undefined;
        this.currentPlayer = undefined;
        this.clearGameObjects();
        this.statusText.setText("大厅");
        this.renderLobbyState();
        this.updateTouchControlsVisibility();
        this.updatePowerUpPanel();
        this.renderResultPanel();
        this.switchLobbyView("rooms");
        await this.refreshRoomList();
    }

    toggleReady() {
        if (!this.room) {
            return;
        }

        const player = this.room.state.players.get(this.room.sessionId);
        this.room.send("setReady", !player?.ready);
    }

    renderRoomList(rooms: RoomSummary[]) {
        if (!this.roomListEl) {
            return;
        }

        this.roomListEl.innerHTML = "";
        if (!rooms.length) {
            const empty = document.createElement("div");
            empty.className = "empty-card";
            empty.textContent = "暂无公开房间";
            this.roomListEl.appendChild(empty);
            return;
        }

        rooms.forEach((room) => {
            const card = document.createElement("div");
            card.className = "room-card";

            const info = document.createElement("div");
            info.innerHTML = `
                <strong>${room.roomId}</strong>
                <span>${room.metadata?.mapName ?? "经典工厂"} · ${room.metadata?.playerCount ?? room.clients}/${room.metadata?.maxClients ?? room.maxClients} 人 · ${room.metadata?.readyCount ?? 0} 已准备</span>
            `;

            const button = document.createElement("button");
            button.className = "secondary";
            button.dataset.action = "join-listed";
            button.dataset.roomId = room.roomId;
            button.textContent = "加入";

            card.append(info, button);
            this.roomListEl?.appendChild(card);
        });
    }

    renderMapOptions() {
        const mapListEl = this.lobbyPanel?.querySelector<HTMLElement>("[data-role='map-list']");
        if (!mapListEl) {
            return;
        }

        mapListEl.innerHTML = "";
        this.mapOptions.forEach((map) => {
            const button = document.createElement("button");
            button.className = `map-card${map.id === this.selectedMapId ? " is-selected" : ""}`;
            button.dataset.action = "select-map";
            button.dataset.mapId = map.id;
            button.innerHTML = `
                <strong>${map.name}</strong>
                <span>${map.description}</span>
            `;
            mapListEl.appendChild(button);
        });
    }

    switchLobbyView(view: LobbyView) {
        if (!this.lobbyPanel) {
            return;
        }

        this.lobbyView = view;
        this.lobbyPanel.querySelectorAll<HTMLElement>("[data-view-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.viewPanel !== view;
        });
        this.lobbyPanel.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.view === view);
        });

        if (view !== "rooms") {
            this.setLobbyMessage("");
        }
    }

    renderLobbyState() {
        if (!this.lobbyPanel) {
            return;
        }

        const inRoom = Boolean(this.room);
        const inLobby = this.room?.state.phase !== "playing";
        this.lobbyPanel.hidden = Boolean(this.room && !inLobby);
        this.updateTouchControlsVisibility();

        const roomTitle = this.lobbyPanel.querySelector<HTMLElement>("[data-role='room-title']");
        const roomMap = this.lobbyPanel.querySelector<HTMLElement>("[data-role='room-map']");

        if (inRoom && inLobby && this.lobbyView !== "joined") {
            this.switchLobbyView("joined");
        }

        if (!this.room || !this.playerListEl || !roomTitle) {
            return;
        }

        this.setLobbyMessage("");
        roomTitle.textContent = `房间 ${this.room.roomId}`;
        if (roomMap) {
            roomMap.textContent = `地图：${this.room.state.mapName}`;
        }
        this.playerListEl.innerHTML = "";

        const players = Array.from(this.room.state.players.entries());
        players.forEach(([sessionId, player]) => {
            const card = document.createElement("div");
            card.className = "player-card";

            const name = document.createElement("span");
            name.textContent = `${player.nickname}${player.isHost ? " · 房主" : ""}${sessionId === this.room?.sessionId ? " · 我" : ""}`;

            const state = document.createElement("span");
            state.textContent = player.ready ? "已准备" : "等待中";

            card.append(name, state);
            this.playerListEl?.appendChild(card);
        });

        const localPlayer = this.room.state.players.get(this.room.sessionId);
        const allReady = players.length >= 2 && players.every(([, player]) => player.ready);
        const readyButton = this.lobbyPanel.querySelector<HTMLButtonElement>("[data-action='ready']");
        const startButton = this.lobbyPanel.querySelector<HTMLButtonElement>("[data-action='start']");

        if (readyButton) {
            readyButton.textContent = localPlayer?.ready ? "取消准备" : "准备";
        }

        if (startButton) {
            startButton.disabled = !localPlayer?.isHost || !allReady;
        }
    }

    drawArenaFrame() {
        this.footerText = this.add.text(16, 568, "WASD / 方向键移动，空格放炸弹", {
            color: "#f8f3d4",
            fontFamily: "Verdana",
            fontSize: "14px",
        }).setDepth(20);
    }

    drawArenaFloor() {
        if (!this.room) {
            return;
        }

        const width = this.room.state.columns * this.room.state.tileSize;
        const height = this.room.state.rows * this.room.state.tileSize;
        const centerX = this.room.state.offsetX + width / 2;
        const centerY = this.room.state.offsetY + height / 2;

        this.arenaEntities.push(this.add.rectangle(centerX, centerY, width, height, 0x243447).setDepth(0));
        this.arenaEntities.push(this.add.rectangle(centerX, centerY, width, height).setStrokeStyle(4, 0xf8f3d4).setDepth(0));

        // 格子线用于确认炸弹、墙体和爆炸都对齐在同一套服务端地图上。
        for (let x = 0; x <= this.room.state.columns; x++) {
            const worldX = this.room.state.offsetX + x * this.room.state.tileSize;
            this.arenaEntities.push(this.add.line(0, 0, worldX, this.room.state.offsetY, worldX, this.room.state.offsetY + height, 0x2f4358, 0.35).setOrigin(0, 0).setDepth(0));
        }

        for (let y = 0; y <= this.room.state.rows; y++) {
            const worldY = this.room.state.offsetY + y * this.room.state.tileSize;
            this.arenaEntities.push(this.add.line(0, 0, this.room.state.offsetX, worldY, this.room.state.offsetX + width, worldY, 0x2f4358, 0.35).setOrigin(0, 0).setDepth(0));
        }
    }

    updateRoundStatus(status: string) {
        if (!this.room) {
            return;
        }

        if (this.room.state.phase === "lobby") {
            this.statusText.setText(`房间：${this.room.roomId} · 大厅`);
            return;
        }

        const scoreText = this.scoreText();
        const seconds = Math.ceil(this.room.state.roundTimerMs / 1000);

        if (status !== "ended") {
            this.statusText.setText(`房间：${this.room.roomId} · ${seconds}秒 · ${scoreText}`);
            return;
        }

        const winner = this.room.state.winnerSessionId;
        const message = winner
            ? winner === this.room.sessionId
                ? "本局结束：你赢了"
                : "本局结束：对手获胜"
            : "本局结束：平局";
        this.statusText.setText(`${message} · ${scoreText}`);
    }

    renderResultPanel() {
        if (!this.room || !this.resultPanel) {
            return;
        }

        const settled = this.room.state.matchStatus === "settled";
        this.resultPanel.hidden = !settled;
        if (!settled) {
            return;
        }

        const winnerId = this.room.state.matchWinnerSessionId;
        const winner = this.room.state.players.get(winnerId);
        const title = this.resultPanel.querySelector<HTMLElement>("[data-role='result-title']");
        const detail = this.resultPanel.querySelector<HTMLElement>("[data-role='result-detail']");

        if (title) {
            title.textContent = winnerId === this.room.sessionId ? "你赢了" : `${winner?.nickname ?? "玩家"} 获胜`;
        }

        if (detail) {
            detail.textContent = `最终比分：${this.scoreText()}`;
        }

        this.recordLocalMatchResult(winnerId);
    }

    updateTouchControlsVisibility() {
        if (!this.touchControls) {
            return;
        }

        // 移动端按钮只在正式开局后显示，避免遮挡大厅操作。
        this.touchControls.hidden = this.room?.state.phase !== "playing";
    }

    updatePowerUpPanel() {
        if (!this.powerUpPanel) {
            return;
        }

        const player = this.room?.state.players.get(this.room.sessionId);
        const visible = Boolean(this.room && player && this.room.state.phase === "playing");
        this.powerUpPanel.hidden = !visible;
        if (!player) {
            return;
        }

        this.powerUpPanel.querySelector<HTMLElement>("[data-stat='bomb']")!.textContent = `${player.bombLimit}`;
        this.powerUpPanel.querySelector<HTMLElement>("[data-stat='range']")!.textContent = `${player.blastRange}`;
        this.powerUpPanel.querySelector<HTMLElement>("[data-stat='speed']")!.textContent = player.speed.toFixed(1);
        this.powerUpPanel.querySelector<HTMLElement>("[data-stat='shield']")!.textContent = player.shield ? "有" : "无";
    }

    showPowerUpToast(message: string) {
        const toast = this.powerUpPanel?.querySelector<HTMLElement>("[data-role='powerup-toast']");
        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.hidden = false;
        if (this.powerUpToastTimer) {
            window.clearTimeout(this.powerUpToastTimer);
        }
        this.powerUpToastTimer = window.setTimeout(() => {
            toast.hidden = true;
        }, 1600);
    }

    clearGameObjects() {
        [
            ...Object.values(this.playerEntities),
            ...Object.values(this.tileEntities),
            ...Object.values(this.bombEntities),
            ...Object.values(this.explosionEntities),
            ...Object.values(this.powerUpEntities),
            ...this.arenaEntities,
        ].forEach((entity) => entity.destroy());

        this.playerEntities = {};
        this.tileEntities = {};
        this.bombEntities = {};
        this.explosionEntities = {};
        this.powerUpEntities = {};
        this.arenaEntities = [];
    }

    pulseExplosions() {
        Object.values(this.explosionEntities).forEach((entity) => {
            entity.scale = 1 + Math.sin(this.currentTick * 0.35) * 0.04;
        });
    }

    tileToWorld(tileX: number, tileY: number) {
        if (!this.room) {
            return { x: 0, y: 0 };
        }

        return {
            x: this.room.state.offsetX + tileX * this.room.state.tileSize + this.room.state.tileSize / 2,
            y: this.room.state.offsetY + tileY * this.room.state.tileSize + this.room.state.tileSize / 2,
        };
    }

    setLobbyMessage(message: string) {
        if (this.lobbyMessageEl) {
            this.lobbyMessageEl.textContent = message;
        }
    }

    nickname() {
        const nickname = this.lobbyPanel?.querySelector<HTMLInputElement>("#bomberman-nickname")?.value ?? "玩家";
        updateProfile({ nickname });
        return nickname;
    }

    privateRoom() {
        return Boolean(this.lobbyPanel?.querySelector<HTMLInputElement>("#bomberman-private")?.checked);
    }

    roomIdInput() {
        return this.lobbyPanel?.querySelector<HTMLInputElement>("#bomberman-room-id")?.value.trim() ?? "";
    }

    scoreText() {
        if (!this.room) {
            return "";
        }

        return Array.from(this.room.state.players.values())
            .map((player) => `${player.nickname} ${player.score}`)
            .join(" / ");
    }

    powerUpIcon(type: string) {
        if (type === "bomb") {
            return "💣";
        }

        if (type === "range") {
            return "🔥";
        }

        if (type === "speed") {
            return "⚡";
        }

        return "🛡️";
    }

    recordLocalMatchResult(winnerId: string) {
        if (!this.room || this.recordedMatchRoomId === this.room.roomId) {
            return;
        }

        // 本地个人战绩只在整场比赛结算时记录一次，避免 UI 重绘重复计数。
        if (!winnerId) {
            recordMatchResult("draw");
        } else if (winnerId === this.room.sessionId) {
            recordMatchResult("win");
        } else {
            recordMatchResult("loss");
        }

        this.recordedMatchRoomId = this.room.roomId;
    }
}
