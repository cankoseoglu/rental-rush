// ---------------------------------------------------------------------------
// V3 reducer: winner-take-all. Months run until one operator remains solvent.
// Bankruptcy eliminates a player and sends their assets to distressed auction.
// `current` tracks whose INPUT the game waits on (auctions move it around);
// `turnOwner` tracks whose board-turn it is.
// ---------------------------------------------------------------------------

import type {
  Asset,
  AuctionPending,
  FurnishType,
  GameMode,
  GameState,
  LoanKind,
  OpModel,
  PendingAction,
  PlayerState,
  PnL,
  PnLLine,
  StaffId,
} from "../types";
import {
  APPRECIATION,
  BANK_RATE,
  BANKRUPT_FLOOR,
  BANKRUPT_FLOOR_LATE,
  BASE_MORTGAGE_RATE,
  BRIDGE_RATE,
  CREDIT_BASE,
  FURNISH_SPECS,
  marketPhase,
  MONTH_NAMES,
  REFI_LTV,
  RENOVATE_COST_PER_UNIT,
  SELL_FIRE,
  SELL_NORMAL,
  START_CASH,
  START_LANDING_BONUS,
  START_REP,
  START_TRUST,
  SWITCH_COST_HOTEL,
  SWITCH_COST_PER_UNIT,
} from "../types";
import { chance, clamp, hashSeed, makeRng, rint, pick } from "../rng";
import { generateAreas, TILES, TILE_COUNT } from "../data/areas";
import { cityById, seasonLabel } from "../data/cities";
import { drawMarketCard, phasePressure } from "../data/marketCycle";
import { hasStaff, opsCapacity, staffCost } from "../data/staff";
import { assetLabel, drawEvent, eventById, type EventCtx } from "../data/events";
import {
  acquisitionCosts,
  areaById,
  isUnlicensed,
  licenceCost,
  licenceSuccessProb,
  loanService,
  makeAsset,
  manageCapReached,
  overloadPenaltyFor,
  playerLoad,
  recomputeControl,
  simulateAssetMonth,
  stayFeeFor,
  totalLoanDebt,
  type AcquisitionSpec,
} from "./sim";
import {
  advanceAuction,
  buildingLot,
  distressedLots,
  mandateLot,
  minNextBid,
  permitLot,
  resolveAuction,
  startAuction,
  unitLot,
} from "./auction";
import { computeResults } from "./score";

export type Action =
  | { t: "ROLL" }
  | { t: "ACK" }
  | { t: "EVENT_CHOICE"; choiceId: string }
  | { t: "ACQUIRE"; spec: AcquisitionSpec }
  | { t: "APPLY_LICENCE"; assetId: string }
  | { t: "SWITCH_MODEL"; assetId: string; model: OpModel }
  | { t: "RENOVATE"; assetId: string }
  | { t: "SELL_ASSET"; assetId: string; fire?: boolean }
  | { t: "AUCTION_MY_ASSET"; assetId: string }
  | { t: "CLOSE_AREA" }
  | { t: "REFERRAL"; accept: boolean }
  | { t: "AUCTION_BID"; amount: number }
  | { t: "AUCTION_PASS" }
  | { t: "LOT_CONFIG"; model: OpModel; furnish: FurnishType; withLicence: boolean }
  | { t: "HIRE"; staff: StaffId }
  | { t: "FIRE"; staff: StaffId }
  | { t: "LOAN"; kind: LoanKind; amount: number }
  | { t: "REPAY"; loanId: string; amount: number }
  | { t: "REFI"; assetId: string }
  | { t: "UPGRADE_COMPLIANCE"; cityId: string }
  | { t: "DELAY_PAYOUT" }
  | { t: "DECLARE_BANKRUPTCY" }
  | { t: "EMERGENCY_DONE" }
  | { t: "END_TURN" };

// --- creation ----------------------------------------------------------------

export interface NewGameOpts {
  mode: GameMode;
  seedText: string;
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
    assets: [],
    loans: [],
    mods: [],
    cityCompliance: [],
    permits: [],
    monthsDone: 0,
    bankrupt: false,
    bankruptTurn: null,
    bankruptReason: null,
    owedOwners: 0,
    accruedFines: 0,
    accruedRefunds: 0,
    accruedProjects: 0,
    accruedFeesPaid: 0,
    accruedFeesEarned: 0,
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
      stayFeesPaid: 0,
      stayFeesEarned: 0,
      feesPaidTo: {},
      bankruptciesCaused: 0,
      auctionsWon: 0,
      auctionSpend: 0,
      biggestAuctionWin: null,
      peakDebt: 0,
      churnedOwners: 0,
      bridgeLoans: 0,
      assetsSold: 0,
      referrals: 0,
      licencesWon: 0,
      licencesRejected: 0,
      bestMonthNet: -Infinity,
      worstMonthNet: Infinity,
      notables: [],
    },
  };
}

