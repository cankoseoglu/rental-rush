// ---------------------------------------------------------------------------
// V2 simulation core: assets inside areas.
// One function prices an asset's month; the same maths powers month-end,
// the area panel's impact previews and bot decisions.
// ---------------------------------------------------------------------------

import type {
  AreaDef,
  Asset,
  AssetKind,
  DealType,
  FurnishType,
  GameState,
  OpModel,
  PlayerState,
} from "../types";
import {
  CONTROL_POINTS,
  FURNISH_SPECS,
  HOTEL_ADR_MULT,
  HOTEL_OVERHEAD_PER_UNIT,
  marketPhase,
  MGMT_FEE,
  OPS_PER_UNIT,
  BUY_CASH_PCT,
  MORTGAGE_LTV,
} from "../types";
import { cityById, seasonFactor } from "../data/cities";
import { hasStaff, opsCapacity, staffCost } from "../data/staff";
import { clamp, jitter } from "../rng";

export interface AssetMonth {
  gross: number;
  varCost: number;
  maint: number;
  overhead: number; // hotel fixed overhead
  fee: number; // mgmt fee earned (manage)
  opsShare: number;
  ownerPayout: number;
  leasePay: number;
  mortgagePay: number;
  playerNet: number;
  occ: number;
  adr: number;
}

export const areaById = (state: GameState, id: string): AreaDef => {
  const a = state.areas.find((a) => a.id === id);
  if (!a) throw new Error(`unknown area ${id}`);
  return a;
};

export const isLive = (a: Asset): boolean => a.status === "live";

export const assetOps = (a: Asset): number => {
  if (a.status === "live") return OPS_PER_UNIT[a.model] * a.units;
  if (a.status === "suspended") return OPS_PER_UNIT[a.model] * a.units * 0.3;
  return 0.3 * a.units * 0.5; // projects need a little attention too
};

export const playerLoad = (p: PlayerState): number =>
  Math.round(p.assets.reduce((s, a) => s + assetOps(a), 0) * 10) / 10;

/** Planning view: what the load will be once every pipeline asset is live. */
export const fullPlayerLoad = (p: PlayerState): number =>
  Math.round(
    p.assets.reduce((s, a) => s + OPS_PER_UNIT[a.model] * a.units, 0) * 10,
  ) / 10;

export const isCompliant = (p: PlayerState, cityId: string): boolean =>
  p.cityCompliance.includes(cityId);

export const loanService = (p: PlayerState): number =>
  Math.round(p.loans.reduce((s, l) => s + l.principal * l.ratePm, 0));

export const totalLoanDebt = (p: PlayerState): number =>
  p.loans.reduce((s, l) => s + l.principal, 0);

export const totalMortgageDebt = (p: PlayerState): number =>
  p.assets.reduce((s, a) => s + a.mortgage, 0);

export const totalDebt = (p: PlayerState): number =>
  totalLoanDebt(p) + totalMortgageDebt(p) + p.owedOwners;

export const equity = (p: PlayerState): number =>
  p.assets.reduce((s, a) => (a.deal === "buy" ? s + a.value - a.mortgage : s), 0);

/** Auction-won area permits stand in for asset licences. */
export const hasPermit = (p: PlayerState, areaId: string): boolean =>
  p.permits.includes(areaId);

/** STR/HOTEL operating without the right licence in a high-reg area. */
export const isUnlicensed = (state: GameState, p: PlayerState, a: Asset): boolean => {
  const area = areaById(state, a.areaId);
  if (hasPermit(p, a.areaId)) return false;
  if (a.model === "HOTEL") return a.licence !== "approved";
  return (
    a.model === "STR" &&
    area.regRisk >= 60 &&
    a.licence !== "approved" &&
    !isCompliant(p, area.cityId)
  );
};

/** Does this player control BOTH areas of the city (a colour set)? */
export function citySetOwned(state: GameState, playerId: number, cityId: string): boolean {
  const areas = state.areas.filter((a) => a.cityId === cityId);
  return areas.length > 0 && areas.every((a) => state.control[a.id] === playerId);
}

