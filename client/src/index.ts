import Phaser from "phaser";

import { SceneSelector } from "./scenes/SceneSelector";
import { BombermanScene } from "./scenes/BombermanScene";

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    fps: {
        target: 60,
        forceSetTimeOut: true,
        smoothStep: false,
    },
    width: 800,
    height: 600,
    // height: 200,
    backgroundColor: '#b6d53c',
    parent: 'phaser-example',
    physics: {
        default: "arcade"
    },
    pixelArt: true,
    // 正式入口只注册当前可用场景，避免调试关卡从菜单外被直接打开。
    scene: [SceneSelector, BombermanScene],
};

new Phaser.Game(config);