export function createGame(opts: NewGameOpts): GameState {
  const seed = hashSeed(opts.seedText);
  const state: GameState = {
    v: 3,
    seed,
    rngState: seed,
    mode: opts.mode,
    dailyKey: opts.dailyKey ?? null,
    tiles: TILES,
    areas: [],
    buildingTaken: {},
    control: {},
    players: [newPlayer(0, true), newPlayer(1, false), newPlayer(2, false)],
    current: 0,
    turnOwner: 0,
    month: 0,
    moveOrder: [0, 1, 2],
    turnInMonth: 0,
    market: {
      ratePm: BASE_MORTGAGE_RATE,
      rateRises: 0,
      bridgeRatePm: BRIDGE_RATE,
      creditTightness: 1,
      insurancePerUnit: 0,
      crackdownMonths: 0,
      demandSpike: false,
      lastCard: null,
      globalMods: [],
      cityMods: {},
    },
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
  state.areas = generateAreas(rng);
  for (const a of state.areas) {
    state.buildingTaken[a.id] = null;
    state.control[a.id] = null;
  }
  log(state, -1, "October. £150k each, 16 neighbourhoods, two rivals. Last solvent operator wins.", "neutral");
  return state;
}

// --- helpers -------------------------------------------------------------------

export function log(
  state: GameState,
  playerId: number,
  text: string,
  tone: "good" | "bad" | "neutral" | "money" = "neutral",
) {
  state.log.push({ turn: state.month, playerId, text, tone });
  if (state.log.length > 120) state.log.splice(0, state.log.length - 120);
}

const cur = (state: GameState): PlayerState => state.players[state.current];
const head = (state: GameState): PendingAction | null => state.pendingQueue[0] ?? null;

function notable(p: PlayerState, label: string, value: number) {
  p.stats.notables.push({ label, value });
}

export function bankruptFloor(state: GameState): number {
  if (state.month >= 18) return -10_000; // deep endgame: no hiding in the red
  return marketPhase(state.month) === 2 ? BANKRUPT_FLOOR_LATE : BANKRUPT_FLOOR;
}

export function creditCapacity(state: GameState, p: PlayerState): number {
  const base = CREDIT_BASE + (p.rep >= 80 ? 75_000 : 0) - (p.rep < 40 ? 100_000 : 0);
  return Math.round(base * state.market.creditTightness);
}

export function creditLeft(state: GameState, p: PlayerState): number {
  return Math.max(0, creditCapacity(state, p) - totalLoanDebt(p));
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

const findAsset = (p: PlayerState, id: string): Asset | null =>
  p.assets.find((a) => a.id === id) ?? null;

function backOfficeAllowed(state: GameState): boolean {
  const h = head(state);
  return !h || h.kind === "area" || h.kind === "emergency";
}

function syncCurrentToHead(state: GameState) {
  const h = head(state);
  if (!h) return;
  let target: number | null = null;
  if (h.kind === "monthEnd" || h.kind === "referral" || h.kind === "lotConfig") target = h.playerId;
  if (h.kind === "auction") target = h.order[h.actorIdx];
  if (target !== null && state.current !== target) {
    state.current = target;
    state.emergencyHandled = false;
  }
}

// --- month end --------------------------------------------------------------------

function blendedTrust(p: PlayerState): number {
  const managed = p.assets.filter((a) => a.deal === "manage");
  if (!managed.length) return p.trust;
  return Math.round(managed.reduce((s, a) => s + a.ownerTrust, 0) / managed.length);
}

function runMonthEnd(state: GameState, p: PlayerState): { pnl: PnL; referral: boolean } {
  const rng = makeRng(state);
  const monthIdx = state.month % MONTH_NAMES.length;
  const monthName = MONTH_NAMES[monthIdx];
  const phase = marketPhase(state.month);
  const overloadPenalty = overloadPenaltyFor(p);
  const load = playerLoad(p);
  const cap = opsCapacity(p);
  const ownerSqueeze = state.market.globalMods.some((m) => m.key === "mc_owner");

  let revenue = 0;
  let ownerPayouts = 0;
  let lease = 0;
  let mortgageSvc = 0;
  let maintenance = 0;
  let projectsNow = 0;
  let monthRefunds = 0;
  let crackdownFines = 0;
  let repDelta = 0;
  const notes: string[] = [];
  const lines: PnLLine[] = [];
  const removals: string[] = [];

  for (const a of p.assets) {
    const m = simulateAssetMonth(a, p, state, monthIdx, rng, overloadPenalty);
    revenue += m.gross;
    ownerPayouts += m.ownerPayout;
    lease += m.leasePay;
    mortgageSvc += m.mortgagePay;
    maintenance += m.maint + m.varCost + m.opsShare + m.overhead;
    a.lastNet = m.playerNet;
    a.cumNet += m.playerNet;
    a.lastOcc = m.occ;

    if (a.deal === "buy") a.value = Math.round(a.value * APPRECIATION);

    if (a.model === "STR" || a.model === "HOTEL") p.stats.strRevenue += m.gross;
    else if (a.model === "MTR") p.stats.mtrRevenue += m.gross;
    else p.stats.ltrRevenue += m.gross;
    if (a.deal === "manage") p.stats.mgmtFees += m.fee;

    // regulation crackdown: unlicensed nightly inventory gets swept
    if (
      state.market.crackdownMonths > 0 &&
      a.status === "live" &&
      (a.model === "STR" || a.model === "HOTEL") &&
      isUnlicensed(state, p, a)
    ) {
      const fine = rint(rng, 2_000, 6_000);
      crackdownFines += fine;
      p.stats.finesTotal += fine;
      p.stats.finesCount += 1;
      notes.push(`Crackdown fine at ${assetLabel(state, a)}: −£${fine.toLocaleString("en-GB")}.`);
    }

    if (a.status === "live") {
      if ((a.model === "STR" || a.model === "HOTEL") && m.occ < 0.45)
        a.rating = clamp(a.rating - 0.05, 3, a.ratingCap);
      const target = Math.min(a.ratingCap, a.furnish === "slow" ? 4.6 : 4.45);
      a.rating = clamp(a.rating + (target - a.rating) * 0.06, 3, a.ratingCap);
      // consolidation phase: weak reputations bleed occupancy via rating decay
      if (phase === 2 && p.rep < 55) a.rating = clamp(a.rating - 0.04, 3, a.ratingCap);
      if (a.deal === "manage") {
        const area = areaById(state, a.areaId);
        const expected = area.ltrRent * 0.85 * a.units * (ownerSqueeze ? 1.12 : 1) * (phase === 2 ? 1.08 : 1);
        const ratio = m.ownerPayout / Math.max(1, expected);
        let d = ratio >= 1.25 ? 3 : ratio >= 0.85 ? 1 : ratio >= 0.55 ? -3 : -6;
        if (hasStaff(p, "ownerSuccess")) d = Math.max(d, -2) + 1;
        a.ownerTrust = clamp(Math.round(a.ownerTrust + d), 1, 100);
      }
    }

    // pipelines
    if (a.status === "suspended") {
      a.suspendedMonths -= 1;
      notes.push(`${assetLabel(state, a)} sat suspended.`);
      if (a.suspendedMonths <= 0) a.status = "live";
    } else if (a.status === "prep") {
      a.monthsToLive -= 1;
      a.status = "furnishing";
      notes.push(`${assetLabel(state, a)}: contracts done, furnishing begins.`);
    } else if (a.status === "furnishing") {
      a.monthsToLive -= 1;
      if (a.kind === "building") {
        const f = FURNISH_SPECS[a.furnish];
        const total = Math.round(f.costPerUnit(areaById(state, a.areaId).level) * a.units * 0.85);
        const instalment = Math.round(total / f.months("building"));
        projectsNow += instalment;
        notes.push(`${assetLabel(state, a)}: fit-out instalment −£${instalment.toLocaleString("en-GB")}.`);
      }
      if (a.monthsToLive <= 0) {
        if (a.model === "HOTEL" && a.licence !== "approved" && !p.permits.includes(a.areaId)) {
          a.status = "awaitingLicence";
          notes.push(`${assetLabel(state, a)} is furnished but waiting on its hotel licence.`);
        } else {
          a.status = "live";
          notes.push(`${assetLabel(state, a)} went LIVE (${a.units} unit${a.units > 1 ? "s" : ""} · ${a.model}).`);
          log(state, p.id, `${p.name}: ${assetLabel(state, a)} went live as ${a.model}`, "good");
        }
      }
    } else if (
      a.status === "awaitingLicence" &&
      (a.licence === "approved" || p.permits.includes(a.areaId))
    ) {
      a.status = "live";
      notes.push(`${assetLabel(state, a)} opened its doors — licence in hand.`);
    }

    if (a.licence === "applied") {
      a.licenceMonths -= 1;
      projectsNow += 250;
      if (a.licenceMonths <= 0) {
        if (chance(rng, a.licenceProb)) {
          a.licence = "approved";
          p.stats.licencesWon += 1;
          notes.push(`Licence APPROVED for ${assetLabel(state, a)}.`);
          log(state, p.id, `${p.name} won the licence for ${assetLabel(state, a)}`, "good");
        } else {
          a.licence = "rejected";
          p.stats.licencesRejected += 1;
          notes.push(`Licence REJECTED for ${assetLabel(state, a)}. Reapply, convert, or exit.`);
          log(state, p.id, `${p.name}'s licence for ${assetLabel(state, a)} was rejected`, "bad");
          notable(p, `Licence rejected at ${assetLabel(state, a)}`, -5_000);
        }
      }
    }

    a.mods = a.mods.map((m2) => ({ ...m2, monthsLeft: m2.monthsLeft - 1 })).filter((m2) => m2.monthsLeft > 0);

    lines.push({
      name: assetLabel(state, a),
      model: a.model,
      deal: a.deal,
      status: a.status,
      gross: m.gross,
      net: m.playerNet,
      occ: m.occ,
      units: a.units,
    });

    const churnAt = 30 + (phase === 2 ? 5 : 0);
    if (a.deal === "manage" && a.ownerTrust < churnAt) {
      removals.push(a.id);
      p.stats.churnedOwners += 1;
      notes.push(`The owner of ${assetLabel(state, a)} pulled out. Word travels.`);
      notable(p, `Lost ${assetLabel(state, a)} — owner walked`, -10_000);
      log(state, p.id, `${p.name} lost ${assetLabel(state, a)} — the owner churned`, "bad");
    }
  }
  if (removals.length) p.assets = p.assets.filter((a) => !removals.includes(a.id));

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
    for (let i = 0; i < Math.ceil(over / 2); i++) {
      if (!chance(rng, 0.45)) continue;
      if (chance(rng, 0.5)) {
        const r = rint(rng, 300, 900);
        monthRefunds += r;
        p.stats.refundsTotal += r;
        notes.push(`Refunded £${r} after a dropped ball.`);
      } else {
        repDelta -= 3;
        const live = p.assets.filter((a) => a.status === "live");
        const a = live[Math.floor(rng() * live.length)];
        if (a) {
          a.rating = clamp(a.rating - 0.15, 3, a.ratingCap);
          if (a.deal === "manage") a.ownerTrust = clamp(a.ownerTrust - 3, 1, 100);
        }
        notes.push("A bad review landed — guests noticed the chaos.");
      }
    }
  }

  const live = p.assets.filter((a) => a.status === "live");
  if (live.length > 0) {
    const avg = live.reduce((s, a) => s + a.rating, 0) / live.length;
    repDelta += clamp(Math.round((avg - 4.35) * 6), -3, 4);
  }

  const fines = p.accruedFines + crackdownFines;
  const refunds = p.accruedRefunds + monthRefunds;
  const projects = p.accruedProjects + projectsNow;
  const feesPaid = p.accruedFeesPaid;
  const feesEarned = p.accruedFeesEarned;
  const debtService = Math.round(mortgageSvc + loanSvc);

  const net = Math.round(
    revenue + feesEarned - ownerPayouts - lease - debtService - staffC -
      maintenance - projects - refunds - fines - feesPaid,
  );

  const cashDelta =
    net + p.accruedFines + p.accruedRefunds + p.accruedProjects + feesPaid - feesEarned;
  p.cash = Math.round(p.cash + cashDelta);
  p.accruedFines = 0;
  p.accruedRefunds = 0;
  p.accruedProjects = 0;
  p.accruedFeesPaid = 0;
  p.accruedFeesEarned = 0;

  const prevTrust = p.trust;
  p.trust = p.assets.some((a) => a.deal === "manage")
    ? blendedTrust(p)
    : clamp(p.trust + Math.sign(70 - p.trust), 1, 100);
  const trustDelta = p.trust - prevTrust;

  p.rep = clamp(Math.round(p.rep + repDelta), 1, 100);

  const managed = p.assets.filter((a) => a.deal === "manage");
  let referral = false;
  if (p.trust >= 80 && managed.length > 0 && chance(rng, 0.25)) {
    referral = true;
    p.stats.referrals += 1;
  }

  p.mods = p.mods.map((m) => ({ ...m, monthsLeft: m.monthsLeft - 1 })).filter((m) => m.monthsLeft > 0);

  p.monthsDone += 1;
  p.stats.bestMonthNet = Math.max(p.stats.bestMonthNet, net);
  p.stats.worstMonthNet = Math.min(p.stats.worstMonthNet, net);
  if (net >= 10_000) notable(p, `${monthName}: a +£${Math.round(net / 1000)}k month`, net);
  if (net <= -8_000) notable(p, `${monthName}: bled −£${Math.round(-net / 1000)}k in a month`, net);
  p.cashHistory.push(p.cash);
  if (p.cashHistory.length > 40) p.cashHistory.shift();

  if (!p.isHuman) {
    const amount = `£${Math.abs(net).toLocaleString("en-GB")}`;
    log(state, p.id, `${p.name}'s ${monthName}: ${net >= 0 ? "+" : "−"}${amount} net`, net >= 0 ? "money" : "bad");
  }

  const mc = state.market.lastCard;
  const pnl: PnL = {
    month: monthName,
    seasonLabel: seasonLabel(monthIdx),
    marketCard: mc ? `${mc.emoji} ${mc.title} — ${mc.blurb}` : null,
    revenue: Math.round(revenue),
    ownerPayouts: Math.round(ownerPayouts),
    lease: Math.round(lease),
    debtService,
    staffCost: staffC,
    maintenance: Math.round(maintenance),
    projects: Math.round(projects),
    refunds: Math.round(refunds),
    fines: Math.round(fines),
    feesPaid: Math.round(feesPaid),
    feesEarned: Math.round(feesEarned),
    net,
    cashAfter: p.cash,
    repDelta,
    trustDelta,
    notes,
    lines,
  };
  p.lastPnl = pnl;
  return { pnl, referral };
}

function monthEndAll(state: GameState) {
  const queue: PendingAction[] = [];
  for (const p of state.players) {
    if (p.bankrupt) continue;
    const { pnl, referral } = runMonthEnd(state, p);
    queue.push({ kind: "monthEnd", playerId: p.id, pnl });
    if (referral) {
      const rng = makeRng(state);
      const presence = state.areas.filter((ar) => p.assets.some((a) => a.areaId === ar.id));
      const pool = presence.length ? presence : state.areas;
      const area = pool[Math.floor(rng() * pool.length)];
      queue.push({ kind: "referral", playerId: p.id, areaId: area.id });
    }
  }
  recomputeControl(state);
  state.month += 1;

  // turn the market-cycle wheel for the NEW month
  const rng = makeRng(state);
  state.market.demandSpike = false;
  if (state.market.crackdownMonths > 0) state.market.crackdownMonths -= 1;
  state.market.globalMods = state.market.globalMods
    .map((m) => ({ ...m, monthsLeft: m.monthsLeft - 1 }))
    .filter((m) => m.monthsLeft > 0);
  const { card, auction } = drawMarketCard(state, rng);
  phasePressure(state);
  log(state, -1, `Market: ${card.emoji} ${card.title} — ${card.blurb}`, "neutral");

  state.pendingQueue = queue;
  state.emergencyHandled = false;

  if (auction === "permit") {
    const candidates = state.areas.filter((a) => a.regRisk >= 60);
    const area = candidates[Math.floor(rng() * candidates.length)];
    startAuction(state, permitLot(state, area));
    log(state, -1, `City Hall releases a nightly-stay permit for ${area.name} — sealed-room auction.`, "neutral");
  } else if (auction === "distressed") {
    const area = state.areas[Math.floor(rng() * state.areas.length)];
    const spec: AcquisitionSpec = { kind: "rent", model: "STR", furnish: "fast", withLicence: false };
    const costs = acquisitionCosts(area, spec, state.players[0]);
    const asset = makeAsset(state, area, spec, costs, -1, `a${state.nextId++}`);
    asset.status = "live";
    asset.monthsToLive = 0;
    asset.rating = 4.0;
    startAuction(state, {
      id: `lot${state.nextId++}`,
      type: "distressed",
      areaId: area.id,
      label: `DISTRESSED · ${area.name} unit · lender sale`,
      desc: "A struggling operator's lender quietly brings a furnished, trading unit to market. Sold as seen — battered reviews, lease transfers.",
      units: 1,
      reserve: Math.round((area.ltrRent * 1.5) / 500) * 500,
      asset,
      flaws: ["battered reviews", `£${asset.monthlyFixed.toLocaleString("en-GB")}/mo lease transfers`],
    });
  }
  syncCurrentToHead(state);
}

/** Called when the month-end queue is fully resolved. */
function finishMonth(state: GameState) {
  const solvent = state.players.filter((x) => !x.bankrupt);
  if (solvent.length <= 1) return endGame(state);
  state.moveOrder = solvent.map((p) => p.id);
  state.turnInMonth = 0;
  state.current = state.moveOrder[0];
  state.turnOwner = state.current;
  state.phase = "awaitRoll";
  state.emergencyHandled = false;
  const phase = marketPhase(state.month);
  log(
    state,
    -1,
    `${MONTH_NAMES[state.month % MONTH_NAMES.length]} begins.${phase === 2 ? " Consolidation: the market wants blood." : ""}`,
    "neutral",
  );
}

// --- bankruptcy & elimination -------------------------------------------------------

function bankruptcyReason(state: GameState, p: PlayerState): string {
  const s = p.stats;
  const causes: string[] = [];
  const buildings = p.assets.filter((a) => a.kind === "building").length;
  const pipeline = p.assets.filter((a) => a.status !== "live").length;
  if (buildings > 0 && pipeline > 0) causes.push("building cash burn before going live");
  else if (p.assets.filter((a) => a.model === "STR" || a.model === "HOTEL").length >= 3)
    causes.push("over-expanded into nightly inventory");
  if (s.licencesRejected > 0) causes.push("could not survive the licence delays");
  if (s.bridgeLoans > 0) causes.push("bridge-loan interest compounding");
  if (p.owedOwners > 0 || s.churnedOwners > 0) causes.push("missed owner payouts");
  if (s.finesTotal >= 6_000) causes.push("regulation fines");
  if (s.stayFeesPaid >= 8_000) causes.push("bled stay fees on rivals' turf");
  if (!causes.length) causes.push("ran out of road in a tightening market");
  return causes.slice(0, 3).join(", ");
}

export function bankruptPlayer(state: GameState, p: PlayerState) {
  if (p.bankrupt) return;
  const monthNo = state.month + 1;
  const reason = bankruptcyReason(state, p);
  p.bankruptReason = `${p.name} went bankrupt in Month ${monthNo}: ${reason}.`;

  // who bled them the most? credit the kill
  let killer: number | null = null;
  let most = 0;
  for (const [pid, amt] of Object.entries(p.stats.feesPaidTo)) {
    if (amt > most) {
      most = amt;
      killer = Number(pid);
    }
  }
  if (killer !== null && most >= 2_000 && !state.players[killer].bankrupt) {
    state.players[killer].stats.bankruptciesCaused += 1;
  }

  // seize assets for distressed auction BEFORE wiping the player
  const lots = distressedLots(state, p);

  p.bankrupt = true;
  p.bankruptTurn = monthNo;
  p.assets = [];
  p.loans = [];
  p.staff = [];
  for (const areaId of Object.keys(state.buildingTaken)) {
    if (state.buildingTaken[areaId] === p.id) state.buildingTaken[areaId] = null;
  }
  recomputeControl(state);

  log(state, p.id, `💀 ${p.bankruptReason} ${p.isHuman ? "Your" : "Their"} assets go to distressed auction.`, "bad");
  notable(p, "Went bankrupt", -150_000);

  // strip the dead player's pendings, keep everyone else's
  state.pendingQueue = state.pendingQueue.filter(
    (q) =>
      (q.kind === "monthEnd" && q.playerId !== p.id) ||
      (q.kind === "referral" && q.playerId !== p.id) ||
      (q.kind === "lotConfig" && q.playerId !== p.id) ||
      q.kind === "auction",
  );
  // remove them from any live auction
  for (const q of state.pendingQueue) {
    if (q.kind === "auction") {
      q.order = q.order.filter((id) => id !== p.id);
      if (q.highBidder === p.id) {
        q.highBidder = null;
        q.highBid = 0;
      }
    }
  }
  state.moveOrder = state.moveOrder.filter((id) => id !== p.id);

  const solvent = state.players.filter((x) => !x.bankrupt);
  if (solvent.length <= 1) {
    endGame(state);
    return;
  }
  // the carcass goes under the hammer (cap the parade at 6 lots)
  for (const lot of lots.slice(0, 6)) startAuction(state, lot, p.id);
  syncCurrentToHead(state);
}

function endGame(state: GameState) {
  if (state.over) return;
  state.over = true;
  state.phase = "over";
  state.pendingQueue = [];
  recomputeControl(state);
  const solvent = state.players.filter((x) => !x.bankrupt);
  const winner =
    solvent[0] ??
    [...state.players].sort((a, b) => (b.bankruptTurn ?? 0) - (a.bankruptTurn ?? 0))[0];
  state.winnerId = winner.id;
  state.results = computeResults(state);
  log(state, -1, `${winner.name} ${winner.isHuman ? "are" : "is"} the last solvent operator standing.`, "good");
}

/** When the human is eliminated, the remaining bots play out the duel. */
export function fastForwardToEnd(
  state: GameState,
  botAction: (s: GameState) => Action[],
): void {
  let guard = 0;
  while (!state.over && guard++ < 20_000) {
    if (state.phase === "awaitRoll") {
      dispatch(state, { t: "ROLL" });
      continue;
    }
    if (!state.pendingQueue.length) {
      dispatch(state, { t: "END_TURN" });
      continue;
    }
    for (const a of botAction(state)) {
      dispatch(state, a);
      if (state.over) break;
    }
  }
  if (!state.over) endGame(state);
}

// --- dispatch -------------------------------------------------------------------------

export function dispatch(state: GameState, a: Action): void {
  if (state.over) return;
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
      const dest = path[path.length - 1];
      p.pos = dest;
      state.lastRoll = [d1, d2];
      state.lastPath = path;
      state.phase = "action";
      state.turnOwner = p.id;

      const queue: PendingAction[] = [];
      const tile = state.tiles[dest];

      if (tile.kind === "start") {
        p.cash += START_LANDING_BONUS;
        log(state, p.id, `${p.name} land${p.isHuman ? "" : "s"} on Month End — +£3k clean-books bonus`, "money");
      } else if (tile.kind === "area" && tile.areaId) {
        const fee = stayFeeFor(state, tile.areaId, p.id);
        if (fee > 0) {
          const controller = state.players[state.control[tile.areaId]!];
          p.cash -= fee;
          p.accruedFeesPaid += fee;
          p.stats.stayFeesPaid += fee;
          p.stats.feesPaidTo[controller.id] = (p.stats.feesPaidTo[controller.id] ?? 0) + fee;
          controller.cash += fee;
          controller.accruedFeesEarned += fee;
          controller.stats.stayFeesEarned += fee;
          log(
            state,
            p.id,
            `${p.name} pa${p.isHuman ? "y" : "ys"} ${controller.name} a £${fee.toLocaleString("en-GB")} stay fee in ${areaById(state, tile.areaId).name}`,
            "money",
          );
        }
        queue.push({ kind: "area", areaId: tile.areaId, acted: false });
      } else if (tile.kind === "auction") {
        state.pendingQueue = [];
        spawnOpportunityAuction(state);
        if (p.cash < 0 && !state.emergencyHandled) {
          state.pendingQueue.push({ kind: "emergency" });
          state.emergencyHandled = true;
          p.stats.emergencies += 1;
        }
        syncCurrentToHead(state);
        return;
      } else if (tile.eventCategory) {
        queue.push(drawEvent(ctxFor(state, p), tile.eventCategory));
      }

      if (p.cash < 0 && !state.emergencyHandled) {
        queue.push({ kind: "emergency" });
        state.emergencyHandled = true;
        p.stats.emergencies += 1;
        log(state, p.id, `${p.name} ${p.isHuman ? "are" : "is"} below zero — insolvency check`, "bad");
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
          const rng = makeRng(state);
          const presence = state.areas.filter((ar) => p.assets.some((x) => x.areaId === ar.id));
          const pool = presence.length ? presence : state.areas;
          const area = pool[Math.floor(rng() * pool.length)];
          state.pendingQueue.unshift({ kind: "referral", playerId: p.id, areaId: area.id });
          p.stats.referrals += 1;
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
      state.pendingQueue[0] = { ...h, choices: [], effects };
      if (p.cash < 0 && !state.emergencyHandled) {
        state.pendingQueue.splice(1, 0, { kind: "emergency" });
        state.emergencyHandled = true;
        p.stats.emergencies += 1;
      }
      return;
    }

    case "ACQUIRE": {
      const h = head(state);
      if (!h || h.kind !== "area") return;
      const area = areaById(state, h.areaId);
      const spec = a.spec;
      if (spec.kind === "building" && state.buildingTaken[area.id] !== null) return;
      if (spec.kind === "manage" && manageCapReached(p, area.id)) return;
      if (spec.model === "HOTEL") {
        if (spec.kind !== "building") return;
        if (!(hasStaff(p, "guestOps") || hasStaff(p, "aiOps"))) return;
      }
      const costs = acquisitionCosts(area, spec, p, state);
      const needsBundledLicence =
        (spec.withLicence || spec.model === "HOTEL") && !p.permits.includes(area.id);
      const totalNeeded = costs.cashNow + (needsBundledLicence ? costs.licenceCost : 0);
      if (spec.model === "HOTEL" ? p.cash < totalNeeded : p.cash < costs.cashNow) return;
      p.cash -= costs.cashNow;
      const asset = makeAsset(state, area, spec, costs, p.id, `a${state.nextId++}`);
      p.assets.push(asset);
      if (spec.kind === "building") state.buildingTaken[area.id] = p.id;
      h.acted = true;

      if (needsBundledLicence) {
        const fee = costs.licenceCost;
        if (p.cash >= fee) {
          p.cash -= fee;
          p.accruedProjects += fee;
          asset.licence = "applied";
          asset.licenceMonths = 2 + (area.regRisk >= 60 ? 1 : 0) + (chance(makeRng(state), 0.35) ? 1 : 0);
          asset.licenceProb = licenceSuccessProb(area, spec.model, p);
        }
      } else if (p.permits.includes(area.id)) {
        asset.licence = "approved";
      }

      const verb =
        spec.kind === "buy" ? "bought a unit" :
        spec.kind === "rent" ? "rented a unit" :
        spec.kind === "manage" ? "signed an owner unit" :
        `leased the ${costs.units}-unit building`;
      log(state, p.id, `${p.name} ${verb} in ${area.name} → ${spec.model}`, "money");
      recomputeControl(state);
      return;
    }

    case "APPLY_LICENCE": {
      if (!backOfficeAllowed(state)) return;
      const asset = findAsset(p, a.assetId);
      if (!asset || asset.licence === "applied" || asset.licence === "approved") return;
      const area = areaById(state, asset.areaId);
      const reapplying = asset.licence === "rejected";
      const fee = Math.round(licenceCost(asset.units, area) * (reapplying ? 0.6 : 1));
      if (p.cash < fee) return;
      p.cash -= fee;
      p.accruedProjects += fee;
      asset.licence = "applied";
      asset.licenceAttempts += 1;
      asset.licenceMonths = 2 + (area.regRisk >= 60 ? 1 : 0) + (chance(makeRng(state), 0.35) ? 1 : 0);
      asset.licenceProb = clamp(
        licenceSuccessProb(area, asset.model, p) + (reapplying ? 0.12 : 0),
        0.3,
        0.97,
      );
      log(state, p.id, `${p.name} applied for a licence at ${assetLabel(state, asset)} (${asset.licenceMonths}mo)`, "neutral");
      return;
    }

    case "SWITCH_MODEL": {
      if (!backOfficeAllowed(state)) return;
      const asset = findAsset(p, a.assetId);
      if (!asset || asset.model === a.model) return;
      if (a.model === "HOTEL") {
        if (asset.kind !== "building") return;
        if (asset.licence !== "approved" && !p.permits.includes(asset.areaId)) return;
        if (!(hasStaff(p, "guestOps") || hasStaff(p, "aiOps"))) return;
      }
      const cost = (a.model === "HOTEL" ? SWITCH_COST_HOTEL : SWITCH_COST_PER_UNIT) * asset.units;
      p.cash -= cost;
      asset.model = a.model;
      if (asset.status === "suspended") {
        asset.status = "live";
        asset.suspendedMonths = 0;
      }
      if (asset.status === "awaitingLicence" && a.model !== "HOTEL") asset.status = "live";
      log(state, p.id, `${p.name} switched ${assetLabel(state, asset)} to ${a.model}`, "neutral");
      recomputeControl(state);
      return;
    }

    case "RENOVATE": {
      if (!backOfficeAllowed(state)) return;
      const asset = findAsset(p, a.assetId);
      if (!asset || asset.status !== "live") return;
      const cost = RENOVATE_COST_PER_UNIT * asset.units;
      if (p.cash < cost || asset.furnishQ >= 1.15) return;
      p.cash -= cost;
      p.accruedProjects += cost;
      asset.furnishQ = Math.min(1.15, Math.round((asset.furnishQ + 0.06) * 100) / 100);
      asset.ratingCap = Math.min(5, asset.ratingCap + 0.2);
      asset.rating = clamp(asset.rating + 0.15, 3, asset.ratingCap);
      asset.maintMult = Math.max(0.7, Math.round(asset.maintMult * 0.9 * 100) / 100);
      if (asset.deal === "manage") asset.ownerTrust = clamp(asset.ownerTrust + 5, 1, 100);
      if (asset.deal === "buy") asset.value = Math.round(asset.value * 1.02);
      log(state, p.id, `${p.name} renovated ${assetLabel(state, asset)}`, "money");
      recomputeControl(state);
      return;
    }

    case "SELL_ASSET": {
      if (!backOfficeAllowed(state)) return;
      const asset = findAsset(p, a.assetId);
      if (!asset) return;
      if (asset.deal === "buy") {
        const gross = Math.round(asset.value * (a.fire ? SELL_FIRE : SELL_NORMAL));
        const proceeds = gross - asset.mortgage;
        p.cash += proceeds;
        p.stats.assetsSold += 1;
        log(state, p.id, `${p.name} sold ${assetLabel(state, asset)} for £${Math.round(gross / 1000)}k`, "money");
      } else if (asset.deal === "lease") {
        p.cash -= asset.monthlyFixed;
        if (asset.kind === "building") state.buildingTaken[asset.areaId] = null;
        log(state, p.id, `${p.name} exited the lease on ${assetLabel(state, asset)} (1 month penalty)`, "neutral");
      } else {
        log(state, p.id, `${p.name} handed ${assetLabel(state, asset)} back to its owner`, "neutral");
      }
      p.assets = p.assets.filter((x) => x.id !== asset.id);
      recomputeControl(state);
      return;
    }

    case "AUCTION_MY_ASSET": {
      const h = head(state);
      if (!h || (h.kind !== "emergency" && h.kind !== "area")) return;
      const asset = findAsset(p, a.assetId);
      if (!asset) return;
      // the asset goes under the hammer; rivals bid, you keep the proceeds
      const [lot] = distressedLots(state, { ...p, assets: [asset] } as PlayerState);
      lot.label = lot.label.replace("DISTRESSED", "OFFERED");
      lot.desc = `${p.name} brings this to market mid-game. Proceeds go to the seller; unsold lots return to them.`;
      lot.sellerId = p.id;
      lot.distressedOf = undefined;
      p.assets = p.assets.filter((x) => x.id !== asset.id);
      if (asset.kind === "building") state.buildingTaken[asset.areaId] = null;
      recomputeControl(state);
      startAuction(state, lot, p.id);
      log(state, p.id, `${p.name} sent ${assetLabel(state, asset)} to auction`, "neutral");
      syncCurrentToHead(state);
      return;
    }

    case "CLOSE_AREA": {
      const h = head(state);
      if (!h || h.kind !== "area") return;
      state.pendingQueue.shift();
      // passing on a live market sometimes sends the opportunity to auction
      const rng = makeRng(state);
      if (!h.acted && state.month >= 1 && chance(rng, 0.3)) {
        const area = areaById(state, h.areaId);
        startAuction(state, unitLot(state, area));
        log(state, -1, `The ${area.name} opportunity ${p.isHuman ? "you" : p.name} passed on goes to open auction.`, "neutral");
      }
      afterPop(state);
      return;
    }

    case "REFERRAL": {
      const h = head(state);
      if (!h || h.kind !== "referral") return;
      if (a.accept) {
        const area = areaById(state, h.areaId);
        const model: OpModel = area.regRisk >= 60 ? "MTR" : "STR";
        const spec: AcquisitionSpec = { kind: "manage", model, furnish: "fast", withLicence: false };
        const costs = acquisitionCosts(area, spec, p, state);
        costs.cashNow = 0;
        const asset = makeAsset(state, area, spec, costs, p.id, `a${state.nextId++}`);
        asset.ownerTrust = 78;
        p.assets.push(asset);
        notable(p, `Owner referral landed a free unit in ${area.name}`, 5_000);
        log(state, p.id, `${p.name} took on a referred owner's unit in ${area.name} — free onboarding`, "good");
        recomputeControl(state);
      } else {
        log(state, p.id, `${p.name} declined a referred owner`, "neutral");
      }
      state.pendingQueue.shift();
      afterPop(state);
      return;
    }

    case "AUCTION_BID": {
      const h = head(state);
      if (!h || h.kind !== "auction") return;
      const actor = h.order[h.actorIdx];
      if (actor !== p.id || h.passed.includes(p.id)) return;
      const min = minNextBid(h);
      if (a.amount < min || p.cash < a.amount) {
        // invalid bid counts as a pass — keeps the room moving
        h.passed.push(p.id);
        h.feed.push(`${p.name} passes`);
      } else {
        h.highBid = a.amount;
        h.highBidder = p.id;
        h.feed.push(`${p.name} bids £${a.amount.toLocaleString("en-GB")}`);
      }
      stepAuction(state, h);
      return;
    }

    case "AUCTION_PASS": {
      const h = head(state);
      if (!h || h.kind !== "auction") return;
      const actor = h.order[h.actorIdx];
      if (actor !== p.id) return;
      if (!h.passed.includes(p.id)) {
        h.passed.push(p.id);
        h.feed.push(`${p.name} passes`);
      }
      stepAuction(state, h);
      return;
    }

    case "LOT_CONFIG": {
      const h = head(state);
      if (!h || h.kind !== "lotConfig" || h.playerId !== p.id) return;
      const area = areaById(state, h.lot.areaId);
      const kind = h.lot.type === "building" ? "building" : "rent";
      if (kind === "building" && state.buildingTaken[area.id] !== null) {
        state.pendingQueue.shift();
        afterPop(state);
        return;
      }
      const model: OpModel =
        a.model === "HOTEL" && (kind !== "building" || !(hasStaff(p, "guestOps") || hasStaff(p, "aiOps")))
          ? "STR"
          : a.model;
      const spec: AcquisitionSpec = { kind, model, furnish: a.furnish, withLicence: a.withLicence };
      const costs = acquisitionCosts(area, spec, p, state);
      // the auction bid replaced the setup cost — only furnishing is due now
      const dueNow = costs.cashNow - costs.setupCost;
      p.cash -= dueNow;
      const asset = makeAsset(state, area, spec, costs, p.id, `a${state.nextId++}`);
      p.assets.push(asset);
      if (kind === "building") state.buildingTaken[area.id] = p.id;
      const needsBundledLicence =
        (a.withLicence || model === "HOTEL") && !p.permits.includes(area.id);
      if (needsBundledLicence && p.cash >= costs.licenceCost) {
        p.cash -= costs.licenceCost;
        p.accruedProjects += costs.licenceCost;
        asset.licence = "applied";
        asset.licenceMonths = 2 + (area.regRisk >= 60 ? 1 : 0) + (chance(makeRng(state), 0.35) ? 1 : 0);
        asset.licenceProb = licenceSuccessProb(area, model, p);
      } else if (p.permits.includes(area.id)) {
        asset.licence = "approved";
      }
      log(state, p.id, `${p.name} set up the auctioned ${area.name} ${kind === "building" ? "building" : "unit"} → ${model}`, "money");
      recomputeControl(state);
      state.pendingQueue.shift();
      afterPop(state);
      return;
    }

    case "HIRE": {
      if (!backOfficeAllowed(state)) return;
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
      if (!backOfficeAllowed(state)) return;
      const amount = Math.min(a.amount, creditLeft(state, p));
      if (amount < 5000) return;
      const rate = a.kind === "bank" ? BANK_RATE : state.market.bridgeRatePm;
      p.loans.push({ id: `l${state.nextId++}`, kind: a.kind, principal: amount, ratePm: rate });
      p.cash += amount;
      if (a.kind === "bridge") {
        p.stats.bridgeLoans += 1;
        notable(p, `Took a bridge loan at ${(rate * 100).toFixed(1)}%/month`, -Math.round(amount * 0.08));
      }
      p.stats.peakDebt = Math.max(p.stats.peakDebt, totalLoanDebt(p));
      log(state, p.id, `${p.name} took a £${Math.round(amount / 1000)}k ${a.kind} loan`, a.kind === "bridge" ? "bad" : "money");
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
      if (!backOfficeAllowed(state)) return;
      const asset = findAsset(p, a.assetId);
      if (!asset || asset.deal !== "buy") return;
      const newMortgage = Math.round(asset.value * REFI_LTV);
      if (newMortgage <= asset.mortgage) return;
      const released = newMortgage - asset.mortgage;
      const fee = Math.round(released * 0.01);
      asset.mortgage = newMortgage;
      p.cash += released - fee;
      log(state, p.id, `${p.name} refinanced ${assetLabel(state, asset)}, releasing £${Math.round((released - fee) / 1000)}k`, "money");
      return;
    }

    case "UPGRADE_COMPLIANCE": {
      if (!backOfficeAllowed(state)) return;
      if (p.cityCompliance.includes(a.cityId)) return;
      const city = cityById(a.cityId);
      const cost = 3000 + city.regRisk * 80;
      if (p.cash < cost) return;
      p.cash -= cost;
      p.cityCompliance.push(a.cityId);
      log(state, p.id, `${p.name} bought full ${city.name} compliance (£${Math.round(cost / 1000)}k)`, "good");
      return;
    }

    case "DELAY_PAYOUT": {
      const h = head(state);
      if (h?.kind !== "emergency") return;
      const owed = p.lastPnl?.ownerPayouts ?? 0;
      if (owed <= 0 || p.owedOwners > 0) return;
      p.cash += owed;
      p.owedOwners = owed;
      for (const asset of p.assets) {
        if (asset.deal === "manage") asset.ownerTrust = clamp(asset.ownerTrust - 20, 1, 100);
      }
      p.trust = blendedTrust(p);
      notable(p, "Delayed owner payouts to stay afloat", -10_000);
      log(state, p.id, `${p.name} delayed owner payouts — trust takes a beating`, "bad");
      return;
    }

    case "DECLARE_BANKRUPTCY": {
      const wasMonthEndQueue = state.lastRoll === null;
      bankruptPlayer(state, p);
      if (!state.over) {
        if (state.pendingQueue.length) {
          syncCurrentToHead(state);
        } else if (wasMonthEndQueue) {
          finishMonth(state);
        } else {
          state.current = state.turnOwner;
          dispatch(state, { t: "END_TURN" });
        }
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
      } else if (p.cash >= bankruptFloor(state)) {
        p.rep = clamp(p.rep - 5, 1, 100);
        state.pendingQueue.shift();
        log(state, p.id, `${p.name} limp${p.isHuman ? "" : "s"} on in the red. Suppliers are muttering.`, "bad");
      } else {
        const wasMonthEndQueue = state.lastRoll === null;
        bankruptPlayer(state, p);
        if (!state.over) {
          if (state.pendingQueue.length) syncCurrentToHead(state);
          else if (wasMonthEndQueue) finishMonth(state);
          else {
            state.current = state.turnOwner;
            dispatch(state, { t: "END_TURN" });
          }
        }
        return;
      }
      afterPop(state);
      return;
    }

    case "END_TURN": {
      if (state.over || state.pendingQueue.length) return;
      state.lastRoll = null;
      state.lastPath = [];
      state.emergencyHandled = false;

      state.turnInMonth += 1;
      let next = state.turnInMonth;
      while (next < state.moveOrder.length && state.players[state.moveOrder[next]].bankrupt) {
        next += 1;
        state.turnInMonth = next;
      }
      const solvent = state.players.filter((x) => !x.bankrupt);
      if (solvent.length <= 1) return endGame(state);

      if (next >= state.moveOrder.length) {
        for (const cityId of Object.keys(state.market.cityMods)) {
          state.market.cityMods[cityId] = state.market.cityMods[cityId]
            .map((m) => ({ ...m, monthsLeft: m.monthsLeft - 1 }))
            .filter((m) => m.monthsLeft > 0);
        }
        monthEndAll(state);
        if (!state.pendingQueue.length) finishMonth(state);
        return;
      }
      state.current = state.moveOrder[next];
      state.turnOwner = state.current;
      state.phase = "awaitRoll";
      return;
    }
  }
}

