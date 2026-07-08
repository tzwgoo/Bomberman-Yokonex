import Phaser from "phaser";

import { fetchLeaderboard, type LeaderboardEntry } from "../authStore";
import { soundManager } from "../soundManager";

export class LeaderboardScene extends Phaser.Scene {
    panel?: HTMLElement;
    entries: LeaderboardEntry[] = [];

    constructor() {
        super({ key: "leaderboard" });
    }

    create() {
        this.cameras.main.setBackgroundColor(0x0e141b);
        this.drawBackground();
        this.createPanel();
        void this.refreshLeaderboard();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyPanel());
    }

    drawBackground() {
        this.add.rectangle(400, 300, 800, 600, 0x0e141b);
        for (let x = 0; x <= 800; x += 40) {
            this.add.line(0, 0, x, 0, x, 600, 0x243447, 0.24).setOrigin(0);
        }
        for (let y = 0; y <= 600; y += 40) {
            this.add.line(0, 0, 0, y, 800, y, 0x243447, 0.24).setOrigin(0);
        }
    }

    createPanel() {
        const panel = document.createElement("section");
        panel.className = "leaderboard-panel";
        panel.innerHTML = `
            <div class="leaderboard-shell">
                <header class="leaderboard-header">
                    <div>
                        <p>RATING BOARD</p>
                        <h2>积分排行榜</h2>
                        <span>按当前积分排序，胜场和胜率作为参考。</span>
                    </div>
                    <div class="leaderboard-actions">
                        <button data-action="refresh">刷新</button>
                        <button class="secondary" data-action="back">返回大厅</button>
                    </div>
                </header>
                <div class="leaderboard-list" data-role="leaderboard-list"></div>
                <p class="leaderboard-note" data-role="message">正在加载排行榜...</p>
            </div>
        `;
        panel.addEventListener("click", (event) => this.handleClick(event));
        document.body.appendChild(panel);
        this.panel = panel;
        this.renderList();
    }

    destroyPanel() {
        this.panel?.remove();
        this.panel = undefined;
    }

    async refreshLeaderboard() {
        try {
            const data = await fetchLeaderboard();
            this.entries = data.entries;
            this.renderList();
            this.setMessage(this.entries.length ? "" : "暂无排行数据");
        } catch {
            this.setMessage("排行榜加载失败");
        }
    }

    renderList() {
        const list = this.panel?.querySelector<HTMLElement>("[data-role='leaderboard-list']");
        if (!list) {
            return;
        }

        list.innerHTML = "";
        if (!this.entries.length) {
            const empty = document.createElement("div");
            empty.className = "leaderboard-empty";
            empty.textContent = "暂无排行数据";
            list.appendChild(empty);
            return;
        }

        this.entries.forEach((entry) => {
            const row = document.createElement("div");
            row.className = "leaderboard-row";
            row.innerHTML = `
                <strong>${entry.rank}</strong>
                <i style="background:${entry.user.color || "#f6c453"}">${entry.user.avatar || "🙂"}</i>
                <span>
                    <b>${this.escapeHtml(entry.user.nickname)}</b>
                    <em>${entry.stats.tier} · ${entry.stats.wins}胜 · 胜率${entry.stats.winRate}%</em>
                </span>
                <mark>${entry.stats.rating}</mark>
            `;
            list.appendChild(row);
        });
    }

    handleClick(event: Event) {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
        if (!target) {
            return;
        }

        void soundManager.unlock();
        soundManager.play("button");
        if (target.dataset.action === "refresh") {
            void this.refreshLeaderboard();
        } else if (target.dataset.action === "back") {
            window.history.replaceState(null, "", window.location.pathname);
            this.scene.start("selector");
        }
    }

    setMessage(message: string) {
        const messageEl = this.panel?.querySelector<HTMLElement>("[data-role='message']");
        if (messageEl) {
            messageEl.textContent = message;
        }
    }

    escapeHtml(value: string) {
        return value.replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;",
        }[char] ?? char));
    }
}