export const citySetCount = (state: GameState, playerId: number): number => {
  const cities = [...new Set(state.areas.map((a) => a.cityId))];
  return cities.filter((c) => citySetOwned(state, playerId, c)).length;
};

function modMults(a: Asset, p: PlayerState, state: GameState, cityId: string) {
  let occ = 1;
  let adr = 1;
  let rent = 1;
  let cost = 1;
  const all = [
    ...a.mods,
    ...p.mods,
    ...(state.market.cityMods[cityId] ?? []),
    ...state.market.globalMods,
  ];
  for (const m of all) {
    if (m.occMult) occ *= m.occMult;
    if (m.adrMult) adr *= m.adrMult;
    if (m.rentMult) rent *= m.rentMult;
    if (m.costMult) cost *= m.costMult;
  }
  return { occ, adr, rent, cost };
}

export function overloadPenaltyFor(p: PlayerState): number {
  const over = playerLoad(p) - opsCapacity(p);
  return over > 0 ? Math.min(0.18, over * 0.018) : 0;
}

/**
 * One month for one asset. rng=null → deterministic expected month
 * (projections, scoring). overloadPenalty is an absolute occupancy cut.
 */
export function simulateAssetMonth(
  a: Asset,
  p: PlayerState,
  state: GameState,
  monthIdx: number,
  rng: (() => number) | null,
  overloadPenalty: number,
): AssetMonth {
  const area = areaById(state, a.areaId);
  const city = cityById(area.cityId);
  const revMgr = hasStaff(p, "revenue");
  const cleaners = hasStaff(p, "cleaners");
  const coord = hasStaff(p, "maintenance");
  const mods = modMults(a, p, state, area.cityId);

  let gross = 0;
  let varCost = 0;
  let maint = 0;
  let overhead = 0;
  let occ = 0;
  let adr = 0;

  const live = a.status === "live";
  const demandF = 1 + (area.demand - 2) * 0.05;

  if (live) {
    if (a.model === "STR" || a.model === "HOTEL") {
      const hotel = a.model === "HOTEL";
      const season = seasonFactor(area.cityId, monthIdx);
      const repFactor = 1 + (p.rep - 70) * 0.003;
      const ratingFactor = clamp(1 + (a.rating - 4.4) * 0.3, 0.6, 1.2);
      const regDrag = isUnlicensed(state, p, a) && !hotel ? 0.94 : 1;
      occ =
        area.baseOcc *
          season *
          demandF *
          city.demand *
          repFactor *
          ratingFactor *
          regDrag *
          mods.occ +
        (revMgr ? 0.04 : 0) +
        FURNISH_SPECS[a.furnish].occBonus +
        (hotel ? 0.05 : 0) -
        overloadPenalty;
      occ = clamp(occ, 0.15, 0.97);
      const adrRating = clamp(1 + (a.rating - 4.4) * 0.08, 0.85, 1.12);
      const seasonAdr = 1 + (season - 1) * 0.5;
      adr =
        area.baseAdr *
        a.furnishQ *
        (hotel ? HOTEL_ADR_MULT : 1) *
        (revMgr ? 1.08 : 1) *
        adrRating *
        seasonAdr *
        mods.adr;
      gross = adr * 30 * occ * a.units;
      varCost = gross * (hotel ? 0.22 : cleaners ? 0.13 : 0.17);
      if (citySetOwned(state, p.id, area.cityId)) varCost *= 0.92; // local density
      if (hotel) overhead = HOTEL_OVERHEAD_PER_UNIT * a.units;
    } else if (a.model === "MTR") {
      const repFactor = 1 + (p.rep - 70) * 0.0015;
      occ = clamp(0.93 * demandF * mods.occ - overloadPenalty * 0.5, 0.4, 1);
      gross = area.mtrRent * occ * mods.rent * repFactor * a.units;
      adr = gross / 30 / a.units;
      varCost = gross * (cleaners ? 0.055 : 0.07);
    } else {
      // long lets are defensive, not immune: brutal markets bring void periods
      occ = clamp(0.99 * Math.sqrt(Math.min(1, mods.occ)), 0.6, 0.99);
      gross = area.ltrRent * (p.rep < 40 ? 0.95 : 1) * occ * a.units;
      adr = gross / 30 / Math.max(1, a.units);
      varCost = gross * 0.035;
    }
    const modelMaint = a.model === "LTR" ? 0.7 : a.model === "MTR" ? 0.85 : 1;
    const maintRoll = rng ? jitter(rng, 0.35, 1.8) : 1;
    maint =
      area.unitPrice *
      0.0012 *
      a.units *
      modelMaint *
      a.maintMult *
      maintRoll *
      (coord ? 0.6 : 1);
    // market-cycle pressure on operating costs
    varCost *= mods.cost;
    maint *= mods.cost;
    overhead += state.market.insurancePerUnit * a.units;
  }

  let fee = 0;
  let opsShare = 0;
  let ownerPayout = 0;
  let leasePay = 0;
  let mortgagePay = 0;
  let playerNet = 0;

  if (a.deal === "manage") {
    fee = gross * MGMT_FEE[a.model];
    opsShare = gross * 0.05;
    ownerPayout = Math.max(0, gross - fee - varCost - maint - overhead);
    playerNet = gross - ownerPayout - varCost - maint - overhead - opsShare;
  } else if (a.deal === "lease") {
    leasePay = a.monthlyFixed;
    playerNet = gross - varCost - maint - overhead - leasePay;
  } else {
    mortgagePay = a.mortgage * state.market.ratePm;
    playerNet = gross - varCost - maint - overhead - mortgagePay;
  }

  return {
    gross: Math.round(gross),
    varCost: Math.round(varCost),
    maint: Math.round(maint),
    overhead: Math.round(overhead),
    fee: Math.round(fee),
    opsShare: Math.round(opsShare),
    ownerPayout: Math.round(ownerPayout),
    leasePay: Math.round(leasePay),
    mortgagePay: Math.round(mortgagePay),
    playerNet: Math.round(playerNet),
    occ,
    adr: Math.round(adr),
  };
}

