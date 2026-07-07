import Phaser from "phaser";

import { SceneSelector } from "./scenes/SceneSelector";
import { BombermanScene } from "./scenes/BombermanScene";
import { ProfileScene } from "./scenes/ProfileScene";
import { soundManager } from "./soundManager";

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    fps: {
        target: 60,
        forceSetTimeOut: true,
        smoothStep: false,
    },
    scale: {
        parent: "phaser-example",
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
        width: 800,
        height: 600,
    },
    backgroundColor: '#b6d53c',
    physics: {
        default: "arcade"
    },
    pixelArt: true,
    // 正式入口只注册当前可用场景，避免调试关卡从菜单外被直接打开。
    scene: [SceneSelector, BombermanScene, ProfileScene],
};

const game = new Phaser.Game(config);

document.querySelector<HTMLAnchorElement>("[data-action='main-menu']")?.addEventListener("click", async (event) => {
    event.preventDefault();
    void soundManager.unlock();
    soundManager.play("button");

    window.history.replaceState(null, "", window.location.pathname);

    const bombermanScene = game.scene.getScene("bomberman") as BombermanScene;
    if (game.scene.isActive("bomberman") && bombermanScene.room) {
        await bombermanScene.leaveRoom();
    }

    game.scene.stop("profile");
    game.scene.stop("bomberman");
    game.scene.start("selector");
});
