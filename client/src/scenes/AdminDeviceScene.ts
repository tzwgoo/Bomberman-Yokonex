import Phaser from "phaser";

import { authHeaders, loadAuthState } from "../authStore";
import { BACKEND_HTTP_URL } from "../backend";

type OnlineDevice = {
    userId: string;
    username: string;
    nickname: string;
    roomId: string;
    connected: boolean;
    transport: string;
    status: string;
    batteryLevel: number;
    updatedAt: string;
};

type DeviceLog = {
    id: string;
    userId: string;
    adminUserId?: string | null;
    roomId?: string | null;
    category: string;
    action: string;
    transport?: string | null;
    status?: string | null;
    success?: boolean | null;
    message?: string | null;
    detail?: { eventType?: string } | null;
    createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
    bomb_placed: "放炸弹",
    bomb_exploded: "爆炸",
    death: "死亡",
    round_win: "胜利",
    round_lose: "失败",
    power_up: "捡道具",
};

const TRANSPORT_LABELS: Record<string, string> = {
    ble: "BLE",
    websocket: "DG-LAB WebSocket",
    command_websocket: "YYC-DJ WebSocket",
};

export class AdminDeviceScene extends Phaser.Scene {
    panel?: HTMLElement;
    refreshTimer?: number;
    loading = false;

    constructor() {
        super({ key: "admin-device" });
    }

