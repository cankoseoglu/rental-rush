import type { DealType, PropertyDef } from "../types";
import { CITIES, NEIGHBOURHOODS } from "./cities";
import { jitter, pick, clamp } from "../rng";

interface Template {
  typeId: string;
  label: string;
  bedrooms: number;
  priceBase: number;
  adrBase: number;
  occBase: number;
  maintRisk: number;
  reviewSens: number;
  opsFactor: number;
  emoji: string;
  suffixes: string[];
  cities?: string[]; // restrict to these city ids
}

const TEMPLATES: Template[] = [
  { typeId: "studio", label: "Studio flat", bedrooms: 1, priceBase: 150_000, adrBase: 105, occBase: 0.74, maintRisk: 35, reviewSens: 45, opsFactor: 0.85, emoji: "🛋️", suffixes: ["Studio", "Snug", "Pad"] },
  { typeId: "flat1", label: "1-bed flat", bedrooms: 1, priceBase: 190_000, adrBase: 148, occBase: 0.75, maintRisk: 40, reviewSens: 50, opsFactor: 1.0, emoji: "🏢", suffixes: ["Rooms", "Apartment", "Hideaway"] },
  { typeId: "flat2", label: "2-bed flat", bedrooms: 2, priceBase: 260_000, adrBase: 200, occBase: 0.73, maintRisk: 45, reviewSens: 55, opsFactor: 1.05, emoji: "🏙️", suffixes: ["Heights", "Residence", "Quarters"] },
  { typeId: "town3", label: "3-bed townhouse", bedrooms: 3, priceBase: 360_000, adrBase: 260, occBase: 0.7, maintRisk: 55, reviewSens: 60, opsFactor: 1.15, emoji: "🏘️", suffixes: ["House", "Townhouse", "Terrace"] },
  { typeId: "loft", label: "Canal-side loft", bedrooms: 2, priceBase: 300_000, adrBase: 218, occBase: 0.72, maintRisk: 50, reviewSens: 70, opsFactor: 1.05, emoji: "🧱", suffixes: ["Loft", "Wharf Loft", "Works"] },
  { typeId: "mews", label: "Mews house", bedrooms: 2, priceBase: 420_000, adrBase: 285, occBase: 0.68, maintRisk: 45, reviewSens: 65, opsFactor: 1.1, emoji: "🚪", suffixes: ["Mews", "Lane House"] },
  { typeId: "garden", label: "Garden flat", bedrooms: 2, priceBase: 240_000, adrBase: 165, occBase: 0.71, maintRisk: 50, reviewSens: 50, opsFactor: 0.95, emoji: "🌿", suffixes: ["Garden Flat", "Court", "Green"] },
  { typeId: "serv", label: "Serviced apartment", bedrooms: 1, priceBase: 210_000, adrBase: 152, occBase: 0.78, maintRisk: 30, reviewSens: 40, opsFactor: 0.8, emoji: "🛎️", suffixes: ["Suites", "Stay", "Aparthotel"] },
  { typeId: "cottage", label: "Seaside cottage", bedrooms: 3, priceBase: 320_000, adrBase: 185, occBase: 0.66, maintRisk: 65, reviewSens: 75, opsFactor: 1.2, emoji: "🐚", suffixes: ["Cottage", "Shorehouse", "Nest"], cities: ["bri", "liv", "edi", "bath"] },
  { typeId: "pent", label: "Penthouse", bedrooms: 3, priceBase: 520_000, adrBase: 415, occBase: 0.68, maintRisk: 50, reviewSens: 85, opsFactor: 1.3, emoji: "🌇", suffixes: ["Penthouse", "Skyline", "Crown"], cities: ["lon", "man", "edi"] },
];

const round10 = (n: number) => Math.round(n / 10) * 10;
const round500 = (n: number) => Math.round(n / 500) * 500;
const round1000 = (n: number) => Math.round(n / 1000) * 1000;

export function generateProperty(rng: () => number, idNum: number): PropertyDef {
  const city = pick(rng, CITIES);
  const eligible = TEMPLATES.filter((t) => !t.cities || t.cities.includes(city.id));
  const t = pick(rng, eligible);
  const hood = pick(rng, NEIGHBOURHOODS[city.id]);
  const suffix = pick(rng, t.suffixes);
  const flair = rng() < 0.25 ? `The ${hood} ${suffix}` : `${hood} ${suffix}`;
  const name = rng() < 0.2 ? `${flair} No.${1 + Math.floor(rng() * 28)}` : flair;

  const price = round1000(t.priceBase * city.priceMult * jitter(rng, 0.92, 1.12));
  const adr = round10(t.adrBase * city.adrMult * jitter(rng, 0.9, 1.15));
  const occ = clamp(t.occBase + jitter(rng, -0.05, 0.06), 0.55, 0.85);
  const mtr = round10(adr * 30 * 0.42);
  const ltr = round10(adr * 30 * 0.3);
  const leaseMonthly = round10(ltr * 1.12); // owners charge a premium to arbitrageurs
  const leaseSetup = round500(6000 + t.bedrooms * 3000 + price * 0.02);
  const deposit = round500(price * 0.32); // 30% deposit + 2% fees
  const onboarding = round500(1500 + t.bedrooms * 800 + (city.priceMult > 1.2 ? 800 : 0));

  // deal availability: most cards offer everything; some owners won't sell etc.
  const r = rng();
  let allowedDeals: DealType[];
  if (r < 0.5) allowedDeals = ["buy", "lease", "manage"];
  else if (r < 0.75) allowedDeals = ["lease", "manage"];
  else if (r < 0.9) allowedDeals = ["buy", "manage"];
  else allowedDeals = ["manage"];

  return {
    id: `p${idNum}`,
    name,
    cityId: city.id,
    neighbourhood: hood,
    bedrooms: t.bedrooms,
    type: t.label,
    typeId: t.typeId,
    emoji: t.emoji,
    hue: city.hue,
    strOcc: Math.round(occ * 100) / 100,
    strAdr: adr,
    mtrRent: mtr,
    ltrRent: ltr,
    regRisk: Math.round(clamp(city.regRisk + (t.typeId === "serv" ? -15 : 0) + jitter(rng, -8, 8), 5, 95)),
    maintRisk: Math.round(clamp(t.maintRisk + jitter(rng, -10, 10), 10, 90)),
    reviewSensitivity: Math.round(clamp(t.reviewSens + jitter(rng, -10, 10), 15, 95)),
    ownerExpectation: Math.round(clamp(jitter(rng, 40, 85) + (city.priceMult > 1.2 ? 8 : 0), 30, 95)),
    opsFactor: Math.round(t.opsFactor * jitter(rng, 0.9, 1.1) * 100) / 100,
    price,
    deposit,
    leaseSetup,
    leaseMonthly,
    onboardingCost: onboarding,
    allowedDeals,
  };
}

export function generateDeck(rng: () => number, count: number, startId: number): PropertyDef[] {
  const deck: PropertyDef[] = [];
  for (let i = 0; i < count; i++) deck.push(generateProperty(rng, startId + i));
  // keep the opening reachable: make sure the first two cards are starter-priced
  const starters = deck.filter((p) => p.price <= 320_000);
  if (starters.length >= 2) {
    const [s1, s2] = starters;
    const rest = deck.filter((p) => p !== s1 && p !== s2);
    return [s1, s2, ...rest];
  }
  return deck;
}
