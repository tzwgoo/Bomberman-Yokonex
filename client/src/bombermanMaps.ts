export type BombermanMapOption = {
    id: string;
    name: string;
    description: string;
};

export const BOMBERMAN_MAP_OPTIONS: BombermanMapOption[] = [
    { id: "classic", name: "经典工厂", description: "标准箱子密度，适合快速上手。" },
    { id: "crossfire", name: "十字火线", description: "中线掩体更多，抢中路风险更高。" },
    { id: "warehouse", name: "仓库通道", description: "纵向通道更明显，适合绕后和卡位。" },
    { id: "open-yard", name: "开阔庭院", description: "箱子更少，移动空间更大。" },
];
