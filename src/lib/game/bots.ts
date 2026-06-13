// ---------------------------------------------------------------------------
// Bot policies V2: area-control edition.
// Maya scales fast (lease units, buildings, hotels, fast furnish, debt).
// Sam compounds (buy/manage, slow furnish, licences first, low debt).
// Both price moves with the same projection engine the human sees.
// ---------------------------------------------------------------------------

import type { Action } from "./engine/reducer";
import { creditLeft } from "./engine/reducer";
import type {
  Asset,
  FurnishType,
  GameState,
  OpModel,
  PendingAction,
  PlayerState,
  StaffId,
} from "./types";
import { makeRng } from "./rng";
import { hasStaff, opsCapacity, staffCost } from "./data/staff";
import {
  areaById,
  fullPlayerLoad,
  isUnlicensed,
  manageCapReached,
  needsLicence,
  playerLoad,
  projectAcquisition,
  type AcquisitionSpec,
} from "./engine/sim";
import { marketPhase, OPS_PER_UNIT } from "./types";
import { botLotValue, minNextBid } from "./engine/auction";

/** Cash floor that scales with the bot's fixed monthly obligations. */
function runwayBuffer(p: PlayerState, base: number, factor: number): number {
  const fixed =
    p.assets.reduce((s, a) => s + a.monthlyFixed, 0) +
    staffCost(p) +
    p.loans.reduce((s, l) => s + l.principal * l.ratePm, 0);
  return base + Math.round(fixed * factor);
}

interface Personality {
  buffer: number;
  riskTol: number;
  hireAt: number;
  loanHappy: boolean;
  dealThreshold: number;
  nightlyBias: number; // STR/HOTEL appetite
  buildingBias: number;
  hotelBias: number;
  dealBias: { rent: number; buy: number; manage: number; building: number };
  furnish: FurnishType;
}

const PERSONALITIES: Record<"aggressive" | "steady", Personality> = {
  aggressive: {
    buffer: 10_000,
    riskTol: 0.8,
    hireAt: 1.02,
    loanHappy: true,
    dealThreshold: 800,
    nightlyBias: 6_000,
    buildingBias: 6_000,
    hotelBias: 8_000,
    dealBias: { rent: 8_000, buy: 0, manage: -1_000, building: 6_000 },
    furnish: "fast",
  },
  steady: {
    buffer: 30_000,
    riskTol: 0.25,
    hireAt: 0.85,
    loanHappy: false,
    dealThreshold: 2_500,
    nightlyBias: 0,
    buildingBias: 0,
    hotelBias: -6_000,
    dealBias: { rent: -2_000, buy: 7_000, manage: 7_000, building: -4_000 },
    furnish: "slow",
  },
};

const persOf = (p: PlayerState): Personality => PERSONALITIES[p.personality ?? "steady"];

// --- area decisions ---------------------------------------------------------------

