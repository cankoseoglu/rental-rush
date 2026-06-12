// ---------------------------------------------------------------------------
// Bot decision policies. Maya plays aggressive lease/STR scale; Sam plays
// steady buy/manage. Both use the same projection maths as the human UI.
// ---------------------------------------------------------------------------

import type { Action } from "./engine/reducer";
import { creditLeft } from "./engine/reducer";
import type {
  DealType,
  GameState,
  PendingAction,
  PlayerState,
  Strategy,
} from "./types";
import type { StaffId } from "./types";
import { makeRng } from "./rng";
import { opsCapacity } from "./data/staff";
import { playerLoad, projectDeal } from "./engine/sim";

interface Personality {
  buffer: number; // cash they refuse to dip below for acquisitions
  strBias: number;
  dealBias: Record<DealType, number>;
  riskTol: number; // 0..1
  hireAt: number; // load/cap ratio that triggers capacity hires
  loanHappy: boolean;
  dealThreshold: number;
}

const PERSONALITIES: Record<"aggressive" | "steady", Personality> = {
  aggressive: {
    buffer: 6_000,
    strBias: 6_000,
    dealBias: { buy: 0, lease: 9_000, manage: -1_000 },
    riskTol: 0.8,
    hireAt: 1.02,
    loanHappy: true,
    dealThreshold: 800,
  },
  steady: {
    buffer: 30_000,
    strBias: 0,
    dealBias: { buy: 7_000, lease: -2_000, manage: 7_000 },
    riskTol: 0.25,
    hireAt: 0.85,
    loanHappy: false,
    dealThreshold: 2_500,
  },
};

const persOf = (p: PlayerState): Personality =>
  PERSONALITIES[p.personality ?? "steady"];

function decideDeal(state: GameState, p: PlayerState, card: PendingAction & { kind: "property" }): Action {
  const pers = persOf(p);
  const rng = makeRng(state);
  let best: { action: Action; util: number } | null = null;
  const strategies: Strategy[] = ["STR", "MTR", "LTR"];

  for (const deal of card.card.allowedDeals) {
    for (const strategy of strategies) {
      const proj = projectDeal(card.card, deal, strategy, p, state);
      if (!proj.affordable) continue;
      if (p.cash - proj.cashNow < pers.buffer) continue;

      let util = proj.net * 12;
      util += pers.dealBias[deal];
      if (strategy === "STR") util += pers.strBias;
      if (deal === "buy") util += card.card.price * 0.05; // equity + appreciation kicker
      if (proj.flags.includes("Would exceed ops capacity"))
        util -= (1 - pers.riskTol) * 30_000 + 6_000;
      if (proj.flags.includes("High-regulation city")) util -= (1 - pers.riskTol) * 9_000;
      if (deal === "lease" && strategy === "STR") util -= (1 - pers.riskTol) * 6_000;
      if (proj.net <= 0) util -= 25_000;
      util *= 0.88 + rng() * 0.24;

      if (!best || util > best.util) {
        best = { action: { t: "DEAL", deal, strategy }, util };
      }
    }
  }
  if (best && best.util > pers.dealThreshold) return best.action;
  return { t: "PASS_DEAL" };
}

