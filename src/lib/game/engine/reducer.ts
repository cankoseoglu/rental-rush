// ---------------------------------------------------------------------------
// Game reducer: createGame + dispatch. Mutates state in place; the store
// re-renders by shallow-copying the root. All randomness flows through the
// serialisable rngState so daily-challenge games share identical worlds.
// ---------------------------------------------------------------------------

import type {
  DealType,
  GameMode,
  GameState,
  LoanKind,
  PendingAction,
  PlayerState,
  PnL,
  PnLLine,
  PropertyDef,
  StaffId,
  Strategy,
} from "../types";
import {
  APPRECIATION,
  BANK_RATE,
  BANKRUPT_FLOOR,
  BASE_MORTGAGE_RATE,
  BRIDGE_RATE,
  CONVERT_COST,
  CREDIT_BASE,
  INVESTOR_CASH,
  MAX_TURNS,
  MONTH_NAMES,
  REFI_LTV,
  SELL_FIRE,
  SELL_NORMAL,
  START_CASH,
  START_LANDING_BONUS,
  START_REP,
  START_TRUST,
} from "../types";
import { chance, clamp, hashSeed, makeRng, rint } from "../rng";
import { TILES, TILE_COUNT } from "../data/board";
import { cityById, seasonLabel } from "../data/cities";
import { generateDeck } from "../data/propertyGen";
import { hasStaff, opsCapacity, staffCost } from "../data/staff";
import { drawEvent, eventById, type EventCtx } from "../data/events";
import {
  loanService,
  makeHolding,
  overloadPenaltyFor,
  playerLoad,
  simulateHoldingMonth,
  totalLoanDebt,
} from "./sim";
import { computeResults } from "./score";

export type Action =
  | { t: "ROLL" }
  | { t: "ACK" }
  | { t: "DEAL"; deal: DealType; strategy: Strategy }
  | { t: "PASS_DEAL" }
  | { t: "EVENT_CHOICE"; choiceId: string }
  | { t: "REFERRAL"; accept: boolean }
  | { t: "HIRE"; staff: StaffId }
  | { t: "FIRE"; staff: StaffId }
  | { t: "LOAN"; kind: LoanKind; amount: number }
  | { t: "REPAY"; loanId: string; amount: number }
  | { t: "REFI"; holdingId: string }
  | { t: "INVESTOR" }
  | { t: "UPGRADE_FURNISH"; holdingId: string }
  | { t: "UPGRADE_PRICING"; holdingId: string }
  | { t: "UPGRADE_COMPLIANCE"; cityId: string }
  | { t: "CONVERT"; holdingId: string; strategy: Strategy }
  | { t: "SELL"; holdingId: string; fire?: boolean }
  | { t: "DELAY_PAYOUT" }
  | { t: "DECLARE_BANKRUPTCY" }
  | { t: "EMERGENCY_DONE" }
  | { t: "CLOSE_SHOP" }
  | { t: "END_TURN" };

// --- creation ----------------------------------------------------------------

export interface NewGameOpts {
  mode: GameMode;
  seedText: string; // e.g. "rr-1718..." or "daily-2026-06-12"
  dailyKey?: string;
}

const BOTS = [
  { name: "Maya", emoji: "🦩", color: "#FF7AC3", personality: "aggressive" as const },
  { name: "Sam", emoji: "🦉", color: "#6FA8FF", personality: "steady" as const },
];

function newPlayer(id: number, isHuman: boolean): PlayerState {
  const bot = BOTS[id - 1];
  return {
    id,
    name: isHuman ? "You" : bot.name,
    isHuman,
    color: isHuman ? "#B9F33E" : bot.color,
    emoji: isHuman ? "🦊" : bot.emoji,
    personality: isHuman ? undefined : bot.personality,
    pos: 0,
    cash: START_CASH,
    rep: START_REP,
    trust: START_TRUST,
    staff: [],
    holdings: [],
    loans: [],
    mods: [],
    cityCompliance: [],
    monthsDone: 0,
    turnsDone: 0,
    bankrupt: false,
    bankruptTurn: null,
    investorTaken: false,
    owedOwners: 0,
    accruedFines: 0,
    accruedRefunds: 0,
    lastEventId: null,
    lastPnl: null,
    cashHistory: [START_CASH],
    stats: {
      finesTotal: 0,
      finesCount: 0,
      refundsTotal: 0,
      emergencies: 0,
      overloadMonths: 0,
      strRevenue: 0,
      mtrRevenue: 0,
      ltrRevenue: 0,
      mgmtFees: 0,
      peakDebt: 0,
      churnedOwners: 0,
      bridgeLoans: 0,
      propertiesSold: 0,
      referrals: 0,
      bestMonthNet: -Infinity,
      worstMonthNet: Infinity,
      notables: [],
    },
  };
}