function decideAreaActions(state: GameState, p: PlayerState, areaId: string): Action[] {
  const pers = persOf(p);
  const rng = makeRng(state);
  const area = areaById(state, areaId);
  const out: Action[] = [];

  const kinds: AcquisitionSpec["kind"][] = ["rent", "buy"];
  if (!manageCapReached(p, area.id)) kinds.push("manage");
  if (state.buildingTaken[area.id] === null) kinds.push("building");
  const models: OpModel[] = ["STR", "MTR", "LTR"];

  // no fixed game end any more — plan on a rolling horizon, shorter when the
  // consolidation phase makes long pipelines suicidal
  const horizon = marketPhase(state.month) === 2 ? 6 : 12;
  const buffer = runwayBuffer(p, pers.buffer, pers.loanHappy ? 1.8 : 2.5);
  const load = fullPlayerLoad(p); // plan on everything going live
  const cap = opsCapacity(p);
  const slack = pers.riskTol > 0.5 ? 0.5 : 0;
  const staffed = hasStaff(p, "guestOps") || hasStaff(p, "aiOps");
  const canStaffUp = staffed || p.cash > 40_000;
  let best: { spec: AcquisitionSpec; util: number } | null = null;
  for (const kind of kinds) {
    const modelPool: OpModel[] =
      kind === "building" && canStaffUp ? [...models, "HOTEL"] : models;
    for (const model of modelPool) {
      // hard ops gate: bots never knowingly wreck their whole portfolio
      const addedLoad = OPS_PER_UNIT[model] * (kind === "building" ? area.buildingUnits : 1);
      const capAfterHires = cap + (hasStaff(p, "aiOps") ? 0 : 8) + (hasStaff(p, "guestOps") ? 0 : 8);
      if (load + addedLoad > capAfterHires + slack) continue;

      const withLicence =
        needsLicence(area, model, p) && (model === "HOTEL" || pers.riskTol < 0.5 || rng() < 0.4);
      const spec: AcquisitionSpec = { kind, model, furnish: pers.furnish, withLicence };
      const proj = projectAcquisition(state, p, area, spec);
      const totalCashNow = proj.costs.cashNow + (withLicence ? proj.costs.licenceCost : 0);
      if (p.cash - totalCashNow < buffer) continue;
      if (model === "HOTEL" && !staffed && !canStaffUp) continue;
      if (proj.liveNet <= (kind === "buy" ? -300 : 0)) continue; // never knowingly bleed
      if (load + addedLoad > cap && proj.flags.includes("Over ops capacity") && pers.riskTol < 0.5)
        continue;
      // long pipelines during consolidation are how operators die
      // (hotel licences run alongside the fit-out, so take the max, not the sum)
      const pipeMonths =
        model === "HOTEL" ? Math.max(proj.monthsToLive, 4) : proj.monthsToLive;
      if (pipeMonths >= horizon) continue;

      const monthsEarning = Math.max(0, horizon - pipeMonths) + 4;
      let util = proj.liveNet * monthsEarning - proj.burnNow * pipeMonths;
      util += pers.dealBias[kind];
      if (kind === "manage") util -= managedUnitsOf(p) * 1_500; // owner pool thins out
      if (model === "STR" || model === "HOTEL") util += pers.nightlyBias;
      if (kind === "building") util += pers.buildingBias;
      if (model === "HOTEL") util += pers.hotelBias;
      if (kind === "buy") util += area.unitPrice * 0.05;
      if (proj.flags.includes("Over ops capacity")) util -= (1 - pers.riskTol) * 30_000 + 6_000;
      if (proj.flags.includes("Licence advised") && !withLicence) util -= (1 - pers.riskTol) * 9_000;
      // contesting control is fun: small bonus for entering a rival's area
      const controller = state.control[area.id];
      if (controller !== null && controller !== p.id) util += pers.riskTol * 3_000;
      util *= 0.88 + rng() * 0.24;

      if (!best || util > best.util) best = { spec, util };
    }
  }
  if (best && best.util > pers.dealThreshold) {
    // hotels need an ops backbone in place before signing
    if (
      best.spec.model === "HOTEL" &&
      !(hasStaff(p, "guestOps") || hasStaff(p, "aiOps")) &&
      p.cash > 30_000
    ) {
      out.push({ t: "HIRE", staff: "aiOps" });
    }
    out.push({ t: "ACQUIRE", spec: best.spec });
  }

  // licence any exposed nightly asset here (steady cares, aggressive sometimes)
  const exposed = p.assets.find(
    (a) =>
      a.areaId === area.id &&
      (a.model === "STR" || a.model === "HOTEL") &&
      a.licence !== "applied" &&
      a.licence !== "approved" &&
      isUnlicensed(state, p, a),
  );
  if (exposed && (pers.riskTol < 0.5 || rng() < 0.3) && p.cash > pers.buffer + 8_000) {
    out.push({ t: "APPLY_LICENCE", assetId: exposed.id });
  }

  out.push({ t: "CLOSE_AREA" });
  return out;
}

// --- housekeeping (hiring / finance), run once per own turn -------------------------