function decideEventChoice(state: GameState, p: PlayerState, pending: PendingAction & { kind: "event" }): Action {
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

function hiringActions(state: GameState, p: PlayerState): Action[] {
  const pers = persOf(p);
  const out: Action[] = [];
  const has = (id: StaffId) => p.staff.includes(id);
  const load = playerLoad(p);
  let cap = opsCapacity(p);
  const strCount = p.holdings.filter((h) => h.strategy === "STR").length;
  const managed = p.holdings.filter((h) => h.deal === "manage").length;
  const minCash = pers.loanHappy ? 12_000 : 25_000;

  const hire = (id: "guestOps" | "cleaners" | "maintenance" | "revenue" | "ownerSuccess" | "aiOps") => {
    if (!has(id) && p.cash >= minCash) {
      out.push({ t: "HIRE", staff: id });
      if (id === "guestOps" || id === "aiOps") cap += 3;
    }
  };

  if (load / cap >= pers.hireAt) hire("aiOps");
  if (load / cap >= pers.hireAt) hire("guestOps");
  if (strCount >= (pers.loanHappy ? 4 : 3)) hire("cleaners");
  if (strCount >= 3 && p.cash > 60_000) hire("revenue");
  if (managed >= (pers.loanHappy ? 3 : 2)) hire("ownerSuccess");
  if (p.holdings.length >= (pers.loanHappy ? 5 : 4)) hire("maintenance");

  // shed payroll when broke
  if (p.cash < 10_000 && p.staff.length) {
    const order: Array<"revenue" | "maintenance" | "ownerSuccess" | "cleaners"> = [
      "revenue",
      "maintenance",
      "ownerSuccess",
      "cleaners",
    ];
    const target = order.find((id) => has(id));
    if (target) out.push({ t: "FIRE", staff: target });
  }
  return out;
}

function financeActions(state: GameState, p: PlayerState): Action[] {
  const pers = persOf(p);
  const out: Action[] = [];
  if (pers.loanHappy) {
    if (p.cash < 40_000 && creditLeft(p) >= 60_000)
      out.push({ t: "LOAN", kind: "bank", amount: 60_000 });
    if (p.cash < 15_000 && !p.investorTaken) out.push({ t: "INVESTOR" });
  } else {
    if (p.cash > 90_000 && p.loans.length) {
      const l = p.loans[0];
      out.push({ t: "REPAY", loanId: l.id, amount: Math.min(l.principal, 40_000) });
    }
    if (p.cash < 18_000 && creditLeft(p) >= 40_000)
      out.push({ t: "LOAN", kind: "bank", amount: 40_000 });
  }
  return out;
}

function upgradeActions(state: GameState, p: PlayerState): Action[] {
  const pers = persOf(p);
  const out: Action[] = [];
  if (!pers.loanHappy) {
    // steady Sam buys compliance where exposed
    const exposed = p.holdings.find(
      (h) =>
        h.strategy === "STR" &&
        h.def.regRisk >= 60 &&
        !h.licence &&
        !p.cityCompliance.includes(h.def.cityId),
    );
    if (exposed && p.cash > 40_000)
      out.push({ t: "UPGRADE_COMPLIANCE", cityId: exposed.def.cityId });
  }
  if (p.cash > 45_000) {
    const target = p.holdings
      .filter((h) => h.strategy === "STR" && !h.pricingTools)
      .sort((a, b) => b.lastNet - a.lastNet)[0];
    if (target) out.push({ t: "UPGRADE_PRICING", holdingId: target.id });
  }
  return out;
}

/** One emergency step at a time; the driver re-evaluates after each dispatch. */
function emergencyAction(state: GameState, p: PlayerState): Action {
  if (p.cash >= 0) return { t: "EMERGENCY_DONE" };
  const needed = -p.cash;

  const borrow = Math.min(needed + 15_000, creditLeft(p));
  if (borrow >= 5_000) {
    return { t: "LOAN", kind: "bridge", amount: borrow };
  }
  const owned = p.holdings
    .filter((h) => h.deal === "buy")
    .sort((a, b) => b.value - b.mortgage - (a.value - a.mortgage))[0];
  if (owned && owned.value * 0.85 - owned.mortgage > 5_000)
    return { t: "SELL", holdingId: owned.id, fire: true };
  if ((p.lastPnl?.ownerPayouts ?? 0) > 0 && p.owedOwners === 0) return { t: "DELAY_PAYOUT" };
  if (p.staff.length) return { t: "FIRE", staff: p.staff[p.staff.length - 1] };
  const bleeder = p.holdings
    .filter((h) => h.deal === "lease" && h.strategy === "STR" && h.lastNet < 0)
    .sort((a, b) => a.lastNet - b.lastNet)[0];
  if (bleeder) return { t: "CONVERT", holdingId: bleeder.id, strategy: "MTR" };
  if (p.cash >= -50_000) return { t: "EMERGENCY_DONE" };
  return { t: "DECLARE_BANKRUPTCY" };
}

/**
 * Returns the next action(s) for the current bot given the pending head.
 * Emergencies return exactly one action so the driver can re-evaluate.
 */
export function botActionsFor(state: GameState): Action[] {
  const p = state.players[state.current];
  const h = state.pendingQueue[0];
  if (!h) return [{ t: "END_TURN" }];

  switch (h.kind) {
    case "monthEnd":
      return [{ t: "ACK" }];
    case "event":
      return h.choices.length ? [decideEventChoice(state, p, h)] : [{ t: "ACK" }];
    case "property":
      return [decideDeal(state, p, h)];
    case "referral": {
      const wouldLoad = playerLoad(p) + 2;
      const accept = wouldLoad <= opsCapacity(p) + (persOf(p).riskTol > 0.5 ? 1 : 0);
      return [{ t: "REFERRAL", accept }];
    }
    case "hiring":
      return [...hiringActions(state, p), { t: "CLOSE_SHOP" }];
    case "finance":
      return [...financeActions(state, p), { t: "CLOSE_SHOP" }];
    case "upgrade":
      return [...upgradeActions(state, p), { t: "CLOSE_SHOP" }];
    case "emergency":
      return [emergencyAction(state, p)];
  }
}
