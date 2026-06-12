// ---------------------------------------------------------------------------
// The rental-operator simulation core.
// One function simulates a holding's month; the same maths powers live
// month-end P&L, deal projections shown to the player, and bot decisions.
// ---------------------------------------------------------------------------

import type {
  DealType,
  GameState,
  Holding,
  PlayerState,
  PropertyDef,
  Strategy,
} from "../types";
import { MGMT_FEE, STRATEGY_OPS } from "../types";
import { cityById, seasonFactor } from "../data/cities";
import { hasStaff, opsCapacity, staffCost } from "../data/staff";
import { clamp, jitter } from "../rng";

export interface HoldingMonth {
  gross: number;
  varCost: number; // cleaning / turnover / platform
  maint: number;
  fee: number; // mgmt fee earned (manage deals)
  opsShare: number; // player ops cost on managed units
  ownerPayout: number;
  leasePay: number;
  mortgagePay: number;
  playerNet: number;
  occ: number;
  adr: number;
}

export const holdingOps = (h: Holding): number =>
  STRATEGY_OPS[h.strategy] * h.def.opsFactor;

export const playerLoad = (p: PlayerState): number =>
  Math.round(p.holdings.reduce((s, h) => s + holdingOps(h), 0) * 10) / 10;

export const isCompliant = (p: PlayerState, cityId: string): boolean =>
  p.cityCompliance.includes(cityId);

export const loanService = (p: PlayerState): number =>
  Math.round(p.loans.reduce((s, l) => s + l.principal * l.ratePm, 0));

export const totalLoanDebt = (p: PlayerState): number =>
  p.loans.reduce((s, l) => s + l.principal, 0);

export const totalMortgageDebt = (p: PlayerState): number =>
  p.holdings.reduce((s, h) => s + h.mortgage, 0);

export const totalDebt = (p: PlayerState): number =>
  totalLoanDebt(p) + totalMortgageDebt(p) + p.owedOwners;

export const equity = (p: PlayerState): number =>
  p.holdings.reduce((s, h) => (h.deal === "buy" ? s + h.value - h.mortgage : s), 0);

function modMults(h: Holding, p: PlayerState, state: GameState) {
  let occ = 1;
  let adr = 1;
  let rent = 1;
  const all = [...h.mods, ...p.mods, ...(state.market.cityMods[h.def.cityId] ?? [])];
  for (const m of all) {
    if (m.occMult) occ *= m.occMult;
    if (m.adrMult) adr *= m.adrMult;
    if (m.rentMult) rent *= m.rentMult;
  }
  return { occ, adr, rent };
}

/**
 * Simulate one month for a holding.
 * rng=null gives the deterministic expected month (projections, scoring).
 * overloadPenalty is an absolute occupancy subtraction applied to STR/MTR.
 */