export function botHousekeeping(state: GameState, p: PlayerState): Action[] {
  const pers = persOf(p);
  const out: Action[] = [];
  const has = (id: StaffId) => p.staff.includes(id);
  const load = playerLoad(p);
  let cap = opsCapacity(p);
  const live = p.assets.filter((a) => a.status === "live");
  // rough monthly nightly gross — staff are only worth their salary at scale
  const nightlyGross = live
    .filter((a) => a.model === "STR" || a.model === "HOTEL")
    .reduce((s, a) => {
      const area = areaById(state, a.areaId);
      return s + area.baseAdr * 30 * area.baseOcc * a.units * (a.model === "HOTEL" ? 1.3 : 1);
    }, 0);
  const totalUnits = live.reduce((s, a) => s + a.units, 0);
  const managedUnits = p.assets
    .filter((a) => a.deal === "manage")
    .reduce((s, a) => s + a.units, 0);
  const minCash = pers.loanHappy ? 12_000 : 25_000;

  const hire = (id: StaffId) => {
    if (!has(id) && p.cash >= minCash) {
      out.push({ t: "HIRE", staff: id });
      if (id === "guestOps" || id === "aiOps") cap += 8;
    }
  };

  // capacity hires only when ops actually binds
  if (load / cap >= pers.hireAt) hire("aiOps");
  if (load / cap >= pers.hireAt) hire("guestOps");
  // value hires only once the portfolio gross can carry the salary
  if (nightlyGross >= 30_000) hire("cleaners");
  if (nightlyGross >= 55_000) hire("revenue");
  if (managedUnits >= 5) hire("ownerSuccess");
  if (totalUnits >= 12) hire("maintenance");
  // hotels need an ops backbone before they can even be considered
  if (
    pers.loanHappy &&
    !has("guestOps") &&
    !has("aiOps") &&
    p.assets.some((a) => a.kind === "building")
  )
    hire("aiOps");

  // shed staff that no longer pays for itself
  if (has("cleaners") && nightlyGross < 22_000) out.push({ t: "FIRE", staff: "cleaners" });
  if (has("revenue") && nightlyGross < 40_000) out.push({ t: "FIRE", staff: "revenue" });
  if (p.cash < 10_000 && p.staff.length) {
    const order: StaffId[] = ["revenue", "maintenance", "ownerSuccess", "cleaners"];
    const target = order.find((id) => has(id));
    if (target) out.push({ t: "FIRE", staff: target });
  }

  if (pers.loanHappy) {
    if (
      p.cash < 40_000 &&
      creditLeft(state, p) >= 60_000 &&
      marketPhase(state.month) < 2 &&
      p.loans.reduce((s, l) => s + l.principal, 0) < 120_000
    )
      out.push({ t: "LOAN", kind: "bank", amount: 60_000 });
  } else {
    if (p.cash > 90_000 && p.loans.length) {
      const l = p.loans[0];
      out.push({ t: "REPAY", loanId: l.id, amount: Math.min(l.principal, 40_000) });
    }
    if (p.cash < 18_000 && creditLeft(state, p) >= 40_000)
      out.push({ t: "LOAN", kind: "bank", amount: 40_000 });
    // steady Sam buys city compliance where he runs exposed nightly units
    const exposed = p.assets.find((a) => isUnlicensed(state, p, a));
    if (exposed && p.cash > 45_000) {
      const cityId = areaById(state, exposed.areaId).cityId;
      if (!p.cityCompliance.includes(cityId)) out.push({ t: "UPGRADE_COMPLIANCE", cityId });
    }
  }
  // rejected licences: hotels reapply early then bail; unlicensed STR units
  // running in high-reg areas convert rather than keep eating fines
  const lateGame = marketPhase(state.month) === 2;
  for (const a of p.assets) {
    if (a.licence !== "rejected") continue;
    if (a.model === "HOTEL") {
      if (lateGame) out.push({ t: "SWITCH_MODEL", assetId: a.id, model: "MTR" });
      else if (p.cash > pers.buffer + 10_000) out.push({ t: "APPLY_LICENCE", assetId: a.id });
    } else if (a.model === "STR" && isUnlicensed(state, p, a)) {
      if (pers.riskTol < 0.5 || a.licenceAttempts >= 1 || lateGame) {
        out.push({ t: "SWITCH_MODEL", assetId: a.id, model: "MTR" });
      } else if (p.cash > pers.buffer + 8_000) {
        out.push({ t: "APPLY_LICENCE", assetId: a.id });
      }
    }
  }
  return out;
}

const managedUnitsOf = (p: PlayerState): number =>
  p.assets.filter((a) => a.deal === "manage").reduce((s, a) => s + a.units, 0);

// --- events ------------------------------------------------------------------------

function decideEventChoice(
  state: GameState,
  p: PlayerState,
  pending: Extract<PendingAction, { kind: "event" }>,
): Action {
  const pers = persOf(p);
  const rng = makeRng(state);
  let bestId = pending.choices[0].id;
  let bestScore = -Infinity;
  for (const c of pending.choices) {
    if (c.disabled) continue;
    const score = c.evHint + (pers.riskTol - c.riskHint) * 1_500 + rng() * 400;
    if (score > bestScore) {
      bestScore = score;
      bestId = c.id;
    }
  }
  return { t: "EVENT_CHOICE", choiceId: bestId };
}

// --- emergencies ---------------------------------------------------------------------

function emergencyAction(state: GameState, p: PlayerState): Action {
  if (p.cash >= 0) return { t: "EMERGENCY_DONE" };
  const needed = -p.cash;

  const borrow = Math.min(needed + 15_000, creditLeft(state, p));
  if (borrow >= 5_000) return { t: "LOAN", kind: "bridge", amount: borrow };

  const owned = p.assets
    .filter((a) => a.deal === "buy")
    .sort((a, b) => b.value - b.mortgage - (a.value - a.mortgage))[0];
  if (owned && owned.value * 0.85 - owned.mortgage > 5_000)
    return { t: "SELL_ASSET", assetId: owned.id, fire: true };

  if ((p.lastPnl?.ownerPayouts ?? 0) > 0 && p.owedOwners === 0) return { t: "DELAY_PAYOUT" };
  if (p.staff.length) return { t: "FIRE", staff: p.staff[p.staff.length - 1] };

  const bleeder = p.assets
    .filter(
      (a) =>
        a.deal === "lease" &&
        (a.model === "STR" || a.model === "HOTEL") &&
        a.status === "live" &&
        a.lastNet < 0,
    )
    .sort((a, b) => a.lastNet - b.lastNet)[0];
  if (bleeder) return { t: "SWITCH_MODEL", assetId: bleeder.id, model: "MTR" };

  // last resort: exit the heaviest lease burn (often a building in pipeline)
  if (p.cash < -20_000) {
    const burner = p.assets
      .filter((a) => a.deal === "lease" && a.monthlyFixed > 0)
      .sort((a, b) => b.monthlyFixed - a.monthlyFixed)[0];
    if (burner && p.cash - burner.monthlyFixed > BANKRUPT_FLOOR_SAFE)
      return { t: "SELL_ASSET", assetId: burner.id };
  }
  if (p.cash >= -50_000) return { t: "EMERGENCY_DONE" };
  return { t: "DECLARE_BANKRUPTCY" };
}

