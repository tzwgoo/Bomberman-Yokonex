import Phaser from "phaser";

import { loadProfileState, PROFILE_COLORS, resetPlayerStats, updateProfile, type ProfileState } from "../profileStore";

export class ProfileScene extends Phaser.Scene {
    panel?: HTMLElement;
    state: ProfileState = loadProfileState();

    constructor() {
        super({ key: "profile" });
    }

    create() {
        this.cameras.main.setBackgroundColor(0x0e141b);
        this.drawBackground();
        this.createProfilePanel();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyProfilePanel());
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

    createProfilePanel() {
        const profile = this.state.profile;
        const stats = this.state.stats;
        const winRate = stats.matches ? Math.round((stats.wins / stats.matches) * 100) : 0;
        const nickname = this.escapeHtml(profile.nickname);
        const title = this.escapeHtml(profile.title);

        const panel = document.createElement("section");
        panel.className = "profile-panel";
        panel.innerHTML = `
            <div class="profile-shell">
                <header class="profile-header">
                    <div class="profile-avatar" data-role="avatar" style="background:${profile.color}">${nickname.slice(0, 1)}</div>
                    <div>
                        <p>个人信息</p>
                        <h2>${nickname}</h2>
                        <span>${title}</span>
                    </div>
                </header>

                <section class="profile-card">
                    <h3>基础资料</h3>
                    <label for="profile-nickname">昵称</label>
                    <input id="profile-nickname" type="text" maxlength="16" value="${nickname}" />
                    <label>角色颜色</label>
                    <div class="profile-colors" data-role="colors"></div>
                    <div class="profile-actions">
                        <button data-action="save">保存资料</button>
                        <button class="secondary" data-action="back">返回菜单</button>
                    </div>
                    <p class="profile-note" data-role="message"></p>
                </section>

                <section class="profile-card">
                    <h3>本地战绩</h3>
                    <div class="profile-stats">
                        <span>场次<strong>${stats.matches}</strong></span>
                        <span>胜利<strong>${stats.wins}</strong></span>
                        <span>失败<strong>${stats.losses}</strong></span>
                        <span>平局<strong>${stats.draws}</strong></span>
                        <span>胜率<strong>${winRate}%</strong></span>
                    </div>
                    <div class="profile-actions">
                        <button class="danger" data-action="reset">重置战绩</button>
                    </div>
                </section>
            </div>
        `;

        panel.addEventListener("click", (event) => this.handleProfileClick(event));
        document.body.appendChild(panel);
        this.panel = panel;
        this.renderColorOptions();
    }

    destroyProfilePanel() {
        this.panel?.remove();
        this.panel = undefined;
    }

    renderColorOptions() {
        const colorList = this.panel?.querySelector<HTMLElement>("[data-role='colors']");
        if (!colorList) {
            return;
        }

        colorList.innerHTML = "";
        PROFILE_COLORS.forEach((color) => {
            const button = document.createElement("button");
            button.className = `profile-color${color === this.state.profile.color ? " is-selected" : ""}`;
            button.dataset.action = "color";
            button.dataset.color = color;
            button.style.background = color;
            colorList.appendChild(button);
        });
    }

    handleProfileClick(event: Event) {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
        if (!target) {
            return;
        }

        if (target.dataset.action === "back") {
            window.location.hash = "";
            this.game.scene.switch("profile", "selector");
        } else if (target.dataset.action === "color") {
            this.state.profile.color = target.dataset.color ?? this.state.profile.color;
            this.renderColorOptions();
            this.updateAvatar();
        } else if (target.dataset.action === "save") {
            this.saveProfile();
        } else if (target.dataset.action === "reset") {
            this.state = resetPlayerStats();
            this.destroyProfilePanel();
            this.createProfilePanel();
        }
    }

    saveProfile() {
        const nickname = this.panel?.querySelector<HTMLInputElement>("#profile-nickname")?.value ?? this.state.profile.nickname;
        this.state = updateProfile({
            nickname,
            color: this.state.profile.color,
        });
        this.destroyProfilePanel();
        this.createProfilePanel();
        this.setMessage("资料已保存");
    }

    updateAvatar() {
        const avatar = this.panel?.querySelector<HTMLElement>("[data-role='avatar']");
        if (avatar) {
            avatar.style.background = this.state.profile.color;
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
