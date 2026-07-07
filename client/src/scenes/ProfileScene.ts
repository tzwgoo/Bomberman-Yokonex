import Phaser from "phaser";

import { findPlayerRole, loadProfileState, PLAYER_ROLES, PROFILE_COLORS, resetPlayerStats, updateProfile, type ProfileState } from "../profileStore";
import { soundManager } from "../soundManager";

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
        const role = findPlayerRole(profile.roleId);
        const nickname = this.escapeHtml(profile.nickname);
        const title = this.escapeHtml(role.title);

        const panel = document.createElement("section");
        panel.className = "profile-panel";
        panel.innerHTML = `
            <div class="profile-shell">
                <header class="profile-header">
                    <div class="profile-avatar" data-role="avatar" style="background:${profile.color}">${role.avatar}</div>
                    <div>
                        <p>个人信息</p>
                        <h2>${nickname}</h2>
                        <span>${title} · ${this.escapeHtml(role.name)}</span>
                    </div>
                </header>

                <section class="profile-card">
                    <h3>基础资料</h3>
                    <label for="profile-nickname">昵称</label>
                    <input id="profile-nickname" type="text" maxlength="16" value="${nickname}" />
                    <label>角色颜色</label>
                    <div class="profile-colors" data-role="colors"></div>
                    <label>角色选择</label>
                    <div class="profile-roles" data-role="roles"></div>
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
        this.renderRoleOptions();
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

    renderRoleOptions() {
        const roleList = this.panel?.querySelector<HTMLElement>("[data-role='roles']");
        if (!roleList) {
            return;
        }

        roleList.innerHTML = "";
        PLAYER_ROLES.forEach((role) => {
            const button = document.createElement("button");
            button.className = `profile-role${role.id === this.state.profile.roleId ? " is-selected" : ""}`;
            button.dataset.action = "role";
            button.dataset.roleId = role.id;
            button.innerHTML = `
                <i>${role.avatar}</i>
                <strong>${this.escapeHtml(role.name)}</strong>
                <span>${this.escapeHtml(role.description)}</span>
            `;
            roleList.appendChild(button);
        });
    }

    handleProfileClick(event: Event) {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
        if (!target) {
            return;
        }

        void soundManager.unlock();
        soundManager.play("button");

        if (target.dataset.action === "back") {
            this.backToMenu();
        } else if (target.dataset.action === "color") {
            this.state.profile.color = target.dataset.color ?? this.state.profile.color;
            this.renderColorOptions();
            this.updateAvatar();
        } else if (target.dataset.action === "role") {
            const role = findPlayerRole(target.dataset.roleId);
            this.state.profile.roleId = role.id;
            this.state.profile.title = role.title;
            this.state.profile.avatar = role.avatar;
            this.state.profile.skinId = role.skinId;
            this.renderRoleOptions();
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
            roleId: this.state.profile.roleId,
        });
        this.destroyProfilePanel();
        this.createProfilePanel();
        this.setMessage("资料已保存");
    }

    updateAvatar() {
        const avatar = this.panel?.querySelector<HTMLElement>("[data-role='avatar']");
        if (avatar) {
            const role = findPlayerRole(this.state.profile.roleId);
            avatar.style.background = this.state.profile.color;
            avatar.textContent = role.avatar;
        }
    }

    setMessage(message: string) {
        const messageEl = this.panel?.querySelector<HTMLElement>("[data-role='message']");
        if (messageEl) {
            messageEl.textContent = message;
        }
    }

    backToMenu() {
        // 返回主菜单只切 Phaser 场景，不触发浏览器重新加载，避免跳回旧 hash 页面。
        window.history.replaceState(null, "", window.location.pathname);
        this.scene.stop("profile");
        this.scene.start("selector");
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