const BANKRUPT_FLOOR_SAFE = -48_000;

// --- auctions ---------------------------------------------------------------------------

function auctionAction(
  state: GameState,
  p: PlayerState,
  h: Extract<PendingAction, { kind: "auction" }>,
): Action {
  const pers = persOf(p);
  const rng = makeRng(state);
  const min = minNextBid(h);
  const buffer = runwayBuffer(p, Math.max(6_000, pers.buffer * 0.6), pers.loanHappy ? 1 : 1.8);
  if (p.cash - min < buffer) return { t: "AUCTION_PASS" };

  let value = botLotValue(state, p, h.lot) * (0.85 + rng() * 0.3);
  // strategy: completing a city set is worth real money…
  const area = areaById(state, h.lot.areaId);
  const sister = state.areas.find((a) => a.cityId === area.cityId && a.id !== area.id);
  if (sister && state.control[sister.id] === p.id) value *= 1.35;
  // …and so is denying a rival who is about to complete theirs
  if (
    h.highBidder !== null &&
    h.highBidder !== p.id &&
    sister &&
    state.control[sister.id] === h.highBidder
  ) {
    value = Math.max(value, h.highBid * (1 + pers.riskTol * 0.35));
  }
  // distressed bargains tempt everyone; permits tempt the exposed
  if (h.lot.type === "distressed") value *= 1.1;

  const maxBid = Math.min(p.cash - buffer, value);
  if (min > maxBid) return { t: "AUCTION_PASS" };
  // open low, escalate by round
  const target =
    h.round === 1 ? Math.max(h.lot.reserve, Math.round(maxBid * 0.55)) :
    h.round === 2 ? Math.round(maxBid * 0.8) :
    Math.round(maxBid);
  const amount = Math.max(min, Math.min(target, maxBid));
  if (amount < min) return { t: "AUCTION_PASS" };
  return { t: "AUCTION_BID", amount: Math.round(amount / 100) * 100 };
}

function lotConfigAction(
  state: GameState,
  p: PlayerState,
  h: Extract<PendingAction, { kind: "lotConfig" }>,
): Action {
  const pers = persOf(p);
  const area = areaById(state, h.lot.areaId);
  const model: OpModel = area.regRisk >= 60 && pers.riskTol < 0.5 ? "MTR" : "STR";
  return {
    t: "LOT_CONFIG",
    model,
    furnish: pers.furnish,
    withLicence: needsLicence(area, model, p) && pers.riskTol < 0.5,
  };
}

// --- driver entry point ----------------------------------------------------------------

let housekeepingDoneFor = "";

export function botActionsFor(state: GameState): Action[] {
  const p = state.players[state.current];
  const h = state.pendingQueue[0];
  if (!h) return [{ t: "END_TURN" }];

  switch (h.kind) {
    case "monthEnd":
      return [{ t: "ACK" }];
    case "event":
      return h.choices.length ? [decideEventChoice(state, p, h)] : [{ t: "ACK" }];
    case "area": {
      const key = `${p.id}:${state.month}:${p.pos}`;
      const housekeeping = housekeepingDoneFor === key ? [] : botHousekeeping(state, p);
      housekeepingDoneFor = key;
      return [...housekeeping, ...decideAreaActions(state, p, h.areaId)];
    }
    case "referral": {
      const wouldLoad = playerLoad(p) + 1;
      const accept = wouldLoad <= opsCapacity(p) + (persOf(p).riskTol > 0.5 ? 1 : 0);
      return [{ t: "REFERRAL", accept }];
    }
    case "auction":
      return [auctionAction(state, p, h)];
    case "lotConfig":
      return [lotConfigAction(state, p, h)];
    case "emergency":
      return [emergencyAction(state, p)];
  }
}

export function botAssetById(p: PlayerState, id: string): Asset | undefined {
  return p.assets.find((a) => a.id === id);
}
