import Phaser from "phaser";
import QRCode from "qrcode";

import { clearAuthState, isLoggedIn, loadAuthState } from "../authStore";
import { emsFeedbackController } from "../emsFeedback";
import { soundManager } from "../soundManager";

type MenuItem = {
    title: string;
    detail: string;
    action: "bomberman" | "match" | "profile" | "leaderboard" | "logout" | "device";
};

export class SceneSelector extends Phaser.Scene {
    menuItems: MenuItem[] = [
        { title: "多人对战", detail: "创建房间或输入房间号加入", action: "bomberman" },
        { title: "随机匹配", detail: "自动寻找在线玩家", action: "match" },
        { title: "个人信息", detail: "查看昵称、积分和战绩", action: "profile" },
        { title: "积分排行", detail: "查看段位和排行榜", action: "leaderboard" },
        { title: "退出登录", detail: "清除当前账号登录状态", action: "logout" },
        { title: "设备连接", detail: "绑定震动反馈硬件", action: "device" },
    ];

    deviceModal?: HTMLElement;

    constructor() {
        super({ key: "selector" });
    }

    create() {
        if (!isLoggedIn()) {
            this.redirectToAuth();
            return;
        }

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyDeviceModal());

        const sceneKey = window.location.hash.substring(1);
        // 只允许正式入口直达，旧调试场景不再作为外部入口开放。
        if (sceneKey === "bomberman" || sceneKey === "profile" || sceneKey === "leaderboard") {
            this.runScene(sceneKey);
            return;
        }