export function createGame(opts: NewGameOpts): GameState {
  const seed = hashSeed(opts.seedText);
  const state: GameState = {
    v: 1,
    seed,
    rngState: seed,
    mode: opts.mode,
    dailyKey: opts.dailyKey ?? null,
    tiles: TILES,
    deck: [],
    deckIdx: 0,
    players: [newPlayer(0, true), newPlayer(1, false), newPlayer(2, false)],
    current: 0,
    turnCount: 0,
    maxTurns: MAX_TURNS,
    market: { ratePm: BASE_MORTGAGE_RATE, rateRises: 0, cityMods: {} },
    phase: "awaitRoll",
    emergencyHandled: false,
    pendingQueue: [],
    lastRoll: null,
    lastPath: [],
    log: [],
    over: false,
    winnerId: null,
    results: null,
    nextId: 1,
  };
  const rng = makeRng(state);
  state.deck = generateDeck(rng, 30, 1);
  log(state, -1, "A new financial year begins. £150k each. Two rivals. Ten turns.", "neutral");
  return state;
}

// --- small helpers -------------------------------------------------------------

export function log(
  state: GameState,
  playerId: number,
  text: string,
  tone: "good" | "bad" | "neutral" | "money" = "neutral",
) {
  state.log.push({ turn: state.turnCount, playerId, text, tone });
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

const cur = (state: GameState): PlayerState => state.players[state.current];

const head = (state: GameState): PendingAction | null => state.pendingQueue[0] ?? null;

function notable(p: PlayerState, label: string, value: number) {
  p.stats.notables.push({ label, value });
}

export function creditCapacity(p: PlayerState): number {
  return CREDIT_BASE + (p.rep >= 80 ? 75_000 : 0) - (p.rep < 40 ? 100_000 : 0);
}

export function creditLeft(p: PlayerState): number {
  return Math.max(0, creditCapacity(p) - totalLoanDebt(p));
}

function ctxFor(state: GameState, p: PlayerState): EventCtx {
  return {
    state,
    p,
    rng: makeRng(state),
    log: (text, tone) => log(state, p.id, text, tone ?? "neutral"),
    notable: (label, value) => notable(p, label, value),
  };
}

function drawCard(state: GameState): PropertyDef {
  if (state.deckIdx >= state.deck.length) {
    const rng = makeRng(state);
    state.deck.push(...generateDeck(rng, 12, state.deck.length + 1));
  }
  return state.deck[state.deckIdx++];
}

/** Pull the next manage-allowed card out of the deck (for owner referrals). */
function drawManageCard(state: GameState): PropertyDef {
  for (let i = state.deckIdx; i < state.deck.length; i++) {
    if (state.deck[i].allowedDeals.includes("manage")) {
      const [card] = state.deck.splice(i, 1);
      return card;
    }
  }
  const card = drawCard(state);
  if (!card.allowedDeals.includes("manage")) card.allowedDeals = [...card.allowedDeals, "manage"];
  return card;
}

// --- month end -------------------------------------------------------------------

function runMonthEnd(state: GameState, p: PlayerState): { pnl: PnL; referral: boolean } {
  const rng = makeRng(state);
  const monthIdx = p.monthsDone;
  const monthName = MONTH_NAMES[monthIdx % MONTH_NAMES.length];
  const overloadPenalty = overloadPenaltyFor(p);
  const load = playerLoad(p);
  const cap = opsCapacity(p);

  let revenue = 0;
  let ownerPayouts = 0;
  let lease = 0;
  let mortgageSvc = 0;
  let maintenance = 0;
  let opsCosts = 0;
  let monthRefunds = 0;
  let trustDelta = 0;
  let repDelta = 0;
  const notes: string[] = [];
  const lines: PnLLine[] = [];

  for (const h of p.holdings) {
    const m = simulateHoldingMonth(h, p, state, monthIdx, rng, overloadPenalty);
    revenue += m.gross;
    ownerPayouts += m.ownerPayout;
    lease += m.leasePay;
    mortgageSvc += m.mortgagePay;
    maintenance += m.maint;
    opsCosts += m.varCost + m.opsShare;
    h.lastNet = m.playerNet;
    h.cumNet += m.playerNet;
    h.lastOcc = m.occ;
    h.lastAdr = m.adr;
    h.monthsHeld += 1;
    if (h.deal === "buy") h.value = Math.round(h.value * APPRECIATION);
    if (h.suspendedMonths > 0) {
      h.suspendedMonths -= 1;
      notes.push(`${h.def.name} sat suspended — zero revenue.`);
    }
    if (h.strategy === "STR" && m.occ < 0.45 && m.gross > 0)
      h.review = clamp(h.review - 0.05, 3, 5);
    h.review = clamp(h.review + (4.45 - h.review) * 0.05, 3, 5);
    h.mods = h.mods
      .map((mod) => ({ ...mod, monthsLeft: mod.monthsLeft - 1 }))
      .filter((mod) => mod.monthsLeft > 0);

    if (h.deal === "manage") {
      const expected = h.def.ownerExpectation * 22;
      const ratio = m.ownerPayout / Math.max(1, expected);
      let d = ratio >= 1.25 ? 3 : ratio >= 0.85 ? 1 : ratio >= 0.55 ? -3 : -6;
      if (hasStaff(p, "ownerSuccess")) d = Math.max(d, -2);
      trustDelta += d;
      p.stats.mgmtFees += m.fee;
    }
    if (h.strategy === "STR") p.stats.strRevenue += m.gross;
    else if (h.strategy === "MTR") p.stats.mtrRevenue += m.gross;
    else p.stats.ltrRevenue += m.gross;

    lines.push({
      name: h.def.name,
      strategy: h.strategy,
      deal: h.deal,
      gross: m.gross,
      net: m.playerNet,
      occ: m.occ,
      adr: m.adr,
    });
  }

  if (hasStaff(p, "ownerSuccess") && p.holdings.some((h) => h.deal === "manage"))
    trustDelta += 3;
  trustDelta = clamp(trustDelta, -9, 7);

  const loanSvc = loanService(p);
  const staffC = staffCost(p);

  if (p.owedOwners > 0) {
    ownerPayouts += p.owedOwners;
    notes.push(`Caught up £${p.owedOwners.toLocaleString("en-GB")} of delayed owner payouts.`);
    p.owedOwners = 0;
  }

  const over = load - cap;
  if (over > 0) {
    p.stats.overloadMonths += 1;
    repDelta -= 2;
    notes.push(`Ran over ops capacity (${load.toFixed(1)}/${cap}). Things slipped.`);
    for (let i = 0; i < Math.ceil(over); i++) {
      if (!chance(rng, 0.45)) continue;
      if (chance(rng, 0.5)) {
        const r = rint(rng, 300, 900);
        monthRefunds += r;
        p.stats.refundsTotal += r;
        notes.push(`Refunded £${r} after a dropped ball.`);
      } else {
        repDelta -= 3;
        const h = p.holdings[Math.floor(rng() * p.holdings.length)];
        if (h) {
          h.review = clamp(h.review - 0.15, 3, 5);
          if (h.deal === "manage") trustDelta -= 2;
        }
        notes.push("A bad review landed — guests noticed the chaos.");
      }
    }
  }

  if (p.holdings.length > 0) {
    const avg = p.holdings.reduce((s, h) => s + h.review, 0) / p.holdings.length;
    repDelta += clamp(Math.round((avg - 4.35) * 6), -3, 4);
  }

  const fines = p.accruedFines;
  const refunds = p.accruedRefunds + monthRefunds;
  const debtService = Math.round(mortgageSvc + loanSvc);

  const net = Math.round(
    revenue - ownerPayouts - lease - debtService - staffC - maintenance - opsCosts - refunds - fines,
  );

  // fines + event refunds already hit cash when they happened
  const cashDelta = net + fines + p.accruedRefunds;
  p.cash = Math.round(p.cash + cashDelta);
  p.accruedFines = 0;
  p.accruedRefunds = 0;

  p.rep = clamp(Math.round(p.rep + repDelta), 1, 100);
  if (p.holdings.some((h) => h.deal === "manage")) {
    p.trust = clamp(Math.round(p.trust + trustDelta), 1, 100);
  } else {
    p.trust = clamp(p.trust + Math.sign(70 - p.trust), 1, 100);
    trustDelta = 0;
  }

  // owner churn
  let referral = false;
  const managed = p.holdings.filter((h) => h.deal === "manage");
  if (p.trust < 30 && managed.length > 0) {
    const worst = [...managed].sort((a, b) => a.lastNet - b.lastNet)[0];
    p.holdings = p.holdings.filter((h) => h.id !== worst.id);
    p.stats.churnedOwners += 1;
    p.trust = 45;
    notes.push(`The owner of ${worst.def.name} pulled the property. Word travels.`);
    notable(p, `Lost ${worst.def.name} — owner walked after trust collapsed`, -12_000);
    log(state, p.id, `${p.name} lost ${worst.def.name} — the owner churned`, "bad");
  } else if (p.trust >= 80 && managed.length > 0 && chance(rng, 0.25)) {
    referral = true;
    p.stats.referrals += 1;
  }

  p.mods = p.mods
    .map((m) => ({ ...m, monthsLeft: m.monthsLeft - 1 }))
    .filter((m) => m.monthsLeft > 0);

  p.monthsDone += 1;
  p.stats.bestMonthNet = Math.max(p.stats.bestMonthNet, net);
  p.stats.worstMonthNet = Math.min(p.stats.worstMonthNet, net);
  if (net >= 9000) notable(p, `${monthName}: a +£${Math.round(net / 1000)}k month`, net);
  if (net <= -6000) notable(p, `${monthName}: bled −£${Math.round(-net / 1000)}k in a month`, net);
  p.cashHistory.push(p.cash);
  if (p.cashHistory.length > 24) p.cashHistory.shift();

  if (!p.isHuman) {
    const amount = `£${Math.abs(net).toLocaleString("en-GB")}`;
    log(state, p.id, `${p.name}'s ${monthName}: ${net >= 0 ? "+" : "−"}${amount} net`, net >= 0 ? "money" : "bad");
  }

  const pnl: PnL = {
    month: monthName,
    seasonLabel: seasonLabel(monthIdx),
    revenue: Math.round(revenue),
    ownerPayouts: Math.round(ownerPayouts),
    lease: Math.round(lease),
    debtService,
    staffCost: staffC,
    maintenance: Math.round(maintenance),
    refunds: Math.round(refunds),
    fines: Math.round(fines),
    net,
    cashAfter: p.cash,
    repDelta,
    trustDelta,
    notes,
    lines,
  };
  // fold cleaning/ops into the statement as part of maintenance? No — keep
  // honest books: opsCosts ride inside revenue lines for the UI via lines[],
  // and the statement shows them as part of "maintenance & ops".
  pnl.maintenance = Math.round(maintenance + opsCosts);
  p.lastPnl = pnl;
  return { pnl, referral };
}

// --- bankruptcy -------------------------------------------------------------------

export function bankruptPlayer(state: GameState, p: PlayerState) {
  p.bankrupt = true;
  p.bankruptTurn = p.turnsDone + 1;
  p.holdings = [];
  p.loans = [];
  p.staff = [];
  log(state, p.id, `${p.name} ${p.isHuman ? "are" : "is"} bankrupt. The portfolio is repossessed.`, "bad");
  notable(p, "Went bankrupt", -150_000);
  if (state.current === p.id) state.pendingQueue = [];
  const solvent = state.players.filter((x) => !x.bankrupt);
  if (p.isHuman || solvent.length <= 1) endGame(state);
}

function endGame(state: GameState) {
  if (state.over) return;
  state.over = true;
  state.phase = "over";
  state.pendingQueue = [];
  state.results = computeResults(state);
  const top = [...state.results].sort((a, b) => b.score.total - a.score.total)[0];
  state.winnerId = top.playerId;
  const w = state.players[top.playerId];
  log(state, -1, `Year over. ${w.name} build${w.isHuman ? "" : "s"} the strongest rental empire.`, "good");
}

// --- main dispatch ------------------------------------------------------------------

export function dispatch(state: GameState, a: Action): void {
  if (state.over && a.t !== "END_TURN") return;
  const p = cur(state);

  switch (a.t) {
    case "ROLL": {
      if (state.phase !== "awaitRoll" || state.pendingQueue.length) return;
      const rng = makeRng(state);
      const d1 = rint(rng, 1, 6);
      const d2 = rint(rng, 1, 6);
      const steps = d1 + d2;
      const path: number[] = [];
      for (let i = 1; i <= steps; i++) path.push((p.pos + i) % TILE_COUNT);
      const passedStart = p.pos + steps >= TILE_COUNT;
      const dest = path[path.length - 1];
      p.pos = dest;
      state.lastRoll = [d1, d2];
      state.lastPath = path;
      state.phase = "action";

      const queue: PendingAction[] = [];
      if (passedStart) {
        if (dest === 0) {
          p.cash += START_LANDING_BONUS;
          log(state, p.id, `${p.name} land${p.isHuman ? "" : "s"} exactly on Month End — +£3k clean-books bonus`, "money");
        }
        const { pnl, referral } = runMonthEnd(state, p);
        queue.push({ kind: "monthEnd", pnl });
        if (referral) queue.push({ kind: "referral", card: drawManageCard(state) });
        if (p.cash < 0 && !state.emergencyHandled) {
          queue.push({ kind: "emergency" });
          state.emergencyHandled = true;
          p.stats.emergencies += 1;
          log(state, p.id, `${p.name} ${p.isHuman ? "are" : "is"} out of cash — emergency measures`, "bad");
        }
      }
      const tile = state.tiles[dest];
      if (tile.kind === "property") {
        queue.push({ kind: "property", card: drawCard(state) });
      } else if (
        tile.kind === "guest" ||
        tile.kind === "owner" ||
        tile.kind === "regulation" ||
        tile.kind === "market"
      ) {
        const kind = tile.kind;
        queue.push(drawEvent(ctxFor(state, p), kind));
        // event side effects may have pushed cash below zero
        if (p.cash < 0 && !state.emergencyHandled) {
          queue.push({ kind: "emergency" });
          state.emergencyHandled = true;
          p.stats.emergencies += 1;
        }
      } else if (tile.kind === "hiring") {
        queue.push({ kind: "hiring" });
      } else if (tile.kind === "finance") {
        queue.push({ kind: "finance" });
      } else if (tile.kind === "upgrade") {
        queue.push({ kind: "upgrade" });
      }
      state.pendingQueue = queue;
      return;
    }

    case "ACK": {
      const h = head(state);
      if (!h) return;
      if (h.kind === "monthEnd" || (h.kind === "event" && h.choices.length === 0)) {
        const wasReferralTease = h.kind === "event" && h.memo.referral === 1;
        state.pendingQueue.shift();
        if (wasReferralTease) {
          state.pendingQueue.unshift({ kind: "referral", card: drawManageCard(state) });
        }
        afterPop(state);
      }
      return;
    }

    case "EVENT_CHOICE": {
      const h = head(state);
      if (!h || h.kind !== "event" || h.choices.length === 0) return;
      const def = eventById(h.eventId);
      const effects = def.choose ? def.choose(ctxFor(state, p), a.choiceId, h.memo) : [];
      // replace with resolved info card so the human sees the outcome
      state.pendingQueue[0] = { ...h, choices: [], effects };
      if (p.cash < 0 && !state.emergencyHandled) {
        state.pendingQueue.splice(1, 0, { kind: "emergency" });
        state.emergencyHandled = true;
        p.stats.emergencies += 1;
      }
      return;
    }

    case "DEAL": {
      const h = head(state);
      if (!h || h.kind !== "property") return;
      const card = h.card;
      if (!card.allowedDeals.includes(a.deal)) return;
      const cost =
        a.deal === "buy" ? card.deposit : a.deal === "lease" ? card.leaseSetup : card.onboardingCost;
      if (p.cash < cost) return;
      p.cash -= cost;
      const holding = makeHolding(card, a.deal, a.strategy, `h${state.nextId++}`);
      p.holdings.push(holding);
      const verb = a.deal === "buy" ? "bought" : a.deal === "lease" ? "leased" : "signed";
      log(
        state,
        p.id,
        `${p.name} ${verb} ${card.name} (${cityById(card.cityId).name}) → ${a.strategy}`,
        "money",
      );
      state.pendingQueue.shift();
      afterPop(state);
      return;
    }

    case "PASS_DEAL": {
      const h = head(state);
      if (!h || h.kind !== "property") return;
      log(state, p.id, `${p.name} passed on ${h.card.name}`, "neutral");
      state.pendingQueue.shift();
      afterPop(state);
      return;
    }

    case "REFERRAL": {
      const h = head(state);
      if (!h || h.kind !== "referral") return;
      if (a.accept) {
        const holding = makeHolding(h.card, "manage", "STR", `h${state.nextId++}`);
        p.holdings.push(holding);
        notable(p, `Owner referral landed ${h.card.name} for free`, 5_000);
        log(state, p.id, `${p.name} took on ${h.card.name} via owner referral — free onboarding`, "good");
      } else {
        log(state, p.id, `${p.name} declined a referred owner`, "neutral");
      }
      state.pendingQueue.shift();
      afterPop(state);
      return;
    }

    case "HIRE": {
      const h = head(state);
      if (!h || h.kind !== "hiring") return;
      if (p.staff.includes(a.staff)) return;
      p.staff.push(a.staff);
      log(state, p.id, `${p.name} hired a ${labelStaff(a.staff)}`, "money");
      return;
    }

    case "FIRE": {
      if (!p.staff.includes(a.staff)) return;
      p.staff = p.staff.filter((s) => s !== a.staff);
      log(state, p.id, `${p.name} let the ${labelStaff(a.staff)} go`, "neutral");
      return;
    }

    case "LOAN": {
      const h = head(state);
      const inFinance = h?.kind === "finance";
      const inEmergency = h?.kind === "emergency";
      if (a.kind === "bank" && !inFinance) return;
      if (a.kind === "bridge" && !inFinance && !inEmergency) return;
      const amount = Math.min(a.amount, creditLeft(p));
      if (amount < 5000) return;
      const rate = a.kind === "bank" ? BANK_RATE : BRIDGE_RATE;
      p.loans.push({ id: `l${state.nextId++}`, kind: a.kind, principal: amount, ratePm: rate });
      p.cash += amount;
      if (a.kind === "bridge") {
        p.stats.bridgeLoans += 1;
        notable(p, `Took a bridge loan at 2.5%/month`, -Math.round(amount * 0.08));
      }
      p.stats.peakDebt = Math.max(p.stats.peakDebt, totalLoanDebt(p));
      log(
        state,
        p.id,
        `${p.name} took a £${Math.round(amount / 1000)}k ${a.kind} loan`,
        a.kind === "bridge" ? "bad" : "money",
      );
      return;
    }

    case "REPAY": {
      const loan = p.loans.find((l) => l.id === a.loanId);
      if (!loan) return;
      const amount = Math.min(loan.principal, a.amount, p.cash);
      if (amount <= 0) return;
      loan.principal -= amount;
      p.cash -= amount;
      if (loan.principal <= 0) p.loans = p.loans.filter((l) => l.id !== loan.id);
      log(state, p.id, `${p.name} repaid £${Math.round(amount / 1000)}k of debt`, "good");
      return;
    }

    case "REFI": {
      const h = head(state);
      if (h?.kind !== "finance") return;
      const holding = p.holdings.find((x) => x.id === a.holdingId);
      if (!holding || holding.deal !== "buy") return;
      const newMortgage = Math.round(holding.value * REFI_LTV);
      if (newMortgage <= holding.mortgage) return;
      const released = newMortgage - holding.mortgage;
      const fee = Math.round(released * 0.01);
      holding.mortgage = newMortgage;
      p.cash += released - fee;
      log(state, p.id, `${p.name} refinanced ${holding.def.name}, releasing £${Math.round((released - fee) / 1000)}k`, "money");
      return;
    }

    case "INVESTOR": {
      const h = head(state);
      if (h?.kind !== "finance" || p.investorTaken) return;
      p.investorTaken = true;
      p.cash += INVESTOR_CASH;
      notable(p, "Sold 12% of the final score to an investor", -20_000);
      log(state, p.id, `${p.name} took £60k investor cash for 12% of the final score`, "money");
      return;
    }

    case "UPGRADE_FURNISH": {
      const h = head(state);
      if (h?.kind !== "upgrade") return;
      const holding = p.holdings.find((x) => x.id === a.holdingId);
      if (!holding || p.cash < 4000 || holding.furnish >= 1.3) return;
      p.cash -= 4000;
      holding.furnish = Math.min(1.3, Math.round((holding.furnish + 0.12) * 100) / 100);
      holding.review = clamp(holding.review + 0.1, 3, 5);
      if (holding.deal === "buy") holding.value = Math.round(holding.value * 1.02);
      log(state, p.id, `${p.name} refreshed the furnishing at ${holding.def.name}`, "money");
      return;
    }

    case "UPGRADE_PRICING": {
      const h = head(state);
      if (h?.kind !== "upgrade") return;
      const holding = p.holdings.find((x) => x.id === a.holdingId);
      if (!holding || holding.pricingTools || p.cash < 2500) return;
      p.cash -= 2500;
      holding.pricingTools = true;
      log(state, p.id, `${p.name} added pro photos & dynamic pricing to ${holding.def.name}`, "money");
      return;
    }

    case "UPGRADE_COMPLIANCE": {
      const h = head(state);
      if (h?.kind !== "upgrade") return;
      if (p.cityCompliance.includes(a.cityId)) return;
      const city = cityById(a.cityId);
      const cost = 3000 + city.regRisk * 80;
      if (p.cash < cost) return;
      p.cash -= cost;
      p.cityCompliance.push(a.cityId);
      log(state, p.id, `${p.name} bought full ${city.name} compliance (£${Math.round(cost / 1000)}k)`, "good");
      return;
    }

    case "CONVERT": {
      const holding = p.holdings.find((x) => x.id === a.holdingId);
      if (!holding || holding.strategy === a.strategy) return;
      p.cash -= CONVERT_COST; // allowed while negative — converting can stop the bleed
      holding.strategy = a.strategy;
      holding.suspendedMonths = 0;
      log(state, p.id, `${p.name} switched ${holding.def.name} to ${a.strategy}`, "neutral");
      return;
    }

    case "SELL": {
      const holding = p.holdings.find((x) => x.id === a.holdingId);
      if (!holding) return;
      if (holding.deal === "buy") {
        const gross = Math.round(holding.value * (a.fire ? SELL_FIRE : SELL_NORMAL));
        const proceeds = gross - holding.mortgage;
        p.cash += proceeds;
        p.stats.propertiesSold += 1;
        if (gross > holding.def.price * 1.03)
          notable(p, `Sold ${holding.def.name} at a profit`, gross - holding.def.price);
        log(state, p.id, `${p.name} sold ${holding.def.name} for £${Math.round(gross / 1000)}k`, "money");
      } else if (holding.deal === "lease") {
        p.cash -= holding.def.leaseMonthly;
        log(state, p.id, `${p.name} exited the lease on ${holding.def.name} (1 month penalty)`, "neutral");
      } else {
        p.trust = clamp(p.trust - 5, 1, 100);
        log(state, p.id, `${p.name} handed ${holding.def.name} back to its owner`, "neutral");
      }
      p.holdings = p.holdings.filter((x) => x.id !== holding.id);
      return;
    }

    case "DELAY_PAYOUT": {
      const h = head(state);
      if (h?.kind !== "emergency") return;
      const owed = p.lastPnl?.ownerPayouts ?? 0;
      if (owed <= 0 || p.owedOwners > 0) return;
      p.cash += owed;
      p.owedOwners = owed;
      p.trust = clamp(p.trust - 20, 1, 100);
      notable(p, "Delayed owner payouts to stay afloat", -10_000);
      log(state, p.id, `${p.name} delayed owner payouts — trust takes a beating`, "bad");
      return;
    }

    case "DECLARE_BANKRUPTCY": {
      bankruptPlayer(state, p);
      if (!state.over) {
        state.pendingQueue = [];
        dispatch(state, { t: "END_TURN" });
      }
      return;
    }

    case "EMERGENCY_DONE": {
      const h = head(state);
      if (h?.kind !== "emergency") return;
      if (p.cash >= 0) {
        state.pendingQueue.shift();
        log(state, p.id, `${p.name} clawed back above zero. Close one.`, "good");
        notable(p, "Survived a cash crisis", 4_000);
      } else if (p.cash >= BANKRUPT_FLOOR) {
        p.rep = clamp(p.rep - 5, 1, 100);
        p.trust = clamp(p.trust - 5, 1, 100);
        state.pendingQueue.shift();
        log(state, p.id, `${p.name} limp${p.isHuman ? "" : "s"} on in the red. Suppliers are muttering.`, "bad");
      } else {
        bankruptPlayer(state, p);
        if (!state.over) dispatch(state, { t: "END_TURN" });
        return;
      }
      afterPop(state);
      return;
    }

    case "CLOSE_SHOP": {
      const h = head(state);
      if (!h || (h.kind !== "hiring" && h.kind !== "finance" && h.kind !== "upgrade")) return;
      state.pendingQueue.shift();
      afterPop(state);
      return;
    }

    case "END_TURN": {
      if (state.over) return;
      if (state.pendingQueue.length) return;
      p.turnsDone += 1;
      state.turnCount += 1;
      state.emergencyHandled = false;
      state.lastRoll = null;
      state.lastPath = [];

      // tick shared city mods once per full round
      if (state.turnCount % state.players.length === 0) {
        for (const cityId of Object.keys(state.market.cityMods)) {
          state.market.cityMods[cityId] = state.market.cityMods[cityId]
            .map((m) => ({ ...m, monthsLeft: m.monthsLeft - 1 }))
            .filter((m) => m.monthsLeft > 0);
        }
      }
      const solvent = state.players.filter((x) => !x.bankrupt);
      if (solvent.length <= 1) return endGame(state);
      if (solvent.every((x) => x.turnsDone >= state.maxTurns)) return endGame(state);

      // advance to next solvent player
      let next = state.current;
      for (let i = 0; i < state.players.length; i++) {
        next = (next + 1) % state.players.length;
        if (!state.players[next].bankrupt) break;
      }
      state.current = next;
      state.phase = "awaitRoll";
      return;
    }
  }
}

function afterPop(state: GameState) {
  const p = cur(state);
  if (!state.pendingQueue.length && p.cash < 0 && !state.emergencyHandled) {
    state.pendingQueue.push({ kind: "emergency" });
    state.emergencyHandled = true;
    p.stats.emergencies += 1;
    log(state, p.id, `${p.name} ${p.isHuman ? "are" : "is"} below zero — emergency measures`, "bad");
  }
  if (!state.pendingQueue.length && p.cash < BANKRUPT_FLOOR) {
    bankruptPlayer(state, p);
  }
}

function labelStaff(id: StaffId): string {
  const names: Record<StaffId, string> = {
    guestOps: "guest ops assistant",
    cleaners: "cleaner network",
    maintenance: "maintenance coordinator",
    revenue: "revenue manager",
    ownerSuccess: "owner success manager",
    aiOps: "AI ops system",
  };
  return names[id];
}
