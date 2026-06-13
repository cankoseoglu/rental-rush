import type { CityDef } from "../types";
import { SEASON } from "../types";

export const CITIES: CityDef[] = [
  { id: "lon", name: "London", regRisk: 75, priceMult: 1.8, adrMult: 1.45, demand: 1.05, hue: 222, emoji: "🏙️", blurb: "Deep demand, deeper scrutiny. The 90-night rule bites." },
  { id: "man", name: "Manchester", regRisk: 35, priceMult: 1.0, adrMult: 0.95, demand: 1.0, hue: 28, emoji: "🐝", blurb: "Solid yields, friendly council, rainy turnovers." },
  { id: "edi", name: "Edinburgh", regRisk: 80, priceMult: 1.2, adrMult: 1.15, demand: 1.0, hue: 268, emoji: "🏰", blurb: "August prints money. Licensing is brutal." },
  { id: "bri", name: "Brighton", regRisk: 55, priceMult: 1.15, adrMult: 1.05, demand: 0.98, hue: 192, emoji: "🌊", blurb: "Seaside spikes in summer, seagull complaints year-round." },
  { id: "brs", name: "Bristol", regRisk: 40, priceMult: 1.05, adrMult: 1.0, demand: 1.0, hue: 152, emoji: "🎈", blurb: "Creative crowd, steady mid-week corporate stays." },
  { id: "lds", name: "Leeds", regRisk: 25, priceMult: 0.8, adrMult: 0.85, demand: 0.97, hue: 46, emoji: "🦉", blurb: "Cheap entry, honest cashflow, zero glamour." },
  { id: "liv", name: "Liverpool", regRisk: 45, priceMult: 0.85, adrMult: 0.8, demand: 0.98, hue: 0, emoji: "⚓", blurb: "Stag-do capital. High ADR weekends, high wear." },
  { id: "bath", name: "Bath", regRisk: 60, priceMult: 1.3, adrMult: 1.25, demand: 1.02, hue: 36, emoji: "🛁", blurb: "Georgian premium. Owners expect white-glove service." },
];

export const cityById = (id: string): CityDef => {
  const c = CITIES.find((c) => c.id === id);
  if (!c) throw new Error(`unknown city ${id}`);
  return c;
};

export const NEIGHBOURHOODS: Record<string, string[]> = {
  lon: ["Shoreditch", "Camden", "Peckham", "Hackney Wick", "Notting Hill", "Bermondsey"],
  man: ["Northern Quarter", "Ancoats", "Didsbury", "Castlefield", "Chorlton"],
  edi: ["Leith", "Stockbridge", "Old Town", "Bruntsfield", "Portobello"],
  bri: ["Kemptown", "North Laine", "Hove", "Seven Dials"],
  brs: ["Clifton", "Stokes Croft", "Southville", "Redland"],
  lds: ["Headingley", "Holbeck", "Chapel Allerton", "Kirkstall"],
  liv: ["Baltic Triangle", "Ropewalks", "Georgian Quarter", "Lark Lane"],
  bath: ["Widcombe", "Lansdown", "Oldfield Park", "Bathwick"],
};

// Seasonal demand multiplier for STR, by business-month index (April start).
export function seasonFactor(cityId: string, monthIdx: number): number {
  const m = monthIdx % SEASON.length;
  let s = SEASON[m];
  if (cityId === "edi" && m === 2) s = 1.4; // Hogmanay December
  if (cityId === "edi" && m === 10) s = 1.55; // festival August
  if (cityId === "bri" && m >= 8 && m <= 11) s += 0.1; // seaside summer
  if (cityId === "bath") s = Math.max(s, 0.95); // tourist-steady
  if (cityId === "lon") s = Math.max(s, 0.9); // never truly dies
  return s;
}

export function seasonLabel(monthIdx: number): string {
  const m = monthIdx % SEASON.length;
  const s = SEASON[m];
  if (s >= 1.2) return "Peak season";
  if (s >= 1.05) return "High season";
  if (s >= 0.95) return "Shoulder season";
  return "Low season";
}
