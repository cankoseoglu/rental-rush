// ---------------------------------------------------------------------------
// 16 neighbourhood areas (8 cities × 2) + the 24-tile square board layout.
// Board reads clockwise from the Start corner; values rise around the lap.
// ---------------------------------------------------------------------------

import type { AreaDef, Tile } from "../types";
import { clamp, jitter } from "../rng";

interface AreaSeed {
  id: string;
  name: string;
  cityId: string;
  level: 1 | 2 | 3;
  demand: 1 | 2 | 3;
  regRisk: number;
  unitPrice: number;
  baseAdr: number;
  baseOcc: number;
}

// prettier-ignore
const AREA_SEEDS: AreaSeed[] = [
  { id: "holbeck",    name: "Holbeck",          cityId: "lds",  level: 1, demand: 1, regRisk: 20, unitPrice: 118_000, baseAdr: 86,  baseOcc: 0.66 },
  { id: "headingley", name: "Headingley",       cityId: "lds",  level: 1, demand: 2, regRisk: 25, unitPrice: 142_000, baseAdr: 98,  baseOcc: 0.70 },
  { id: "baltic",     name: "Baltic Triangle",  cityId: "liv",  level: 1, demand: 2, regRisk: 42, unitPrice: 138_000, baseAdr: 104, baseOcc: 0.71 },
  { id: "ropewalks",  name: "Ropewalks",        cityId: "liv",  level: 2, demand: 2, regRisk: 46, unitPrice: 188_000, baseAdr: 128, baseOcc: 0.72 },
  { id: "nq",         name: "Northern Quarter", cityId: "man",  level: 2, demand: 3, regRisk: 34, unitPrice: 226_000, baseAdr: 148, baseOcc: 0.75 },
  { id: "ancoats",    name: "Ancoats",          cityId: "man",  level: 2, demand: 2, regRisk: 32, unitPrice: 214_000, baseAdr: 140, baseOcc: 0.72 },
  { id: "stokes",     name: "Stokes Croft",     cityId: "brs",  level: 2, demand: 2, regRisk: 38, unitPrice: 208_000, baseAdr: 138, baseOcc: 0.71 },
  { id: "clifton",    name: "Clifton",          cityId: "brs",  level: 2, demand: 2, regRisk: 44, unitPrice: 252_000, baseAdr: 158, baseOcc: 0.70 },
  { id: "nlaine",     name: "North Laine",      cityId: "bri",  level: 2, demand: 3, regRisk: 54, unitPrice: 246_000, baseAdr: 162, baseOcc: 0.74 },
  { id: "kemptown",   name: "Kemptown",         cityId: "bri",  level: 2, demand: 2, regRisk: 57, unitPrice: 232_000, baseAdr: 150, baseOcc: 0.70 },
  { id: "leith",      name: "Leith",            cityId: "edi",  level: 2, demand: 2, regRisk: 74, unitPrice: 238_000, baseAdr: 152, baseOcc: 0.72 },
  { id: "oldtown",    name: "Old Town",         cityId: "edi",  level: 3, demand: 3, regRisk: 82, unitPrice: 348_000, baseAdr: 224, baseOcc: 0.75 },
  { id: "widcombe",   name: "Widcombe",         cityId: "bath", level: 3, demand: 2, regRisk: 56, unitPrice: 332_000, baseAdr: 212, baseOcc: 0.71 },
  { id: "lansdown",   name: "Lansdown",         cityId: "bath", level: 3, demand: 2, regRisk: 60, unitPrice: 368_000, baseAdr: 232, baseOcc: 0.70 },
  { id: "shoreditch", name: "Shoreditch",       cityId: "lon",  level: 3, demand: 3, regRisk: 70, unitPrice: 452_000, baseAdr: 282, baseOcc: 0.76 },
  { id: "notting",    name: "Notting Hill",     cityId: "lon",  level: 3, demand: 2, regRisk: 76, unitPrice: 520_000, baseAdr: 318, baseOcc: 0.72 },
];

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Build this game's area list with a little seeded jitter on the numbers. */
export function generateAreas(rng: () => number): AreaDef[] {
  return AREA_SEEDS.map((s) => {
    const unitPrice = Math.round((s.unitPrice * jitter(rng, 0.94, 1.08)) / 1000) * 1000;
    const baseAdr = round10(s.baseAdr * jitter(rng, 0.93, 1.1));
    const baseOcc = Math.round(clamp(s.baseOcc + jitter(rng, -0.03, 0.04), 0.55, 0.85) * 100) / 100;
    const mtrRent = round10(baseAdr * 30 * 0.42);
    const ltrRent = round10(baseAdr * 30 * 0.3);
    const stayFee =
      (s.level === 1 ? 400 : s.level === 2 ? 700 : 1_100) +
      (s.cityId === "lon" || s.cityId === "edi" ? 150 : 0);
    return {
      id: s.id,
      name: s.name,
      cityId: s.cityId,
      level: s.level,
      demand: s.demand,
      regRisk: Math.round(clamp(s.regRisk + jitter(rng, -5, 5), 5, 95)),
      unitPrice,
      baseAdr,
      baseOcc,
      mtrRent,
      ltrRent,
      stayFee,
      buildingUnits: 3 + s.level + (s.demand - 1), // 4-8 units
    };
  });
}

