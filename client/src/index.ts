import Phaser from "phaser";

import { SceneSelector } from "./scenes/SceneSelector";
import { BombermanScene } from "./scenes/BombermanScene";
import { ProfileScene } from "./scenes/ProfileScene";

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

new Phaser.Game(config);