// --- area control ------------------------------------------------------------

/** Control points for one asset: model-weighted LIVE presence + upgrade bonus. */
export function assetControlPoints(a: Asset): number {
  if (a.status === "suspended") return CONTROL_POINTS[a.model] * a.units * 0.3;
  if (a.status !== "live") return 0;
  const premium = a.furnishQ >= 1.05 ? 1.15 : 1;
  return CONTROL_POINTS[a.model] * a.units * premium;
}

export function liveUnitValue(state: GameState, playerId: number, areaId: string): number {
  const p = state.players[playerId];
  if (p.bankrupt) return 0;
  return (
    Math.round(
      p.assets.reduce((s, a) => (a.areaId === areaId ? s + assetControlPoints(a) : s), 0) * 100,
    ) / 100
  );
}

export function areaUnits(state: GameState, playerId: number, areaId: string): number {
  const p = state.players[playerId];
  if (p.bankrupt) return 0;
  return p.assets.reduce((s, a) => (a.areaId === areaId ? s + a.units : s), 0);
}

/** Controller = most control points (live, model-weighted); incumbent keeps ties. */
export function recomputeControl(state: GameState) {
  for (const area of state.areas) {
    const incumbent = state.control[area.id] ?? null;
    let best: number | null = incumbent;
    let bestVal = incumbent !== null ? liveUnitValue(state, incumbent, area.id) : 0;
    if (incumbent !== null && bestVal === 0) {
      best = null;
    }
    for (const p of state.players) {
      if (p.bankrupt || p.id === incumbent) continue;
      const v = liveUnitValue(state, p.id, area.id);
      if (v > bestVal) {
        best = p.id;
        bestVal = v;
      }
    }
    state.control[area.id] = bestVal > 0 ? best : null;
  }
}