    create() {
        const auth = loadAuthState();
        if (!auth) {
            this.backToMenu();
            return;
        }

        this.cameras.main.setBackgroundColor(0x0e141b);
        this.createPanel();
        void this.refreshData();
        this.refreshTimer = window.setInterval(() => void this.refreshData(), 5000);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyPanel());
    }

    createPanel() {
        const panel = document.createElement("section");
        panel.className = "admin-device-panel";
        panel.innerHTML = `
            <div class="admin-device-shell">
                <header>
                    <div>
                        <p>EMS ADMIN</p>
                        <h2>在线设备管理</h2>
                    </div>
                    <div class="admin-device-header-actions">
                        <button data-action="refresh">刷新</button>
                        <button class="secondary" data-action="back">返回</button>
                    </div>
                </header>
                <p class="admin-device-message" data-role="message"></p>
                <section class="admin-device-section">
                    <h3>在线玩家</h3>
                    <div class="admin-device-list" data-role="devices"><p>正在加载...</p></div>
                </section>
                <section class="admin-device-section">
                    <h3>最近日志</h3>
                    <div class="admin-device-logs" data-role="logs"><p>正在加载...</p></div>
                </section>
            </div>
        `;
        panel.addEventListener("click", (event) => void this.handleClick(event));
        document.body.appendChild(panel);
        this.panel = panel;
    }

    destroyPanel() {
        if (this.refreshTimer) {
            window.clearInterval(this.refreshTimer);
        }
        this.panel?.remove();
        this.panel = undefined;
    }

    async refreshData() {
        if (this.loading || !this.panel) {
            return;
        }

        this.loading = true;
        try {
            const [devicesResponse, logsResponse] = await Promise.all([
                adminRequest("/admin/devices"),
                adminRequest("/admin/device-logs?limit=100"),
            ]);
            const devices = await devicesResponse.json() as { devices: OnlineDevice[] };
            const logs = await logsResponse.json() as { logs: DeviceLog[] };
            this.renderDevices(devices.devices);
            this.renderLogs(logs.logs);
            this.setMessage(`已更新 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "设备数据加载失败", true);
        } finally {
            this.loading = false;
        }
    }

    renderDevices(devices: OnlineDevice[]) {
        const list = this.panel?.querySelector<HTMLElement>("[data-role='devices']");
        if (!list) {
            return;
        }
        if (!devices.length) {
            list.innerHTML = "<p>暂无在线玩家</p>";
            return;
        }

        list.innerHTML = devices.map((device) => `
            <article class="admin-device-card${device.connected ? " is-connected" : ""}">
                <header>
                    <div>
                        <strong>${escapeHtml(device.nickname)}</strong>
                        <span>${escapeHtml(device.username)} · ${escapeHtml(device.roomId)}</span>
                    </div>
                    <i>${device.connected ? "已连接" : "未连接"}</i>
                </header>
                <div class="admin-device-meta">
                    <span>${escapeHtml(TRANSPORT_LABELS[device.transport] || device.transport || "未选择设备")}</span>
                    <span>${device.batteryLevel >= 0 ? `电量 ${device.batteryLevel}%` : "电量未知"}</span>
                    <span>${escapeHtml(device.status)}</span>
                </div>
                <div class="admin-device-commands">
                    ${Object.entries(EVENT_LABELS).map(([eventType, label]) => `
                        <button data-action="event" data-user-id="${escapeHtmlAttribute(device.userId)}" data-event-type="${eventType}" ${device.connected ? "" : "disabled"}>${label}</button>
                    `).join("")}
                    <button class="danger" data-action="disconnect" data-user-id="${escapeHtmlAttribute(device.userId)}" ${device.connected ? "" : "disabled"}>断开设备</button>
                </div>
            </article>
        `).join("");
    }

    renderLogs(logs: DeviceLog[]) {
        const list = this.panel?.querySelector<HTMLElement>("[data-role='logs']");
        if (!list) {
            return;
        }
        if (!logs.length) {
            list.innerHTML = "<p>暂无设备日志</p>";
            return;
        }

        list.innerHTML = logs.map((log) => {
            const eventLabel = log.detail?.eventType ? EVENT_LABELS[log.detail.eventType] ?? log.detail.eventType : "";
            const result = log.success === true ? "成功" : log.success === false ? "失败" : "已发送";
            return `
                <div class="admin-device-log">
                    <time>${escapeHtml(new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false }))}</time>
                    <strong>${escapeHtml(log.category)} · ${escapeHtml(log.action)}${eventLabel ? ` · ${escapeHtml(eventLabel)}` : ""}</strong>
                    <span>用户 ${escapeHtml(log.userId)} · ${result}${log.message ? ` · ${escapeHtml(log.message)}` : ""}</span>
                </div>
            `;
        }).join("");
    }

    async handleClick(event: Event) {
        const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
        if (!target || target.disabled) {
            return;
        }

        if (target.dataset.action === "back") {
            this.backToMenu();
            return;
        }
        if (target.dataset.action === "refresh") {
            await this.refreshData();
            return;
        }

        const userId = target.dataset.userId ?? "";
        const action = target.dataset.action === "disconnect" ? "disconnect" : "event";
        try {
            target.disabled = true;
            this.setMessage("正在下发设备操作...");
            await adminRequest(`/admin/devices/${encodeURIComponent(userId)}/commands`, {
                method: "POST",
                body: JSON.stringify({ action, eventType: target.dataset.eventType }),
            });
            this.setMessage("操作已下发，等待玩家设备返回结果");
            window.setTimeout(() => void this.refreshData(), 600);
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "设备操作失败", true);
        } finally {
            target.disabled = false;
        }
    }

    setMessage(message: string, error = false) {
        const element = this.panel?.querySelector<HTMLElement>("[data-role='message']");
        if (element) {
            element.textContent = message;
            element.classList.toggle("is-error", error);
        }
    }

    backToMenu() {
        window.history.replaceState(null, "", window.location.pathname);
        this.scene.stop("admin-device");
        this.scene.start("selector");
    }
}

async function adminRequest(path: string, options: RequestInit = {}) {
    const response = await fetch(`${BACKEND_HTTP_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
            ...(options.headers ?? {}),
        },
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(data.message || "管理请求失败");
    }
    return response;
}

function escapeHtml(value: unknown) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[character]!);
}

function escapeHtmlAttribute(value: unknown) {
    return escapeHtml(value);
}