export function simulateHoldingMonth(
  h: Holding,
  p: PlayerState,
  state: GameState,
  monthIdx: number,
  rng: (() => number) | null,
  overloadPenalty: number,
): HoldingMonth {
  const d = h.def;
  const mods = modMults(h, p, state);
  const revMgr = hasStaff(p, "revenue");
  const cleaners = hasStaff(p, "cleaners");
  const coord = hasStaff(p, "maintenance");

  let gross = 0;
  let varCost = 0;
  let occ = 0;
  let adr = 0;

  if (h.strategy === "STR") {
    if (h.suspendedMonths > 0) {
      occ = 0;
      gross = 0;
      adr = 0;
    } else {
      const season = seasonFactor(d.cityId, monthIdx);
      const repFactor = 1 + (p.rep - 70) * 0.003;
      const reviewFactor = clamp(
        1 + (h.review - 4.4) * (d.reviewSensitivity / 100) * 0.35,
        0.5,
        1.25,
      );
      const regDrag =
        d.regRisk >= 60 && !isCompliant(p, d.cityId) && !h.licence ? 0.95 : 1;
      occ =
        d.strOcc *
          season *
          cityById(d.cityId).demand *
          repFactor *
          reviewFactor *
          regDrag *
          mods.occ +
        (revMgr ? 0.04 : 0) -
        overloadPenalty;
      occ = clamp(occ, 0.15, 0.97);
      const adrReview = clamp(1 + (h.review - 4.4) * 0.08, 0.85, 1.12);
      const seasonAdr = 1 + (season - 1) * 0.5;
      adr =
        d.strAdr *
        h.furnish *
        (h.pricingTools ? 1.06 : 1) *
        (revMgr ? 1.08 : 1) *
        adrReview *
        seasonAdr *
        mods.adr;
      gross = adr * 30 * occ;
      varCost = gross * (cleaners ? 0.13 : 0.17);
    }
  } else if (h.strategy === "MTR") {
    const repFactor = 1 + (p.rep - 70) * 0.0015;
    occ = clamp(0.93 * mods.occ - overloadPenalty * 0.5, 0.4, 1);
    gross = d.mtrRent * occ * mods.rent * repFactor;
    adr = gross / 30;
    varCost = gross * (cleaners ? 0.055 : 0.07);
  } else {
    occ = 0.99;
    gross = d.ltrRent * (p.rep < 40 ? 0.95 : 1);
    adr = gross / 30;
    varCost = gross * 0.035;
  }

  const stratMaint = h.strategy === "LTR" ? 0.7 : h.strategy === "MTR" ? 0.85 : 1;
  const maintRoll = rng ? jitter(rng, 0.35, 1.8) : 1;
  const maint =
    d.price * (d.maintRisk / 100) * 0.0035 * stratMaint * maintRoll * (coord ? 0.6 : 1);

  let fee = 0;
  let opsShare = 0;
  let ownerPayout = 0;
  let leasePay = 0;
  let mortgagePay = 0;
  let playerNet = 0;

  if (h.deal === "manage") {
    fee = gross * MGMT_FEE[h.strategy];
    opsShare = gross * 0.05;
    ownerPayout = Math.max(0, gross - fee - varCost - maint);
    playerNet = gross - ownerPayout - varCost - maint - opsShare;
  } else if (h.deal === "lease") {
    leasePay = d.leaseMonthly;
    playerNet = gross - varCost - maint - leasePay;
  } else {
    mortgagePay = h.mortgage * state.market.ratePm;
    playerNet = gross - varCost - maint - mortgagePay;
  }

  return {
    gross: Math.round(gross),
    varCost: Math.round(varCost),
    maint: Math.round(maint),
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

export function overloadPenaltyFor(p: PlayerState): number {
  const over = playerLoad(p) - opsCapacity(p);
  return over > 0 ? Math.min(0.18, over * 0.04) : 0;
}

// --- deal projection (UI + bots) -------------------------------------------

export interface DealProjection {
  deal: DealType;
  strategy: Strategy;
  net: number;
  gross: number;
  occ: number;
  adr: number;
  revpar: number;
  cashNow: number;
  monthlyFixed: number; // lease or mortgage payment
  opsCost: number;
  affordable: boolean;
  flags: string[];
}

export function makeHolding(
  card: PropertyDef,
  deal: DealType,
  strategy: Strategy,
  id: string,
): Holding {
  return {
    id,
    def: card,
    deal,
    strategy,
    review: 4.4,
    furnish: deal === "lease" ? 1.05 : 1.0,
    pricingTools: false,
    licence: false,
    monthsHeld: 0,
    cumNet: 0,
    lastNet: 0,
    lastOcc: 0,
    lastAdr: 0,
    value: card.price,
    mortgage: deal === "buy" ? Math.round(card.price * 0.7) : 0,
    suspendedMonths: 0,
    mods: [],
  };
}

export function projectDeal(
  card: PropertyDef,
  deal: DealType,
  strategy: Strategy,
  p: PlayerState,
  state: GameState,
): DealProjection {
  const ghost = makeHolding(card, deal, strategy, "ghost");
  const monthIdx = p.monthsDone; // the month they're about to trade through
  const prospectiveLoad = playerLoad(p) + holdingOps(ghost);
  const cap = opsCapacity(p);
  const over = prospectiveLoad - cap;
  const overloadPenalty = over > 0 ? Math.min(0.18, over * 0.04) : 0;
  const m = simulateHoldingMonth(ghost, p, state, monthIdx, null, overloadPenalty);

  const cashNow =
    deal === "buy" ? card.deposit : deal === "lease" ? card.leaseSetup : card.onboardingCost;

  const flags: string[] = [];
  if (strategy === "STR" && card.regRisk >= 60 && !isCompliant(p, card.cityId))
    flags.push("High-regulation city");
  if (over > 0) flags.push("Would exceed ops capacity");
  if (m.playerNet <= 0) flags.push("Loss-making");
  else if (m.playerNet < 400) flags.push("Thin margin");
  if (strategy === "STR") {
    const next = seasonFactor(card.cityId, monthIdx);
    const after = seasonFactor(card.cityId, monthIdx + 1);
    if (Math.max(next, after) >= 1.2) flags.push("Peak season ahead");
    if (Math.min(next, after) <= 0.8) flags.push("Low season ahead");
  }
  if (card.ownerExpectation >= 75 && deal === "manage") flags.push("Demanding owner");

  return {
    deal,
    strategy,
    net: m.playerNet,
    gross: m.gross,
    occ: m.occ,
    adr: m.adr,
    revpar: Math.round(m.adr * m.occ),
    cashNow,
    monthlyFixed: m.leasePay + m.mortgagePay,
    opsCost: holdingOps(ghost),
    affordable: p.cash >= cashNow,
    flags,
  };
}

// Pro-forma monthly net operating income for scoring (deterministic, neutral season).
export function proformaNOI(p: PlayerState, state: GameState): number {
  if (p.bankrupt) return 0;
  const overloadPenalty = overloadPenaltyFor(p);
  let net = 0;
  for (const h of p.holdings) {
    // month index 7 (May, season 1.0) = neutral month, avoids peak/trough bias
    net += simulateHoldingMonth(h, p, state, 7, null, overloadPenalty).playerNet;
  }
  return Math.round(net - staffCost(p) - loanService(p));
}

export function mgmtMonthlyProfit(p: PlayerState, state: GameState): number {
  const overloadPenalty = overloadPenaltyFor(p);
  let profit = 0;
  for (const h of p.holdings) {
    if (h.deal !== "manage") continue;
    const m = simulateHoldingMonth(h, p, state, 7, null, overloadPenalty);
    profit += m.fee - m.opsShare;
  }
  return Math.round(profit);
}