        this.syncUserMenuItem();
        this.cameras.main.setBackgroundColor(0x0e141b);
        this.drawBackground();
        this.drawHeader();
        this.drawMenu();
    }

    drawBackground() {
        this.add.rectangle(400, 300, 800, 600, 0x0e141b);

        for (let x = 0; x <= 800; x += 40) {
            this.add.line(0, 0, x, 0, x, 600, 0x243447, 0.28).setOrigin(0);
        }

        for (let y = 0; y <= 600; y += 40) {
            this.add.line(0, 0, 0, y, 800, y, 0x243447, 0.28).setOrigin(0);
        }

        this.add.rectangle(624, 122, 220, 220, 0xf6c453, 0.08).setAngle(8);
        this.add.rectangle(648, 148, 160, 160, 0x63d2ff, 0.08).setAngle(-10);
        this.add.rectangle(690, 438, 180, 180, 0xff7a35, 0.07).setAngle(14);
    }

    drawHeader() {
        this.add.text(56, 58, "BOMBERMAN", {
            color: "#63d2ff",
            fontFamily: "Verdana",
            fontSize: "18px",
            fontStyle: "bold",
        });

        this.add.text(56, 88, "炸弹人作战大厅", {
            color: "#fff5d6",
            fontFamily: "Microsoft YaHei",
            fontSize: "42px",
            fontStyle: "bold",
        });

        this.add.text(58, 148, "选择入口，进入对战、匹配、资料或设备连接。", {
            color: "#9fb4c8",
            fontFamily: "Microsoft YaHei",
            fontSize: "16px",
        });
    }

    drawMenu() {
        this.syncUserMenuItem();
        this.menuItems.forEach((item, index) => {
            const x = 58 + (index % 2) * 342;
            const y = 230 + Math.floor(index / 2) * 132;
            this.drawMenuCard(x, y, item);
        });
    }

    drawMenuCard(x: number, y: number, item: MenuItem) {
        const container = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 300, 100, 0x131d27, 0.94)
            .setOrigin(0)
            .setStrokeStyle(1, 0x526a82, 0.55);
        const accent = this.add.rectangle(0, 0, 6, 100, item.action === "bomberman" ? 0xf6c453 : 0x40576f)
            .setOrigin(0);

        const title = this.add.text(24, 18, item.title, {
            color: item.action === "bomberman" ? "#fff5d6" : "#d7e2ed",
            fontFamily: "Microsoft YaHei",
            fontSize: "24px",
            fontStyle: "bold",
        });

        const detail = this.add.text(24, 56, item.detail, {
            color: "#9fb4c8",
            fontFamily: "Microsoft YaHei",
            fontSize: "14px",
        });

        const arrow = this.add.text(264, 34, "›", {
            color: item.action === "bomberman" ? "#f6c453" : "#688199",
            fontFamily: "Verdana",
            fontSize: "34px",
            fontStyle: "bold",
        });

        container.add([bg, accent, title, detail, arrow]);
        bg.setInteractive({ useHandCursor: true });

        bg.on("pointerover", () => {
            bg.setFillStyle(0x172638, 1);
            bg.setStrokeStyle(1, item.action === "bomberman" ? 0xf6c453 : 0x63d2ff, 0.8);
            container.setScale(1.015);
        });

        bg.on("pointerout", () => {
            bg.setFillStyle(0x131d27, 0.94);
            bg.setStrokeStyle(1, 0x526a82, 0.55);
            container.setScale(1);
        });

        bg.on("pointerdown", () => {
            container.setScale(0.96);
        });

        bg.on("pointerup", () => {
            container.setScale(1.015);
            void soundManager.unlock();
            soundManager.play("button");
            if (item.action === "match") {
                window.sessionStorage.setItem("bomberman:auto-match", "1");
                window.location.hash = "bomberman";
                this.runScene("bomberman");
            } else if (item.action === "bomberman") {
                window.location.hash = item.action;
                this.runScene(item.action);
            } else if (item.action === "profile" || item.action === "leaderboard") {
                window.location.hash = item.action;
                this.runScene(item.action);
            } else if (item.action === "logout") {
                this.logout();
            } else {
                this.showDeviceModal();
            }
        });
    }

    showDeviceModal() {
        this.destroyDeviceModal();
        const connection = emsFeedbackController.config.connection;
        const modal = document.createElement("section");
        modal.className = "device-modal";
        modal.innerHTML = `
            <div class="device-card">
                <header>
                    <div>
                        <p>EMS</p>
                        <h2>设备反馈连接</h2>
                    </div>
                    <button class="secondary" data-action="device-close">关闭</button>
                </header>
                <label>连接方式
                    <select data-role="device-transport">
                        <option value="ble" ${connection.transport === "ble" ? "selected" : ""}>BLE 直连</option>
                        <option value="websocket" ${connection.transport === "websocket" ? "selected" : ""}>DG-LAB WebSocket（仅 3.0）</option>
                        <option value="command_websocket" ${connection.transport === "command_websocket" ? "selected" : ""}>YYC-DJ 指令 WebSocket</option>
                    </select>
                </label>
                <small>BLE 支持现有 EMS 与 DG-LAB 郊狼 2.0 / 3.0。</small>
                <label data-role="websocket-field">WebSocket 服务地址
                    <input data-role="websocket-url" value="${escapeHtml(connection.websocketUrl)}" placeholder="wss://ws.example.com" />
                    <small>需先部署官方 dglab-websocket-simple v2 服务。</small>
                </label>
                <div class="device-command-fields" data-role="command-websocket-field">
                    <small>固定服务地址：<code>ws://103.236.55.92:43001</code></small>
                    <label>UID
                        <input data-role="command-uid" value="${escapeHtml(connection.commandUid)}" placeholder="123456 或 game_123456" />
                    </label>
                    <label>Token
                        <input type="password" data-role="command-token" value="${escapeHtml(connection.commandToken)}" autocomplete="off" />
                    </label>
                    <small>连接后先登录 IM，再按事件发送对应 commandId。</small>
                </div>
                <p class="device-status" data-role="device-status"></p>
                <div class="device-pairing" data-role="device-pairing" hidden>
                    <img alt="DG-LAB APP 配对二维码" />
                    <span>使用 DG-LAB APP 的 SOCKET 功能扫码绑定。</span>
                    <code></code>
                </div>
                <button data-action="device-connect">连接脉冲主机</button>
            </div>
        `;
        document.body.appendChild(modal);
        this.deviceModal = modal;

        const transport = modal.querySelector<HTMLSelectElement>("[data-role='device-transport']")!;
        const websocketField = modal.querySelector<HTMLElement>("[data-role='websocket-field']")!;
        const websocketUrl = modal.querySelector<HTMLInputElement>("[data-role='websocket-url']")!;
        const commandWebsocketField = modal.querySelector<HTMLElement>("[data-role='command-websocket-field']")!;
        const commandUid = modal.querySelector<HTMLInputElement>("[data-role='command-uid']")!;
        const commandToken = modal.querySelector<HTMLInputElement>("[data-role='command-token']")!;
        const status = modal.querySelector<HTMLElement>("[data-role='device-status']")!;
        const pairing = modal.querySelector<HTMLElement>("[data-role='device-pairing']")!;
        const updateMode = () => {
            websocketField.hidden = transport.value !== "websocket";
            commandWebsocketField.hidden = transport.value !== "command_websocket";
        };
        const updateStatus = () => status.textContent = this.deviceStatusText();
        const updatePairing = async () => {
            const pairingUrl = emsFeedbackController.pairingUrl;
            pairing.hidden = !pairingUrl;
            if (!pairingUrl || this.deviceModal !== modal) {
                return;
            }
            pairing.querySelector<HTMLImageElement>("img")!.src = await QRCode.toDataURL(pairingUrl, { width: 190, margin: 1 });
            pairing.querySelector<HTMLElement>("code")!.textContent = pairingUrl;
        };

        // 首页负责选择连接方式和完成配对；事件强度仍在对战大厅中配置。
        emsFeedbackController.onBatteryChange = updateStatus;
        emsFeedbackController.onStatusChange = () => {
            updateStatus();
            void updatePairing();
        };
        updateMode();
        updateStatus();
        void updatePairing();

        modal.addEventListener("click", async (event) => {
            const action = (event.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
            if (action === "device-close") {
                soundManager.play("button");
                this.destroyDeviceModal();
                return;
            }
            if (action !== "device-connect") {
                return;
            }
            soundManager.play("button");
            status.textContent = "正在连接...";
            try {
                await emsFeedbackController.connect({
                    transport: transport.value === "websocket"
                        ? "websocket"
                        : transport.value === "command_websocket" ? "command_websocket" : "ble",
                    websocketUrl: websocketUrl.value.trim(),
                    commandUid: commandUid.value.trim(),
                    commandToken: commandToken.value.trim(),
                });
                updateStatus();
                await updatePairing();
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : "设备连接失败";
            }
        });
        transport.addEventListener("change", updateMode);
    }

    destroyDeviceModal() {
        this.deviceModal?.remove();
        this.deviceModal = undefined;
        emsFeedbackController.onBatteryChange = undefined;
        emsFeedbackController.onStatusChange = undefined;
    }

    deviceStatusText() {
        const battery = emsFeedbackController.batteryLevel >= 0 ? ` · 电量 ${emsFeedbackController.batteryLevel}%` : "";
        return `${emsFeedbackController.status}${battery}`;
    }

    runScene(key: string) {
        this.game.scene.switch("selector", key);
    }

    redirectToAuth() {
        window.location.hash = "";
        this.runScene("auth");
    }

    logout() {
        clearAuthState();
        window.sessionStorage.removeItem("bomberman:auto-match");
        window.sessionStorage.removeItem("bomberman:auth-redirect");
        window.location.hash = "";
        this.scene.start("auth");
    }

    syncUserMenuItem() {
        const state = loadAuthState();
        const item = this.menuItems.find((menuItem) => menuItem.action === "logout");
        if (!item) {
            return;
        }

        item.detail = state ? `${state.user.nickname} · 点击退出` : "清除当前账号登录状态";
    }
}

function escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
    })[character]!);
}
