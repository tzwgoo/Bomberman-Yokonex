export type BombermanSpawnPoint = {
  tileX: number;
  tileY: number;
  color: string;
};

export type BombermanMapDefinition = {
  id: string;
  name: string;
  description: string;
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
];

export function findBombermanMap(mapId?: string) {
  return BOMBERMAN_MAPS.find((map) => map.id === mapId) ?? BOMBERMAN_MAPS[0];
}