/**
 * Stay/market fee: the player-vs-player pressure. Scales with area value,
 * the controller's live book and model mix, city-set dominance, demand and
 * the market phase. This is what bankrupts careless visitors late-game.
 */
export function stayFeeFor(state: GameState, areaId: string, visitorId: number): number {
  const controller = state.control[areaId];
  if (controller === null || controller === undefined || controller === visitorId) return 0;
  const area = areaById(state, areaId);
  const c = state.players[controller];
  const liveAssets = c.assets.filter((a) => a.areaId === areaId && a.status === "live");
  const liveUnits = liveAssets.reduce((s, a) => s + a.units, 0);
  if (liveUnits === 0) return 0;
  const hotelUnits = liveAssets.reduce((s, a) => (a.model === "HOTEL" ? s + a.units : s), 0);
  const premiumUnits = liveAssets.reduce((s, a) => (a.furnishQ >= 1.05 ? s + a.units : s), 0);

  // fees keep escalating as the market ages — this is the endgame engine
  // that eventually bleeds the weaker operator out
  const ageMult = Math.min(4, 1 + Math.max(0, state.month - 6) * 0.12);
  const cap = 15_000 + Math.max(0, state.month - 12) * 1_000;

  const base = [0, 800, 1_400, 2_200][area.level];
  let fee =
    base *
    (1 + 0.18 * (liveUnits - 1)) *
    (1 + 0.3 * (hotelUnits / Math.max(1, liveUnits))) *
    (1 + 0.1 * (premiumUnits / Math.max(1, liveUnits))) *
    (citySetOwned(state, controller, area.cityId) ? 1.75 : 1) *
    (state.market.demandSpike ? 1.3 : 1) *
    ageMult;
  fee = Math.min(Math.min(35_000, cap), fee);
  return Math.round(fee / 50) * 50;
}

// --- acquisition factory & costs ----------------------------------------------

export interface AcquisitionSpec {
  kind: "rent" | "buy" | "manage" | "building";
  model: OpModel;
  furnish: FurnishType;
  withLicence: boolean;
}

/** Owner pool depth: at most 2 managed owner-units per player per area. */
export const MANAGE_CAP_PER_AREA = 2;

export function manageCapReached(p: PlayerState, areaId: string): boolean {
  return (
    p.assets.filter((a) => a.areaId === areaId && a.deal === "manage").length >=
    MANAGE_CAP_PER_AREA
  );
}

export function needsLicence(area: AreaDef, model: OpModel, p: PlayerState): boolean {
  if (model === "HOTEL") return true;
  return model === "STR" && area.regRisk >= 60 && !isCompliant(p, area.cityId);
}

export function licenceCost(units: number, area: AreaDef): number {
  return Math.round((1_500 + units * 500) * (1 + area.regRisk / 200));
}

export function licenceSuccessProb(
  area: AreaDef,
  model: OpModel,
  p: PlayerState,
): number {
  return clamp(
    0.92 -
      area.regRisk / 140 -
      (model === "HOTEL" ? 0.08 : 0) +
      (isCompliant(p, area.cityId) ? 0.2 : 0) +
      (hasStaff(p, "aiOps") ? 0.04 : 0),
    0.3,
    0.95,
  );
}

export interface AcquisitionCosts {
  kind: AcquisitionSpec["kind"];
  deal: DealType;
  assetKind: AssetKind;
  units: number;
  cashNow: number; // setup paid immediately (incl. furnishing for units)
  furnishCost: number;
  setupCost: number;
  monthlyFixed: number; // lease obligation from signing
  mortgage: number;
  monthsToLive: number;
  licenceNeeded: boolean;
  licenceCost: number;
}