// --- board layout: 7×7 perimeter, 24 tiles, clockwise from Start ------------

export const TILES: Tile[] = [
  { idx: 0, kind: "start", label: "Month End", emoji: "🏁" },
  { idx: 1, kind: "area", label: "Holbeck", emoji: "🏘️", areaId: "holbeck" },
  { idx: 2, kind: "area", label: "Headingley", emoji: "🏘️", areaId: "headingley" },
  { idx: 3, kind: "event", label: "Guest desk", emoji: "🔑", eventCategory: "guest" },
  { idx: 4, kind: "area", label: "Baltic Triangle", emoji: "🏘️", areaId: "baltic" },
  { idx: 5, kind: "area", label: "Ropewalks", emoji: "🏘️", areaId: "ropewalks" },
  { idx: 6, kind: "corner", label: "City Hall", emoji: "🏛️", eventCategory: "regulation" },
  { idx: 7, kind: "area", label: "Northern Quarter", emoji: "🏘️", areaId: "nq" },
  { idx: 8, kind: "area", label: "Ancoats", emoji: "🏘️", areaId: "ancoats" },
  { idx: 9, kind: "event", label: "Market wire", emoji: "📈", eventCategory: "market" },
  { idx: 10, kind: "area", label: "Stokes Croft", emoji: "🏘️", areaId: "stokes" },
  { idx: 11, kind: "area", label: "Clifton", emoji: "🏘️", areaId: "clifton" },
  { idx: 12, kind: "corner", label: "The Exchange", emoji: "🏦", eventCategory: "market" },
  { idx: 13, kind: "area", label: "North Laine", emoji: "🏘️", areaId: "nlaine" },
  { idx: 14, kind: "area", label: "Kemptown", emoji: "🏘️", areaId: "kemptown" },
  { idx: 15, kind: "event", label: "Owner line", emoji: "🤝", eventCategory: "owner" },
  { idx: 16, kind: "area", label: "Leith", emoji: "🏘️", areaId: "leith" },
  { idx: 17, kind: "area", label: "Old Town", emoji: "🏘️", areaId: "oldtown" },
  { idx: 18, kind: "corner", label: "Ops Yard", emoji: "👷", eventCategory: "guest" },
  { idx: 19, kind: "area", label: "Widcombe", emoji: "🏘️", areaId: "widcombe" },
  { idx: 20, kind: "area", label: "Lansdown", emoji: "🏘️", areaId: "lansdown" },
  { idx: 21, kind: "event", label: "Permit office", emoji: "⚖️", eventCategory: "regulation" },
  { idx: 22, kind: "area", label: "Shoreditch", emoji: "🏘️", areaId: "shoreditch" },
  { idx: 23, kind: "area", label: "Notting Hill", emoji: "🏘️", areaId: "notting" },
];

export const TILE_COUNT = TILES.length;

/** 7×7 grid placement (1-based CSS grid row/col) for each tile index. */
export function tileGridPos(idx: number): { row: number; col: number } {
  if (idx <= 6) return { row: 1, col: 1 + idx }; // top, left→right
  if (idx <= 12) return { row: 1 + (idx - 6), col: 7 }; // right, top→bottom
  if (idx <= 18) return { row: 7, col: 7 - (idx - 12) }; // bottom, right→left
  return { row: 7 - (idx - 18), col: 1 }; // left, bottom→top
}

export const MODEL_COLORS: Record<string, string> = {
  STR: "#FF8A5C",
  MTR: "#59C8DC",
  LTR: "#9FD98A",
  HOTEL: "#C9A0FF",
};
