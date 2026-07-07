export type BombermanSpawnPoint = {
  tileX: number;
  tileY: number;
  color: string;
};

export type BombermanMapDefinition = {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  recommendedPlayers: string;
  previewRows: string[];
  columns: number;
  rows: number;
  tileSize: number;
  offsetX: number;
  offsetY: number;
  crateModulo: number;
  crateThreshold: number;
  solidTiles?: string[];
  emptyTiles?: string[];
  spawnPoints: BombermanSpawnPoint[];
};

export const DEFAULT_BOMBERMAN_MAP_ID = "classic";
export const RANDOM_BOMBERMAN_MAP_ID = "random";

const DEFAULT_SPAWN_POINTS: BombermanSpawnPoint[] = [
  { tileX: 1, tileY: 1, color: "#f6c453" },
  { tileX: 13, tileY: 9, color: "#63d2ff" },
  { tileX: 13, tileY: 1, color: "#ff7a7a" },
  { tileX: 1, tileY: 9, color: "#78d66b" },
];

export const BOMBERMAN_MAPS: BombermanMapDefinition[] = [
  {
    id: "classic",
    name: "经典工厂",
    description: "标准箱子密度，适合快速上手。",
    difficulty: "普通",
    recommendedPlayers: "2-4",
    previewRows: [
      "########",
      "#..x...#",
      "#.#.#x.#",
      "#x...x.#",
      "#.#.#..#",
      "#...x..#",
      "########",
    ],
    columns: 15,
    rows: 11,
    tileSize: 48,
    offsetX: 40,
    offsetY: 36,
    crateModulo: 5,
    crateThreshold: 2,
    spawnPoints: DEFAULT_SPAWN_POINTS,
  },
  {
    id: "crossfire",
    name: "十字火线",
    description: "中线掩体更多，抢中路风险更高。",
    difficulty: "困难",
    recommendedPlayers: "3-4",
    previewRows: [
      "########",
      "#..x...#",
      "#.#x#x.#",
      "#xxx#xx#",
      "#.#x#x.#",
      "#...x..#",
      "########",
    ],
    columns: 15,
    rows: 11,
    tileSize: 48,
    offsetX: 40,
    offsetY: 36,
    crateModulo: 6,
    crateThreshold: 2,
    solidTiles: ["7,2", "7,4", "7,6", "7,8", "4,5", "6,5", "8,5", "10,5"],
    emptyTiles: ["7,1", "7,3", "7,5", "7,7", "7,9", "3,5", "5,5", "9,5", "11,5"],
    spawnPoints: DEFAULT_SPAWN_POINTS,
  },
  {
    id: "warehouse",
    name: "仓库通道",
    description: "纵向通道更明显，适合绕后和卡位。",
    difficulty: "进阶",
    recommendedPlayers: "2-4",
    previewRows: [
      "########",
      "#..#...#",
      "#x.#.x.#",
      "#x...x.#",
      "#x.#.x.#",
      "#...#..#",
      "########",
    ],
    columns: 15,
    rows: 11,
    tileSize: 48,
    offsetX: 40,
    offsetY: 36,
    crateModulo: 7,
    crateThreshold: 3,
    solidTiles: ["4,3", "4,7", "10,3", "10,7", "6,5", "8,5"],
    emptyTiles: ["2,1", "3,1", "11,9", "12,9", "12,1", "11,1", "2,9", "3,9"],
    spawnPoints: DEFAULT_SPAWN_POINTS,
  },
  {
    id: "open-yard",
    name: "开阔庭院",
    description: "箱子更少，移动空间更大。",
    difficulty: "简单",
    recommendedPlayers: "2-3",
    previewRows: [
      "########",
      "#......#",
      "#.#.#..#",
      "#..x...#",
      "#..#.#.#",
      "#......#",
      "########",
    ],
    columns: 15,
    rows: 11,
    tileSize: 48,
    offsetX: 40,
    offsetY: 36,
    crateModulo: 8,
    crateThreshold: 2,
    emptyTiles: ["3,3", "5,3", "7,3", "9,3", "11,3", "3,7", "5,7", "7,7", "9,7", "11,7"],
    spawnPoints: DEFAULT_SPAWN_POINTS,
  },
  {
    id: "fortress",
    name: "环形堡垒",
    description: "外围路线安全，中部争夺更激烈。",
    difficulty: "困难",
    recommendedPlayers: "4",
    previewRows: [
      "########",
      "#..x...#",
      "#.####.#",
      "#.#xx#.#",
      "#.####.#",
      "#...x..#",
      "########",
    ],
    columns: 15,
    rows: 11,
    tileSize: 48,
    offsetX: 40,
    offsetY: 36,
    crateModulo: 4,
    crateThreshold: 2,
    solidTiles: ["5,3", "6,3", "8,3", "9,3", "5,7", "6,7", "8,7", "9,7", "5,4", "5,6", "9,4", "9,6"],
    emptyTiles: ["7,5", "6,5", "8,5", "7,4", "7,6", "2,1", "12,9", "12,1", "2,9"],
    spawnPoints: DEFAULT_SPAWN_POINTS,
  },
  {
    id: "rush-lane",
    name: "疾走长廊",
    description: "横向长通道明显，节奏更快。",
    difficulty: "进阶",
    recommendedPlayers: "2",
    previewRows: [
      "########",
      "#......#",
      "#x#x#x.#",
      "#......#",
      "#.#x#x.#",
      "#......#",
      "########",
    ],
    columns: 15,
    rows: 11,
    tileSize: 48,
    offsetX: 40,
    offsetY: 36,
    crateModulo: 9,
    crateThreshold: 3,
    solidTiles: ["3,2", "5,2", "9,2", "11,2", "3,8", "5,8", "9,8", "11,8"],
    emptyTiles: ["2,5", "3,5", "4,5", "5,5", "6,5", "8,5", "9,5", "10,5", "11,5", "12,5"],
    spawnPoints: DEFAULT_SPAWN_POINTS,
  },
];

export function findBombermanMap(mapId?: string) {
  return BOMBERMAN_MAPS.find((map) => map.id === mapId) ?? BOMBERMAN_MAPS[0];
}

export function resolveBombermanMap(mapId?: string) {
  if (mapId !== RANDOM_BOMBERMAN_MAP_ID) {
    return findBombermanMap(mapId);
  }

  // 随机地图只从服务端白名单中抽取，避免客户端传入未配置地图。
  return BOMBERMAN_MAPS[Math.floor(Math.random() * BOMBERMAN_MAPS.length)];
}
