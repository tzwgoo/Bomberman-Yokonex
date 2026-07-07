import Phaser from "phaser";

type MenuItem = {
    title: string;
    detail: string;
    action: "bomberman" | "todo";
};

export class SceneSelector extends Phaser.Scene {
    menuItems: MenuItem[] = [
        { title: "多人对战", detail: "创建房间或输入房间号加入", action: "bomberman" },
        { title: "随机匹配", detail: "自动寻找在线玩家", action: "todo" },
        { title: "个人信息", detail: "查看昵称、积分和战绩", action: "todo" },
        { title: "设备连接", detail: "绑定震动反馈硬件", action: "todo" },
    ];

    modalLayer?: Phaser.GameObjects.Container;

    constructor() {
        super({ key: "selector", active: true });
    }

    create() {
        const sceneKey = window.location.hash.substring(1);
        // 只允许正式入口直达，旧调试场景不再作为外部入口开放。
        if (sceneKey === "bomberman") {
            this.runScene(sceneKey);
            return;
        }

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
        this.add.text(56, 58, "YOKONEX", {
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
        container.setSize(300, 100);
        container.setInteractive({ useHandCursor: true });

        container.on("pointerover", () => {
            bg.setFillStyle(0x172638, 1);
            bg.setStrokeStyle(1, item.action === "bomberman" ? 0xf6c453 : 0x63d2ff, 0.8);
            container.setScale(1.015);
        });

        container.on("pointerout", () => {
            bg.setFillStyle(0x131d27, 0.94);
            bg.setStrokeStyle(1, 0x526a82, 0.55);
            container.setScale(1);
        });

        container.on("pointerdown", () => {
            container.setScale(0.96);
        });

        container.on("pointerup", () => {
            container.setScale(1.015);
            if (item.action === "bomberman") {
                this.runScene("bomberman");
            } else {
                this.showTodoModal(item.title);
            }
        });
    }

    showTodoModal(title: string) {
        this.modalLayer?.destroy();

        const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.52);
        const panel = this.add.rectangle(400, 302, 390, 190, 0x131d27, 0.98)
            .setStrokeStyle(1, 0xf6c453, 0.7);

        const heading = this.add.text(400, 246, title, {
            color: "#fff5d6",
            fontFamily: "Microsoft YaHei",
            fontSize: "26px",
            fontStyle: "bold",
        }).setOrigin(0.5);

        const body = this.add.text(400, 294, "功能开发中，后续版本开放。", {
            color: "#9fb4c8",
            fontFamily: "Microsoft YaHei",
            fontSize: "17px",
        }).setOrigin(0.5);

        const buttonBg = this.add.rectangle(400, 352, 116, 42, 0xf6c453)
            .setInteractive({ useHandCursor: true });
        const buttonText = this.add.text(400, 352, "知道了", {
            color: "#101820",
            fontFamily: "Microsoft YaHei",
            fontSize: "17px",
            fontStyle: "bold",
        }).setOrigin(0.5);

        this.modalLayer = this.add.container(0, 0, [overlay, panel, heading, body, buttonBg, buttonText]);

        const close = () => {
            this.modalLayer?.destroy();
            this.modalLayer = undefined;
        };

        overlay.setInteractive().on("pointerdown", close);
        buttonBg.on("pointerdown", () => {
            buttonBg.setScale(0.96);
        });
        buttonBg.on("pointerup", close);
    }

    runScene(key: string) {
        this.game.scene.switch("selector", key);
    }
}
