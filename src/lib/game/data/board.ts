import type { Tile } from "../types";

// 16-tile ring. With 2d6 (avg 7) a lap takes ~2.3 turns, so a 10-turn game
// runs ~4-5 month-end P&L cycles per player.
export const TILES: Tile[] = [
  { idx: 0, kind: "start", label: "Month End", emoji: "🏁" },
  { idx: 1, kind: "property", label: "Property deal", emoji: "🏠" },
  { idx: 2, kind: "owner", label: "Owner call", emoji: "📞" },
  { idx: 3, kind: "property", label: "Property deal", emoji: "🏠" },
  { idx: 4, kind: "guest", label: "Guest issue", emoji: "🧳" },
  { idx: 5, kind: "finance", label: "Finance", emoji: "🏦" },
  { idx: 6, kind: "property", label: "Property deal", emoji: "🏠" },
  { idx: 7, kind: "regulation", label: "Regulation", emoji: "⚖️" },
  { idx: 8, kind: "property", label: "Property deal", emoji: "🏠" },
  { idx: 9, kind: "market", label: "Market shift", emoji: "📊" },
  { idx: 10, kind: "property", label: "Property deal", emoji: "🏠" },
  { idx: 11, kind: "hiring", label: "Hiring", emoji: "🧑‍💼" },
  { idx: 12, kind: "guest", label: "Guest issue", emoji: "🧳" },
  { idx: 13, kind: "property", label: "Property deal", emoji: "🏠" },
  { idx: 14, kind: "upgrade", label: "Upgrades", emoji: "🛠️" },
  { idx: 15, kind: "property", label: "Property deal", emoji: "🏠" },
];

export const TILE_COUNT = TILES.length;

export const TILE_TINT: Record<string, string> = {
  start: "#B9F33E",
  property: "#F2C94C",
  owner: "#FF7AC3",
  guest: "#59C8DC",
  regulation: "#FF6F61",
  finance: "#9FD98A",
  hiring: "#C9A0FF",
  market: "#6FA8FF",
  upgrade: "#FFB454",
};