export function acquisitionCosts(
  area: AreaDef,
  spec: AcquisitionSpec,
  p: PlayerState,
  state?: GameState, // when provided, city-set sourcing discount applies
): AcquisitionCosts {
  const f = FURNISH_SPECS[spec.furnish];
  const sourcing = state && citySetOwned(state, p.id, area.cityId) ? 0.9 : 1;
  if (spec.kind === "manage") {
    return {
      kind: spec.kind,
      deal: "manage",
      assetKind: "unit",
      units: 1,
      cashNow: Math.round(2_500 * sourcing),
      furnishCost: 0,
      setupCost: Math.round(2_500 * sourcing),
      monthlyFixed: 0,
      mortgage: 0,
      monthsToLive: 0, // owner's furniture — live immediately
      licenceNeeded: needsLicence(area, spec.model, p),
      licenceCost: licenceCost(1, area),
    };
  }
  if (spec.kind === "building") {
    const units = area.buildingUnits;
    const setup = Math.round((8_000 + units * area.ltrRent * 2.2) * sourcing);
    const furnishCost = Math.round(f.costPerUnit(area.level) * units * 0.85);
    return {
      kind: spec.kind,
      deal: "lease",
      assetKind: "building",
      units,
      cashNow: setup, // furnishing billed when furnishing starts (after prep)
      furnishCost,
      setupCost: setup,
      monthlyFixed: Math.round(units * area.ltrRent * 0.88),
      mortgage: 0,
      monthsToLive: 1 + f.months("building"), // 1 month prep + furnishing
      licenceNeeded: needsLicence(area, spec.model, p),
      licenceCost: licenceCost(units, area),
    };
  }
  if (spec.kind === "buy") {
    const furnishCost = f.costPerUnit(area.level);
    return {
      kind: spec.kind,
      deal: "buy",
      assetKind: "unit",
      units: 1,
      cashNow: Math.round(area.unitPrice * BUY_CASH_PCT * sourcing) + furnishCost,
      furnishCost,
      setupCost: Math.round(area.unitPrice * BUY_CASH_PCT * sourcing),
      monthlyFixed: 0,
      mortgage: Math.round(area.unitPrice * MORTGAGE_LTV),
      monthsToLive: f.months("unit"),
      licenceNeeded: needsLicence(area, spec.model, p),
      licenceCost: licenceCost(1, area),
    };
  }
  // rent (single-unit arbitrage)
  const lease = Math.round(area.ltrRent * 1.05);
  const furnishCost = f.costPerUnit(area.level);
  const rentSetup = Math.round((lease * 2 + 1_000) * sourcing);
  return {
    kind: spec.kind,
    deal: "lease",
    assetKind: "unit",
    units: 1,
    cashNow: rentSetup + furnishCost,
    furnishCost,
    setupCost: rentSetup,
    monthlyFixed: lease,
    mortgage: 0,
    monthsToLive: f.months("unit"),
    licenceNeeded: needsLicence(area, spec.model, p),
    licenceCost: licenceCost(1, area),
  };
}

export function makeAsset(
  state: GameState,
  area: AreaDef,
  spec: AcquisitionSpec,
  costs: AcquisitionCosts,
  ownerId: number,
  id: string,
): Asset {
  const f = FURNISH_SPECS[spec.furnish];
  const managed = spec.kind === "manage";
  return {
    id,
    ownerId,
    areaId: area.id,
    kind: costs.assetKind,
    units: costs.units,
    deal: costs.deal,
    model: spec.model,
    status: managed ? "live" : costs.assetKind === "building" ? "prep" : "furnishing",
    monthsToLive: costs.monthsToLive,
    furnish: spec.furnish,
    furnishQ: managed ? 1.0 : f.quality,
    maintMult: managed ? 1.0 : f.maintMult,
    rating: managed ? 4.4 : f.ratingStart,
    ratingCap: managed ? 4.8 : f.ratingCap,
    licence: "none",
    licenceMonths: 0,
    licenceProb: 0,
    licenceAttempts: 0,
    monthlyFixed: costs.monthlyFixed,
    mortgage: costs.mortgage,
    value: costs.deal === "buy" ? area.unitPrice * costs.units : 0,
    ownerTrust: managed ? 70 : 0,
    suspendedMonths: 0,
    cumNet: 0,
    lastNet: 0,
    lastOcc: 0,
    mods: [],
  };
}

