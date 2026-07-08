import Phaser from "phaser";

import { isLoggedIn, loginAccount, registerAccount } from "../authStore";
import { soundManager } from "../soundManager";

type AuthMode = "login" | "register";

export class AuthScene extends Phaser.Scene {
    panel?: HTMLElement;
    mode: AuthMode = "login";

    constructor() {
        super({ key: "auth", active: true });
    }

    create() {
        if (isLoggedIn()) {
            this.goToLobby();
            return;
        }

        this.cameras.main.setBackgroundColor(0x0e141b);
        this.drawBackground();
        this.createAuthPanel();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyAuthPanel());
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

    createAuthPanel() {
        const isRegister = this.mode === "register";
        const panel = document.createElement("section");
        panel.className = "auth-panel";
        panel.innerHTML = `
            <form class="auth-card">
                <p>YOKONEX ACCOUNT</p>
                <h2>${isRegister ? "注册账号" : "账号登录"}</h2>
                <label for="auth-username">用户名</label>
                <input id="auth-username" name="username" type="text" autocomplete="username" maxlength="24" placeholder="3-24 位字母数字下划线" />
                ${isRegister ? `
                    <label for="auth-nickname">昵称</label>
                    <input id="auth-nickname" name="nickname" type="text" maxlength="16" placeholder="游戏内显示名称" />
                ` : ""}
                <label for="auth-password">密码</label>
                <input id="auth-password" name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" maxlength="64" placeholder="至少 6 位" />
                <div class="auth-actions">
                    <button type="submit">${isRegister ? "注册并登录" : "登录"}</button>
                    <button type="button" class="secondary" data-action="switch">${isRegister ? "已有账号" : "注册账号"}</button>
                </div>
                <span data-role="message"></span>
            </form>
        `;

        panel.addEventListener("submit", (event) => void this.handleSubmit(event));
        panel.addEventListener("click", (event) => this.handleClick(event));
        document.body.appendChild(panel);
        this.panel = panel;
    }

    destroyAuthPanel() {
        this.panel?.remove();
        this.panel = undefined;
    }

    async handleSubmit(event: Event) {
        event.preventDefault();
        void soundManager.unlock();
        soundManager.play("button");

        const form = event.target as HTMLFormElement;
        const formData = new FormData(form);
        const username = String(formData.get("username") ?? "");
        const password = String(formData.get("password") ?? "");
        const nickname = String(formData.get("nickname") ?? "");

        try {
            this.setMessage(this.mode === "register" ? "正在注册..." : "正在登录...");
            if (this.mode === "register") {
                await registerAccount(username, password, nickname);
            } else {
                await loginAccount(username, password);
            }
            this.goAfterLogin();
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "请求失败");
        }
    }

    handleClick(event: Event) {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
        if (!target) {
            return;
        }

        void soundManager.unlock();
        soundManager.play("button");
        if (target.dataset.action === "switch") {
            this.mode = this.mode === "login" ? "register" : "login";
            this.destroyAuthPanel();
            this.createAuthPanel();
        }
    }

    goAfterLogin() {
        this.goToLobby();
    }

    goToLobby() {
        window.sessionStorage.removeItem("bomberman:auth-redirect");
        window.location.hash = "";
        this.scene.start("selector");
    }

    setMessage(message: string) {
        const messageEl = this.panel?.querySelector<HTMLElement>("[data-role='message']");
        if (messageEl) {
            messageEl.textContent = message;
        }
    }
}
