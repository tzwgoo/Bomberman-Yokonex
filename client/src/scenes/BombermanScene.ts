import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

import { BACKEND_HTTP_URL, BACKEND_URL } from "../backend";
import { BOMBERMAN_MAP_OPTIONS, type BombermanMapOption } from "../bombermanMaps";
import { isLoggedIn, loadAuthState } from "../authStore";
import { loadProfileState, recordMatchResult, type PlayerProfile } from "../profileStore";
import { soundManager } from "../soundManager";

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
        mapDescription?: string;
        mapDifficulty?: string;
        mapRecommendedPlayers?: string;
        mapPreview?: string;
        playerCount?: number;
        readyCount?: number;
        maxClients?: number;
        hasPassword?: boolean;
        countdownMs?: number;
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
    playerAvatarEntities: Record<string, Phaser.GameObjects.Text> = {};
    playerNameEntities: Record<string, Phaser.GameObjects.Text> = {};
    tileEntities: Record<string, Phaser.GameObjects.Rectangle> = {};
    bombEntities: Record<string, Phaser.GameObjects.Arc> = {};
    explosionEntities: Record<string, Phaser.GameObjects.Rectangle> = {};
    powerUpEntities: Record<string, Phaser.GameObjects.Text> = {};
    arenaEntities: Phaser.GameObjects.GameObject[] = [];
    statusText: Phaser.GameObjects.Text;
    footerText: Phaser.GameObjects.Text;
    feedbackText?: Phaser.GameObjects.Text;
    lobbyPanel?: HTMLElement;
    resultPanel?: HTMLElement;
    touchControls?: HTMLElement;
    powerUpPanel?: HTMLElement;
    matchPanel?: HTMLElement;
    networkBanner?: HTMLElement;
    roomListEl?: HTMLElement;
    playerListEl?: HTMLElement;
    lobbyMessageEl?: HTMLElement;
    lobbyView: LobbyView = "rooms";
    selectedMapId = BOMBERMAN_MAP_OPTIONS[0].id;
    selectedMaxPlayers = 4;
    mapOptions: BombermanMapOption[] = BOMBERMAN_MAP_OPTIONS;
    touchInput = {
        left: false,
        right: false,
        up: false,
        down: false,
    };
    touchStick = {
        active: false,
        pointerId: -1,
        maxRadius: 46,
    };
    touchBombQueued = false;
    soundEnabled = soundManager.isEnabled();
    powerUpToastTimer?: number;
    networkTimer?: number;
    hudLayoutHandler?: () => void;
    lastRoundIntroSecond = 0;
    lastRoundStatus = "";
    playerAliveState: Record<string, boolean> = {};
    intentionalLeaving = false;
    recordedMatchRoomId = "";
    matching = false;
    matchCanceled = false;

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
        if (!isLoggedIn()) {
            window.sessionStorage.setItem("bomberman:auth-redirect", "bomberman");
            window.location.hash = "auth";
            this.scene.start("auth");
            return;
        }

        this.cameras.main.setBackgroundColor(0x17202a);
        this.cursorKeys = this.input.keyboard.createCursorKeys();
        this.wasdKeys = this.input.keyboard.addKeys("W,A,S,D,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;

        this.drawArenaFrame();
        this.statusText = this.add.text(16, 12, "大厅", {
            color: "#f8f3d4",
            fontFamily: "Verdana",
            fontSize: "16px",
        }).setDepth(20);
        this.feedbackText = this.add.text(400, 290, "", {
            color: "#fff5d6",
            fontFamily: "Microsoft YaHei",
            fontSize: "44px",
            fontStyle: "bold",
            stroke: "#101820",
            strokeThickness: 6,
        }).setOrigin(0.5).setDepth(30).setVisible(false);

        this.createLobbyPanel();
        this.createResultPanel();
        this.createPowerUpPanel();
        this.createNetworkBanner();
        this.createTouchControls();
        this.setupHudLayout();
        this.startNetworkMonitor();
        this.refreshRoomList();
        this.consumeAutoMatchRequest();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.destroyHudLayout();
            this.destroyLobbyPanel();
            this.destroyResultPanel();
            this.destroyPowerUpPanel();
            this.destroyMatchPanel();
            this.destroyNetworkBanner();
            this.destroyTouchControls();
        });
    }

    update(_time: number, delta: number) {
        this.updateRoundIntroFeedback();

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

        if (this.room.state.roundIntroMs > 0) {
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
                        <label for="bomberman-room-password">房间密码</label>
                        <input id="bomberman-room-password" type="password" placeholder="有密码时填写" />
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
                    <div class="create-options">
                        <div>
                            <label>人数上限</label>
                            <div class="option-buttons" data-role="max-players">
                                <button data-action="select-max" data-max="2">2人</button>
                                <button data-action="select-max" data-max="3">3人</button>
                                <button data-action="select-max" data-max="4">4人</button>
                            </div>
                        </div>
                        <div>
                            <label for="bomberman-create-password">房间密码</label>
                            <input id="bomberman-create-password" type="password" placeholder="不填则无需密码" />
                        </div>
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
                    <div class="countdown-banner" data-role="countdown" hidden></div>
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
        this.renderMaxPlayerOptions();
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
            <div class="result-scoreboard" data-role="result-scoreboard"></div>
            <button data-action="result-leave">返回大厅</button>
        `;
        panel.addEventListener("click", async (event) => {
            const target = event.target as HTMLElement;
            if (target.dataset.action === "result-leave") {
                soundManager.play("button");
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

    setupHudLayout() {
        this.hudLayoutHandler = () => this.syncHudLayout();
        window.addEventListener("resize", this.hudLayoutHandler);
        this.syncHudLayout();
        window.requestAnimationFrame(this.hudLayoutHandler);
    }

    destroyHudLayout() {
        if (this.hudLayoutHandler) {
            window.removeEventListener("resize", this.hudLayoutHandler);
        }
        document.body.classList.remove("hud-side-rail");
        this.hudLayoutHandler = undefined;
    }

    syncHudLayout() {
        const canvasRect = this.game.canvas.getBoundingClientRect();
        const railWidth = 132;
        const safeGap = 18;
        const rightSpace = window.innerWidth - canvasRect.right;

        // 右侧空间足够时，道具栏贴到地图外侧，避免遮挡战斗区域。
        document.body.classList.toggle("hud-side-rail", rightSpace >= railWidth + safeGap);
    }

    destroyPowerUpPanel() {
        if (this.powerUpToastTimer) {
            window.clearTimeout(this.powerUpToastTimer);
        }
        this.powerUpPanel?.remove();
        this.powerUpPanel = undefined;
    }

    createNetworkBanner() {
        const banner = document.createElement("section");
        banner.className = "network-banner";
        banner.hidden = true;
        banner.innerHTML = `
            <strong data-role="network-title">连接正常</strong>
            <span data-role="network-detail"></span>
        `;
        document.body.appendChild(banner);
        this.networkBanner = banner;
    }

    destroyNetworkBanner() {
        if (this.networkTimer) {
            window.clearInterval(this.networkTimer);
        }
        this.networkBanner?.remove();
        this.networkBanner = undefined;
    }

    startNetworkMonitor() {
        const check = async () => {
            const startedAt = Date.now();
            try {
                await fetch(`${BACKEND_HTTP_URL}/hello`, { cache: "no-store" });
                const latency = Date.now() - startedAt;
                if (latency > 800) {
                    this.setNetworkStatus("网络偏慢", `${latency}ms，操作可能有延迟`);
                } else {
                    this.setNetworkStatus("", "");
                }
            } catch {
                this.setNetworkStatus("连接异常", "正在等待服务恢复");
            }
        };

        void check();
        this.networkTimer = window.setInterval(check, 5000);
    }

    setNetworkStatus(title: string, detail: string) {
        if (!this.networkBanner) {
            return;
        }

        this.networkBanner.hidden = !title;
        this.networkBanner.querySelector<HTMLElement>("[data-role='network-title']")!.textContent = title;
        this.networkBanner.querySelector<HTMLElement>("[data-role='network-detail']")!.textContent = detail;
    }

    createMatchPanel() {
        this.destroyMatchPanel();

        const panel = document.createElement("section");
        panel.className = "match-panel";
        panel.innerHTML = `
            <div class="match-card">
                <p>随机匹配</p>
                <h2 data-role="match-title">正在寻找房间</h2>
                <span data-role="match-detail">优先加入等待中的公开房间。</span>
                <button data-action="cancel-match">取消匹配</button>
            </div>
        `;
        panel.addEventListener("click", (event) => this.handleLobbyClick(event));
        document.body.appendChild(panel);
        this.matchPanel = panel;
    }

    destroyMatchPanel() {
        this.matchPanel?.remove();
        this.matchPanel = undefined;
    }

    createTouchControls() {
        const controls = document.createElement("section");
        controls.className = "touch-controls";
        controls.hidden = true;
        controls.innerHTML = `
            <div class="touch-pad" data-action="touch-stick" aria-label="移动摇杆">
                <div class="touch-stick-track">
                    <span class="touch-stick-hint">移动</span>
                    <i class="touch-stick-knob"></i>
                </div>
            </div>
            <div class="orientation-tip">建议横屏游玩</div>
            <div class="touch-actions">
                <button class="touch-button skill" disabled aria-label="技能预留">技</button>
                <button class="touch-button bomb" data-action="touch-bomb" aria-label="放置炸弹">弹</button>
            </div>
            <button class="touch-button sound-toggle" data-action="sound-toggle" aria-label="音效开关">音</button>
        `;

        controls.addEventListener("pointerdown", (event) => this.handleTouchPointer(event));
        controls.addEventListener("pointermove", (event) => this.handleTouchPointer(event));
        controls.addEventListener("pointerup", (event) => this.handleTouchPointer(event));
        controls.addEventListener("pointercancel", (event) => this.handleTouchPointer(event));
        controls.addEventListener("pointerleave", (event) => this.handleTouchPointer(event));
        document.body.appendChild(controls);
        this.touchControls = controls;
        this.syncSoundToggle();
    }

    destroyTouchControls() {
        this.touchControls?.remove();
        this.touchControls = undefined;
    }

    handleTouchPointer(event: PointerEvent) {
        const target = event.target as HTMLElement;
        const touchPad = target.closest<HTMLElement>(".touch-pad");
        if (touchPad) {
            this.handleTouchStick(event, touchPad);
            return;
        }

        const button = target.closest<HTMLButtonElement>("button");
        if (!button || button.disabled) {
            return;
        }

        event.preventDefault();
        void soundManager.unlock();
        if (event.type !== "pointerdown") {
            return;
        }

        if (button.dataset.action === "touch-bomb") {
            this.touchBombQueued = true;
            soundManager.play("button");
            button.classList.add("is-active");
            window.setTimeout(() => button.classList.remove("is-active"), 120);
        } else if (button.dataset.action === "sound-toggle") {
            this.soundEnabled = soundManager.toggle();
            this.syncSoundToggle();
            soundManager.play("button");
        }
    }

    handleTouchStick(event: PointerEvent, pad: HTMLElement) {
        event.preventDefault();
        void soundManager.unlock();

        if (event.type === "pointerdown") {
            if (this.touchStick.active) {
                return;
            }

            this.touchStick.active = true;
            this.touchStick.pointerId = event.pointerId;
            pad.classList.add("is-active");
            pad.setPointerCapture?.(event.pointerId);
            this.updateTouchStickVector(event, pad);
            return;
        }

        if (!this.touchStick.active || this.touchStick.pointerId !== event.pointerId) {
            return;
        }

        if (event.type === "pointermove") {
            this.updateTouchStickVector(event, pad);
            return;
        }

        this.resetTouchStick(pad);
    }

    updateTouchStickVector(event: PointerEvent, pad: HTMLElement) {
        const rect = pad.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = event.clientX - centerX;
        const deltaY = event.clientY - centerY;
        const distance = Math.hypot(deltaX, deltaY);
        const radius = Math.min(distance, this.touchStick.maxRadius);
        const angle = Math.atan2(deltaY, deltaX);
        const knobX = distance > 0 ? Math.cos(angle) * radius : 0;
        const knobY = distance > 0 ? Math.sin(angle) * radius : 0;

        // 摇杆只在超过死区后才输出方向，减少手指轻微抖动导致的误移动。
        const deadZone = 14;
        this.touchInput.left = deltaX < -deadZone;
        this.touchInput.right = deltaX > deadZone;
        this.touchInput.up = deltaY < -deadZone;
        this.touchInput.down = deltaY > deadZone;

        pad.style.setProperty("--stick-x", `${knobX}px`);
        pad.style.setProperty("--stick-y", `${knobY}px`);
    }

    resetTouchStick(pad = this.touchControls?.querySelector<HTMLElement>(".touch-pad")) {
        this.touchStick.active = false;
        this.touchStick.pointerId = -1;
        this.touchInput.left = false;
        this.touchInput.right = false;
        this.touchInput.up = false;
        this.touchInput.down = false;
        pad?.classList.remove("is-active");
        pad?.style.setProperty("--stick-x", "0px");
        pad?.style.setProperty("--stick-y", "0px");
    }

    syncSoundToggle() {
        const button = this.touchControls?.querySelector<HTMLButtonElement>("[data-action='sound-toggle']");
        if (button) {
            button.textContent = soundManager.isEnabled() ? "音" : "静";
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

        void soundManager.unlock();
        soundManager.play("button");

        const action = target.dataset.action;
        if (action === "show-rooms") {
            this.switchLobbyView("rooms");
        } else if (action === "show-create") {
            this.switchLobbyView("create");
        } else if (action === "select-map") {
            this.selectedMapId = target.dataset.mapId ?? this.selectedMapId;
            this.renderMapOptions();
        } else if (action === "select-max") {
            this.selectedMaxPlayers = Number(target.dataset.max ?? this.selectedMaxPlayers);
            this.renderMaxPlayerOptions();
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
            await this.joinListedRoom(target.dataset.roomId ?? "", target.dataset.hasPassword === "true");
        } else if (action === "cancel-match") {
            this.cancelRandomMatch();
        } else if (action === "kick-player") {
            this.room?.send("kickPlayer", target.dataset.sessionId ?? "");
        } else if (action === "transfer-host") {
            this.room?.send("transferHost", target.dataset.sessionId ?? "");
        }
    }

    consumeAutoMatchRequest() {
        if (window.sessionStorage.getItem("bomberman:auto-match") !== "1") {
            return;
        }

        window.sessionStorage.removeItem("bomberman:auto-match");
        void this.startRandomMatch();
    }

    async startRandomMatch() {
        if (this.matching || this.room) {
            return;
        }

        this.matching = true;
        this.matchCanceled = false;
        this.createMatchPanel();
        this.setMatchStatus("正在寻找房间", "优先加入等待中的公开房间。");

        try {
            const rooms = await this.fetchListedRooms();
            const candidates = rooms.filter((room) => {
                const metadata = room.metadata;
                const playerCount = metadata?.playerCount ?? room.clients;
                const maxClients = metadata?.maxClients ?? room.maxClients;
                return metadata?.phase === "lobby" && playerCount < maxClients;
            });

            for (const room of candidates) {
                if (this.matchCanceled) {
                    this.finishRandomMatch();
                    return;
                }

                try {
                    this.setMatchStatus("正在加入房间", `房间 ${room.roomId}`);
                    const joinedRoom = await this.client.joinById(room.roomId, {
                        ...this.profilePayload(),
                    });
                    await this.handleMatchedRoom(joinedRoom);
                    return;
                } catch {
                    if (this.room) {
                        this.finishRandomMatch();
                        return;
                    }

                    // 单个房间可能刚满或开局，继续尝试下一个公开房间。
                }
            }

            if (this.matchCanceled) {
                this.finishRandomMatch();
                return;
            }

            this.setMatchStatus("正在创建房间", "暂无可用房间，正在为你创建公开房间。");
            const createdRoom = await this.client.create("bomberman_room", {
                ...this.profilePayload(),
                privateRoom: false,
                mapId: this.selectedMapId,
                maxClients: 4,
            });
            await this.handleMatchedRoom(createdRoom);
        } catch {
            if (this.room) {
                this.finishRandomMatch();
                return;
            }

            this.matching = false;
            this.setMatchStatus("匹配失败", "服务暂不可用，请稍后重试。", true);
            this.setLobbyMessage("匹配失败，请稍后重试");
        }
    }

    async handleMatchedRoom(room: Room<BombermanRoom>) {
        if (this.matchCanceled) {
            await room.leave();
            this.finishRandomMatch();
            return;
        }

        try {
            await this.useRoom(room);
        } finally {
            this.finishRandomMatch();
        }
    }

    cancelRandomMatch() {
        if (!this.matching) {
            this.destroyMatchPanel();
            return;
        }

        this.matchCanceled = true;
        this.setMatchStatus("已取消匹配", "你仍在多人对战大厅。", true);
        this.finishRandomMatch();
    }

    finishRandomMatch() {
        this.matching = false;
        this.destroyMatchPanel();
    }

    setMatchStatus(title: string, detail: string, finished = false) {
        const titleEl = this.matchPanel?.querySelector<HTMLElement>("[data-role='match-title']");
        const detailEl = this.matchPanel?.querySelector<HTMLElement>("[data-role='match-detail']");
        const button = this.matchPanel?.querySelector<HTMLButtonElement>("[data-action='cancel-match']");

        if (titleEl) {
            titleEl.textContent = title;
        }

        if (detailEl) {
            detailEl.textContent = detail;
        }

        if (button) {
            button.textContent = finished ? "知道了" : "取消匹配";
        }
    }

    async createRoom() {
        try {
            this.setLobbyMessage("正在创建房间...");
            const room = await this.client.create("bomberman_room", {
                ...this.profilePayload(),
                privateRoom: this.privateRoom(),
                mapId: this.selectedMapId,
                maxClients: this.selectedMaxPlayers,
                password: this.createPassword(),
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

        await this.joinRoom(roomId, this.joinPassword());
    }

    async joinListedRoom(roomId: string, hasPassword: boolean) {
        const password = hasPassword ? window.prompt("请输入房间密码") ?? "" : "";
        if (hasPassword && !password) {
            this.setLobbyMessage("请输入房间密码");
            return;
        }

        await this.joinRoom(roomId, password);
    }

    async joinRoom(roomId: string, password = "") {
        try {
            this.setLobbyMessage("正在加入房间...");
            const room = await this.client.joinById(roomId, {
                ...this.profilePayload(),
                password,
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
            const rooms = await this.fetchListedRooms();
            const listedRooms = rooms.filter((room) => room.metadata?.listed !== false);
            this.renderRoomList(listedRooms);
            this.setLobbyMessage(listedRooms.length ? "" : "暂无可加入房间");
        } catch {
            this.setLobbyMessage("服务暂不可用");
        }
    }

    async fetchListedRooms() {
        const response = await fetch(`${BACKEND_HTTP_URL}/rooms/bomberman`);
        return await response.json() as RoomSummary[];
    }

    async useRoom(room: Room<BombermanRoom>) {
        this.room = room;
        this.intentionalLeaving = false;
        this.recordedMatchRoomId = "";
        this.lastRoundIntroSecond = 0;
        this.lastRoundStatus = "";
        this.playerAliveState = {};
        this.clearGameObjects();
        this.drawArenaFloor();
        this.statusText.setText(`Room: ${room.roomId}`);
        this.setLobbyMessage("");
        this.switchLobbyView("joined");

        const $ = getStateCallbacks(room);

        room.onMessage("powerUpCollected", (message: PowerUpCollectedMessage) => {
            soundManager.play("powerup");
            this.showPowerUpToast(`${message.nickname} 获得 ${message.label}`);
            this.showCombatFeedback(`获得 ${message.label}`, 0x63d2ff);
        });

        room.onError((_code, message) => {
            this.setNetworkStatus("房间连接异常", message ?? "请返回大厅后重试");
        });

        room.onLeave((_code, reason) => {
            if (this.room !== room) {
                return;
            }

            if (this.intentionalLeaving || reason === "kicked") {
                this.returnToLobby(reason === "kicked" ? "你已被房主移出房间" : "");
                void this.refreshRoomList();
                return;
            }

            void this.tryReconnectRoom(room);
        });

        $(room.state).listen("phase", () => {
            this.renderLobbyState();
            this.updateTouchControlsVisibility();
            this.updatePowerUpPanel();
            this.updateRoundStatus(room.state.roundStatus);
        });

        $(room.state).listen("countdownMs", () => {
            this.renderLobbyState();
        });

        $(room.state).listen("roundTimerMs", () => {
            this.updateRoundStatus(room.state.roundStatus);
        });

        $(room.state).listen("roundIntroMs", () => {
            this.updateRoundIntroFeedback();
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
            if (status === "ended" && this.lastRoundStatus !== "ended") {
                this.showRoundEndFeedback();
            }
            this.lastRoundStatus = status;
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
            soundManager.play("bomb");
            this.tweens.add({
                targets: entity,
                scale: { from: 0.72, to: 1 },
                duration: 160,
                ease: "Back.Out",
            });

            // 炸弹倒计时由服务端维护，客户端只显示临近爆炸的提示。
            $(bomb).onChange(() => {
                entity.setScale(bomb.timerMs < 450 ? 1.2 : 1 + Math.sin(this.currentTick * 0.18) * 0.05);
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
            entity.setScale(0.2);
            this.explosionEntities[key] = entity;
            soundManager.play("explosion");
            this.tweens.add({
                targets: entity,
                scale: 1,
                duration: 120,
                ease: "Quad.Out",
            });

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
            this.tweens.add({
                targets: entity,
                y: y - 4,
                scale: { from: 0.78, to: 1 },
                duration: 420,
                yoyo: true,
                repeat: -1,
                ease: "Sine.InOut",
            });
        });

        $(room.state).powerUps.onRemove((_powerUp, key) => {
            this.powerUpEntities[key]?.destroy();
            delete this.powerUpEntities[key];
        });

        $(room.state).players.onAdd((player, sessionId) => {
            const entity = this.add.rectangle(player.x, player.y, 34, 34, Phaser.Display.Color.HexStringToColor(player.color).color).setDepth(4);
            entity.setStrokeStyle(3, this.skinStrokeColor(player.skinId));
            const avatar = this.add.text(player.x, player.y + 1, player.avatar, {
                color: "#ffffff",
                fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Microsoft YaHei",
                fontSize: "20px",
            }).setOrigin(0.5).setDepth(5);
            const nameLabel = this.add.text(player.x, player.y - 31, player.nickname, {
                color: "#fff5d6",
                fontFamily: "Microsoft YaHei",
                fontSize: "12px",
                backgroundColor: "#101820",
                padding: { x: 4, y: 2 },
            }).setOrigin(0.5).setDepth(5);
            this.playerEntities[sessionId] = entity;
            this.playerAvatarEntities[sessionId] = avatar;
            this.playerNameEntities[sessionId] = nameLabel;
            this.playerAliveState[sessionId] = player.alive;

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
                entity.setStrokeStyle(sessionId === room.sessionId ? 4 : 3, sessionId === room.sessionId ? 0xffffff : this.skinStrokeColor(player.skinId));
                avatar.x = player.x;
                avatar.y = player.y + 1;
                avatar.text = player.avatar;
                avatar.alpha = player.alive ? 1 : 0.28;
                nameLabel.x = player.x;
                nameLabel.y = player.y - 31;
                nameLabel.text = player.nickname;
                nameLabel.alpha = player.alive ? 1 : 0.28;
                if (this.playerAliveState[sessionId] && !player.alive) {
                    this.showHitFeedback(sessionId, player.nickname);
                }
                this.playerAliveState[sessionId] = player.alive;
                this.renderLobbyState();
                this.updatePowerUpPanel();
                this.updateRoundStatus(room.state.roundStatus);
                this.renderResultPanel();
            });

            this.renderLobbyState();
        });

        $(room.state).players.onRemove((_player, sessionId) => {
            this.playerEntities[sessionId]?.destroy();
            this.playerAvatarEntities[sessionId]?.destroy();
            this.playerNameEntities[sessionId]?.destroy();
            delete this.playerEntities[sessionId];
            delete this.playerAvatarEntities[sessionId];
            delete this.playerNameEntities[sessionId];
            delete this.playerAliveState[sessionId];
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

        const leavingRoom = this.room;
        this.intentionalLeaving = true;
        await leavingRoom.leave();
        if (this.room !== leavingRoom) {
            return;
        }

        this.returnToLobby("");
        await this.refreshRoomList();
    }

    async tryReconnectRoom(previousRoom: Room<BombermanRoom>) {
        this.setNetworkStatus("连接中断", "正在尝试重连...");

        try {
            const reconnectedRoom = await this.client.reconnect<BombermanRoom>(previousRoom.reconnectionToken);
            if (this.room !== previousRoom) {
                return;
            }

            this.setNetworkStatus("", "");
            await this.useRoom(reconnectedRoom);
        } catch {
            if (this.room !== previousRoom) {
                return;
            }

            this.returnToLobby("重连失败，已返回大厅");
            await this.refreshRoomList();
        }
    }

    returnToLobby(message: string) {
        this.room = undefined;
        this.currentPlayer = undefined;
        this.clearGameObjects();
        this.statusText.setText("大厅");
        this.renderLobbyState();
        this.updateTouchControlsVisibility();
        this.updatePowerUpPanel();
        this.renderResultPanel();
        this.switchLobbyView("rooms");
        this.setLobbyMessage(message);
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
                <span>${room.metadata?.mapName ?? "经典工厂"} · ${room.metadata?.mapDifficulty ?? "普通"} · 推荐${room.metadata?.mapRecommendedPlayers ?? "2-4"}人</span>
                <span>${room.metadata?.playerCount ?? room.clients}/${room.metadata?.maxClients ?? room.maxClients} 人 · ${room.metadata?.readyCount ?? 0} 已准备 · ${room.metadata?.hasPassword ? "有密码" : "公开"}</span>
            `;
            const preview = this.createMapPreview(room.metadata?.mapPreview?.split("|") ?? [], "mini-map-preview");

            const button = document.createElement("button");
            button.className = "secondary";
            button.dataset.action = "join-listed";
            button.dataset.roomId = room.roomId;
            button.dataset.hasPassword = String(Boolean(room.metadata?.hasPassword));
            button.textContent = "加入";

            card.append(preview, info, button);
            this.roomListEl?.appendChild(card);
        });
    }

    renderMaxPlayerOptions() {
        const options = this.lobbyPanel?.querySelectorAll<HTMLButtonElement>("[data-action='select-max']");
        options?.forEach((button) => {
            button.classList.toggle("is-selected", Number(button.dataset.max) === this.selectedMaxPlayers);
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
            button.appendChild(this.createMapPreview(map.previewRows, "map-preview"));
            const info = document.createElement("div");
            info.className = "map-card-info";
            info.innerHTML = `
                <strong>${map.name}</strong>
                <span>${map.description}</span>
                <em>${map.difficulty} · 推荐${map.recommendedPlayers}人</em>
            `;
            button.appendChild(info);
            mapListEl.appendChild(button);
        });
    }

    createMapPreview(rows: string[], className: string) {
        const preview = document.createElement("div");
        preview.className = className;
        const safeRows = rows.length ? rows : ["########", "#..x...#", "#.#.#..#", "#..x...#", "#..#.#.#", "#...x..#", "########"];

        safeRows.forEach((row) => {
            Array.from(row).forEach((cell) => {
                const tile = document.createElement("i");
                tile.className = cell === "#" ? "solid" : cell === "x" ? "crate" : cell === "?" ? "random" : "empty";
                preview.appendChild(tile);
            });
        });

        return preview;
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
        const countdown = this.lobbyPanel.querySelector<HTMLElement>("[data-role='countdown']");

        if (inRoom && inLobby && this.lobbyView !== "joined") {
            this.switchLobbyView("joined");
        }

        if (!this.room || !this.playerListEl || !roomTitle) {
            return;
        }

        this.setLobbyMessage("");
        roomTitle.textContent = `房间 ${this.room.roomId}`;
        const localPlayer = this.room.state.players.get(this.room.sessionId);
        const players = Array.from(this.room.state.players.entries());
        if (roomMap) {
            roomMap.textContent = `地图：${this.room.state.mapName} · ${this.room.state.mapDifficulty} · 推荐${this.room.state.mapRecommendedPlayers}人 · ${players.length}/${this.room.state.maxPlayers} 人${this.room.state.hasPassword ? " · 有密码" : ""}`;
        }

        if (countdown) {
            const seconds = Math.ceil(this.room.state.countdownMs / 1000);
            countdown.hidden = this.room.state.countdownMs <= 0;
            countdown.textContent = `开局倒计时：${seconds} 秒`;
        }
        this.playerListEl.innerHTML = "";

        players.forEach(([sessionId, player]) => {
            const card = document.createElement("div");
            card.className = "player-card";

            const avatar = document.createElement("div");
            avatar.className = "player-avatar";
            avatar.style.background = player.color;
            avatar.textContent = player.avatar;

            const info = document.createElement("div");
            info.className = "player-info";

            const name = document.createElement("strong");
            name.textContent = `${player.nickname}${player.isHost ? " · 房主" : ""}${sessionId === this.room?.sessionId ? " · 我" : ""}`;

            const role = document.createElement("span");
            role.textContent = player.title;
            info.append(name, role);

            const state = document.createElement("span");
            state.textContent = player.ready ? "已准备" : "等待中";
            state.className = player.ready ? "ready-state is-ready" : "ready-state";

            card.append(avatar, info, state);
            if (localPlayer?.isHost && sessionId !== this.room?.sessionId) {
                const actions = document.createElement("div");
                actions.className = "player-actions";

                const transferButton = document.createElement("button");
                transferButton.className = "secondary";
                transferButton.dataset.action = "transfer-host";
                transferButton.dataset.sessionId = sessionId;
                transferButton.textContent = "转让";

                const kickButton = document.createElement("button");
                kickButton.className = "danger";
                kickButton.dataset.action = "kick-player";
                kickButton.dataset.sessionId = sessionId;
                kickButton.textContent = "踢出";

                actions.append(transferButton, kickButton);
                card.appendChild(actions);
            }
            this.playerListEl?.appendChild(card);
        });

        const allReady = players.length >= 2 && players.every(([, player]) => player.ready);
        const readyButton = this.lobbyPanel.querySelector<HTMLButtonElement>("[data-action='ready']");
        const startButton = this.lobbyPanel.querySelector<HTMLButtonElement>("[data-action='start']");

        if (readyButton) {
            readyButton.textContent = localPlayer?.ready ? "取消准备" : "准备";
        }

        if (startButton) {
            startButton.disabled = !localPlayer?.isHost || !allReady || this.room.state.countdownMs > 0;
            startButton.textContent = this.room.state.countdownMs > 0 ? "倒计时中" : "开始";
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

    updateRoundIntroFeedback() {
        if (!this.room || this.room.state.phase !== "playing" || this.room.state.roundIntroMs <= 0) {
            this.lastRoundIntroSecond = 0;
            return;
        }

        const second = Math.ceil(this.room.state.roundIntroMs / 1000);
        if (second !== this.lastRoundIntroSecond) {
            this.lastRoundIntroSecond = second;
            this.showCombatFeedback(second > 0 ? `${second}` : "开始", 0xf6c453);
        }
    }

    showRoundEndFeedback() {
        if (!this.room) {
            return;
        }

        const winnerId = this.room.state.winnerSessionId;
        const winner = this.room.state.players.get(winnerId);
        const message = winnerId
            ? winnerId === this.room.sessionId
                ? "本局胜利"
                : `${winner?.nickname ?? "对手"} 拿下本局`
            : "本局平局";
        this.showCombatFeedback(message, 0xff7a35);
    }

    showHitFeedback(sessionId: string, nickname: string) {
        const entity = this.playerEntities[sessionId];
        soundManager.play("hit");
        if (entity) {
            this.tweens.add({
                targets: entity,
                alpha: { from: 1, to: 0.25 },
                duration: 90,
                yoyo: true,
                repeat: 3,
            });
        }

        const message = sessionId === this.room?.sessionId ? "你被击中" : `${nickname} 被击中`;
        this.showCombatFeedback(message, 0xd85656);
    }

    showCombatFeedback(message: string, color: number) {
        if (!this.feedbackText) {
            return;
        }

        this.feedbackText.setText(message);
        this.feedbackText.setColor(`#${color.toString(16).padStart(6, "0")}`);
        this.feedbackText.setVisible(true);
        this.feedbackText.setAlpha(0);
        this.feedbackText.setScale(0.88);
        this.tweens.killTweensOf(this.feedbackText);
        this.tweens.add({
            targets: this.feedbackText,
            alpha: { from: 0, to: 1 },
            scale: { from: 0.88, to: 1 },
            duration: 130,
            ease: "Quad.Out",
            yoyo: true,
            hold: 520,
            onComplete: () => {
                this.feedbackText?.setVisible(false);
            },
        });
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
        const scoreboard = this.resultPanel.querySelector<HTMLElement>("[data-role='result-scoreboard']");

        if (title) {
            title.textContent = winnerId === this.room.sessionId ? "你赢了" : `${winner?.nickname ?? "玩家"} 获胜`;
        }

        if (detail) {
            detail.textContent = `地图：${this.room.state.mapName} · 第 ${this.room.state.roundNumber} 局`;
        }

        if (scoreboard) {
            scoreboard.innerHTML = "";
            Array.from(this.room.state.players.entries())
                .sort(([, a], [, b]) => b.score - a.score)
                .forEach(([sessionId, player]) => {
                    const row = document.createElement("span");
                    row.className = sessionId === winnerId ? "is-winner" : "";
                    row.innerHTML = `<i>${player.avatar}</i><b>${player.nickname}</b><strong>${player.score}</strong>`;
                    scoreboard.appendChild(row);
                });
        }

        this.recordLocalMatchResult(winnerId);
    }

    updateTouchControlsVisibility() {
        if (!this.touchControls) {
            return;
        }

        // 移动端按钮只在正式开局后显示，避免遮挡大厅操作。
        this.touchControls.hidden = this.room?.state.phase !== "playing";
        if (this.touchControls.hidden) {
            this.resetTouchStick();
        }
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
            ...Object.values(this.playerAvatarEntities),
            ...Object.values(this.playerNameEntities),
            ...Object.values(this.tileEntities),
            ...Object.values(this.bombEntities),
            ...Object.values(this.explosionEntities),
            ...Object.values(this.powerUpEntities),
            ...this.arenaEntities,
        ].forEach((entity) => entity.destroy());

        this.playerEntities = {};
        this.playerAvatarEntities = {};
        this.playerNameEntities = {};
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
        return loadProfileState().profile.nickname;
    }

    profilePayload(): Pick<PlayerProfile, "nickname" | "color" | "roleId"> & { token?: string } {
        const profile = loadProfileState().profile;
        const auth = loadAuthState();
        return {
            nickname: profile.nickname,
            color: profile.color,
            roleId: profile.roleId,
            token: auth?.token,
        };
    }

    privateRoom() {
        return Boolean(this.lobbyPanel?.querySelector<HTMLInputElement>("#bomberman-private")?.checked);
    }

    createPassword() {
        return this.lobbyPanel?.querySelector<HTMLInputElement>("#bomberman-create-password")?.value.trim() ?? "";
    }

    joinPassword() {
        return this.lobbyPanel?.querySelector<HTMLInputElement>("#bomberman-room-password")?.value.trim() ?? "";
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

    skinStrokeColor(skinId: string) {
        if (skinId === "blazer") {
            return 0xff7a35;
        }

        if (skinId === "bolt") {
            return 0x63d2ff;
        }

        if (skinId === "guard") {
            return 0xf8f3d4;
        }

        return 0x101820;
    }

    recordLocalMatchResult(winnerId: string) {
        if (!this.room || this.recordedMatchRoomId === this.room.roomId) {
            return;
        }

        // 本地个人战绩只在整场比赛结算时记录一次，避免 UI 重绘重复计数。
        if (!winnerId) {
            soundManager.play("draw");
            recordMatchResult("draw");
        } else if (winnerId === this.room.sessionId) {
            soundManager.play("win");
            recordMatchResult("win");
        } else {
            soundManager.play("loss");
            recordMatchResult("loss");
        }

        this.recordedMatchRoomId = this.room.roomId;
    }
}