// --- projections (panel + bots) -------------------------------------------------

export interface AcquisitionProjection {
  spec: AcquisitionSpec;
  costs: AcquisitionCosts;
  liveNet: number; // expected monthly net once live
  burnNow: number; // monthly cash burn until live (fixed costs, no revenue)
  monthsToLive: number;
  opsAdd: number;
  affordable: boolean;
  flags: string[];
}

export function projectAcquisition(
  state: GameState,
  p: PlayerState,
  area: AreaDef,
  spec: AcquisitionSpec,
): AcquisitionProjection {
  const costs = acquisitionCosts(area, spec, p, state);
  const ghost = makeAsset(state, area, spec, costs, p.id, "ghost");
  ghost.status = "live";
  // plan against the post-live load — pipeline assets WILL come online
  const prospectiveLoad = fullPlayerLoad(p) + OPS_PER_UNIT[spec.model] * costs.units;
  const cap = opsCapacity(p);
  const over = prospectiveLoad - cap;
  const pen = over > 0 ? Math.min(0.18, over * 0.035) : 0;

  // average expected month over the asset's remaining live window — pricing a
  // single (often peak) month is how operators walk into the winter trap
  const firstLive = Math.min(state.month + costs.monthsToLive, 9);
  let netSum = 0;
  let netN = 0;
  let m = simulateAssetMonth(ghost, p, state, firstLive, null, pen);
  for (let mi = firstLive; mi <= 9; mi++) {
    const sample = simulateAssetMonth(ghost, p, state, mi, null, pen);
    netSum += sample.playerNet;
    netN++;
    if (mi === firstLive) m = sample;
  }
  const avgNet = netN > 0 ? Math.round(netSum / netN) : m.playerNet;

  const burnNow = costs.monthlyFixed + (costs.mortgage > 0 ? Math.round(costs.mortgage * state.market.ratePm) : 0);

  const flags: string[] = [];
  if (costs.licenceNeeded) flags.push(spec.model === "HOTEL" ? "Licence required" : "Licence advised");
  if (over > 0) flags.push("Over ops capacity");
  if (m.playerNet <= 0) flags.push("Loss-making");
  if (spec.model === "HOTEL" && !(hasStaff(p, "guestOps") || hasStaff(p, "aiOps")))
    flags.push("Needs ops staff");
  const next = seasonFactor(area.cityId, state.month);
  if (next <= 0.8 && (spec.model === "STR" || spec.model === "HOTEL")) flags.push("Low season now");

  return {
    spec,
    costs,
    liveNet: avgNet,
    burnNow,
    monthsToLive: costs.monthsToLive,
    opsAdd: Math.round(OPS_PER_UNIT[spec.model] * costs.units * 10) / 10,
    affordable: p.cash >= costs.cashNow,
    flags,
  };
}

/** Expected net for an existing asset at current month (no randomness). */
export function projectAssetNet(state: GameState, p: PlayerState, a: Asset): number {
  return simulateAssetMonth(a, p, state, state.month % 10, null, overloadPenaltyFor(p)).playerNet;
}

// Pro-forma monthly NOI (neutral season, live assets only).
export function proformaNOI(p: PlayerState, state: GameState): number {
  if (p.bankrupt) return 0;
  const pen = overloadPenaltyFor(p);
  let net = 0;
  for (const a of p.assets) {
    net += simulateAssetMonth(a, p, state, 7, null, pen).playerNet;
  }
  return Math.round(net - staffCost(p) - loanService(p));
}

export function mgmtMonthlyProfit(p: PlayerState, state: GameState): number {
  const pen = overloadPenaltyFor(p);
  let profit = 0;
  for (const a of p.assets) {
    if (a.deal !== "manage") continue;
    const m = simulateAssetMonth(a, p, state, 7, null, pen);
    profit += m.fee - m.opsShare;
  }
  return Math.round(profit);
}