// --- auction internals ---------------------------------------------------------------

function stepAuction(state: GameState, h: AuctionPending) {
  const over = advanceAuction(h);
  if (!over) {
    syncCurrentToHead(state);
    return;
  }
  const outcome = resolveAuction(state, h);
  log(state, -1, `🔨 ${outcome}`, h.highBidder !== null ? "money" : "neutral");
  // remove this auction from the queue (resolveAuction may have queued lotConfig)
  state.pendingQueue = state.pendingQueue.filter((q) => q !== h);
  const winner = h.highBidder !== null ? state.players[h.highBidder] : null;
  if (winner && winner.cash < 0 && !winner.bankrupt) {
    // overbid into the red: their problem now (insolvency at their next check)
    log(state, winner.id, `${winner.name} overbid and ${winner.isHuman ? "are" : "is"} now in the red.`, "bad");
  }
  afterPop(state);
}

function spawnOpportunityAuction(state: GameState) {
  const rng = makeRng(state);
  const roll = rng();
  const openBuildings = state.areas.filter((a) => state.buildingTaken[a.id] === null);
  const highReg = state.areas.filter((a) => a.regRisk >= 60);
  if (roll < 0.4) {
    startAuction(state, unitLot(state, pick(rng, state.areas)));
  } else if (roll < 0.65 && openBuildings.length) {
    startAuction(state, buildingLot(state, pick(rng, openBuildings)));
  } else if (roll < 0.85) {
    const area = pick(rng, state.areas);
    startAuction(state, mandateLot(state, area, rint(rng, 2, 3)));
  } else if (highReg.length) {
    startAuction(state, permitLot(state, pick(rng, highReg)));
  } else {
    startAuction(state, unitLot(state, pick(rng, state.areas)));
  }
  log(state, -1, "🔨 The auction house opens a lot.", "neutral");
}

function afterPop(state: GameState) {
  const p = cur(state);
  if (p.cash < 0 && !state.emergencyHandled && !p.bankrupt) {
    state.pendingQueue.unshift({ kind: "emergency" });
    state.emergencyHandled = true;
    p.stats.emergencies += 1;
    log(state, p.id, `${p.name} ${p.isHuman ? "are" : "is"} below zero — insolvency check`, "bad");
    return;
  }
  if (p.cash < bankruptFloor(state) && !p.bankrupt) {
    bankruptPlayer(state, p);
    if (state.over) return;
  }
  if (!state.pendingQueue.length) {
    if (state.phase === "action" && state.lastRoll === null) {
      finishMonth(state);
    } else if (state.phase === "action") {
      // a mid-turn auction may have moved `current`; the turn belongs to turnOwner
      state.current = state.turnOwner;
    }
    return;
  }
  syncCurrentToHead(state);
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
