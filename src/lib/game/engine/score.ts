// ---------------------------------------------------------------------------
// Post-game results V3. THE WINNER IS NEVER DECIDED HERE — the last solvent
// operator wins, full stop. Everything in this file is bragging material:
// stats, archetypes, tombstones.
// ---------------------------------------------------------------------------

import type {
  ArchetypeId,
  FinalResult,
  GameState,
  OpModel,
  PlayerState,
} from "../types";
import { opsCapacity } from "../data/staff";
import {
  assetControlPoints,
  citySetCount,
  equity,
  playerLoad,
  proformaNOI,
  totalLoanDebt,
} from "./sim";

export const ARCHETYPES: Record<
  ArchetypeId,
  { name: string; emoji: string; blurb: string; hue: number }
> = {
  ruthless: {
    name: "Ruthless Operator",
    emoji: "🦈",
    blurb: "You didn't just outlast them. You set the fees, squeezed the turf, and watched them drown.",
    hue: 0,
  },
  strKing: {
    name: "STR King",
    emoji: "👑",
    blurb: "Nightly rates, packed calendars, zero chill. The short-let game bowed to you.",
    hue: 25,
  },
  cashflowBeast: {
    name: "Cashflow Beast",
    emoji: "🐂",
    blurb: "Every month the machine printed. You built an income engine, not a hobby.",
    hue: 95,
  },
  safeOperator: {
    name: "Safe Operator",
    emoji: "🛡️",
    blurb: "Boring strategies, zero crises, steady compounding. The tortoise sends regards.",
    hue: 200,
  },
  chaosSurvivor: {
    name: "Chaos Survivor",
    emoji: "🧯",
    blurb: "Negative cash, emergency loans, owner payout roulette — and yet, here you stand.",
    hue: 12,
  },
  overleveraged: {
    name: "Overleveraged Founder",
    emoji: "🎈",
    blurb: "Growth on borrowed money, vibes on borrowed time. Debt service ate the dream.",
    hue: 330,
  },
  regulationVictim: {
    name: "Regulation Victim",
    emoji: "⚖️",
    blurb: "The council read your portfolio before you did. Fines, permits, rejected licences.",
    hue: 0,
  },
  ownerWhisperer: {
    name: "Owner Whisperer",
    emoji: "🤝",
    blurb: "Owners trust you with their keys, their cashflow and their referrals. Empire by handshake.",
    hue: 270,
  },
  badReviewMagnet: {
    name: "Bad Review Magnet",
    emoji: "🧲",
    blurb: "“Smelled faintly of regret. Two stars.” The guests have spoken, repeatedly.",
    hue: 350,
  },
  boringBillionaire: {
    name: "Boring Billionaire",
    emoji: "🗿",
    blurb: "Few assets, no drama, obscene equity. You won by refusing to be interesting.",
    hue: 45,
  },
  opsMachine: {
    name: "Ops Machine",
    emoji: "⚙️",
    blurb: "Maximum doors, zero dropped balls. Your ops capacity ran hot and never melted.",
    hue: 180,
  },
};

function pickArchetype(state: GameState, p: PlayerState, noi: number): ArchetypeId {
  const s = p.stats;
  const managedUnits = p.assets
    .filter((a) => a.deal === "manage")
    .reduce((sum, a) => sum + a.units, 0);
  const totalRev = s.strRevenue + s.mtrRevenue + s.ltrRevenue;
  const strShare = totalRev > 0 ? s.strRevenue / totalRev : 0;
  const calmShare = totalRev > 0 ? (s.mtrRevenue + s.ltrRevenue) / totalRev : 0;
  const opsUsed = playerLoad(p);

  if (p.bankrupt) {
    if (s.peakDebt >= 60_000 || s.bridgeLoans > 0) return "overleveraged";
    if (s.finesCount >= 2 || s.licencesRejected >= 2) return "regulationVictim";
    if (p.rep < 45) return "badReviewMagnet";
    return "chaosSurvivor";
  }
  if (s.bankruptciesCaused >= 1) return "ruthless";
  if (s.emergencies > 0) return "chaosSurvivor";
  if (p.rep < 42) return "badReviewMagnet";
  if ((s.finesCount >= 2 && s.finesTotal >= 6_000) || s.licencesRejected >= 2)
    return "regulationVictim";
  if (strShare >= 0.6 && s.strRevenue >= 25_000 && managedUnits < 4) return "strKing";
  if (managedUnits >= 4 && p.trust >= 78) return "ownerWhisperer";
  if (opsUsed >= 16 && s.overloadMonths === 0) return "opsMachine";
  if (noi >= 9_000) return "cashflowBeast";
  if (equity(p) >= 250_000 && p.assets.length <= 3 && s.emergencies === 0)
    return "boringBillionaire";
  if (calmShare >= 0.6) return "safeOperator";
  if (noi >= 4_000) return "cashflowBeast";
  return "safeOperator";
}

function strategyLabel(p: PlayerState): string {
  const s = p.stats;
  const totalRev = s.strRevenue + s.mtrRevenue + s.ltrRevenue;
  if (totalRev === 0) return "Cautious spectator";
  const hotelUnits = p.assets.filter((a) => a.model === "HOTEL").reduce((x, a) => x + a.units, 0);
  if (hotelUnits >= 4) return "Hotel Mode mogul";
  const managedFeeShare = s.mgmtFees / Math.max(1, totalRev);
  if (managedFeeShare >= 0.25) return "Management-led";
  if (s.strRevenue / totalRev >= 0.55) return "STR-first";
  if (s.mtrRevenue / totalRev >= 0.4) return "Mid-term specialist";
  if (s.ltrRevenue / totalRev >= 0.4) return "Long-let landlord";
  return "Balanced operator";
}

function bestAndWorst(state: GameState, p: PlayerState): { win: string; mistake: string } {
  const candidates = [...p.stats.notables];
  for (const a of p.assets) {
    const areaName = state.areas.find((ar) => ar.id === a.areaId)?.name ?? "an area";
    const label = a.kind === "building" ? `The ${areaName} block` : `The ${areaName} unit`;
    if (a.cumNet >= 5_000)
      candidates.push({ label: `${label} printed £${Math.round(a.cumNet / 1000)}k`, value: a.cumNet });
    if (a.cumNet <= -2_500)
      candidates.push({ label: `${label} bled £${Math.round(-a.cumNet / 1000)}k`, value: a.cumNet });
  }
  const wins = candidates.filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
  const mistakes = candidates.filter((c) => c.value < 0).sort((a, b) => a.value - b.value);
  return {
    win: wins[0]?.label ?? (p.assets.length ? "Kept every plate spinning" : "Stayed liquid, stayed alive"),
    mistake: mistakes[0]?.label ?? "Played it almost too safe",
  };
}

function strongestArea(state: GameState, p: PlayerState): string | null {
  let best: string | null = null;
  let bestPts = 0;
  for (const area of state.areas) {
    const pts = p.assets.reduce(
      (s, a) => (a.areaId === area.id ? s + assetControlPoints(a) : s),
      0,
    );
    if (pts > bestPts) {
      bestPts = pts;
      best = area.name;
    }
  }
  return best;
}

export function computeResults(state: GameState): FinalResult[] {
  return state.players.map((p) => {
    const noi = proformaNOI(p, state);
    const { win, mistake } = bestAndWorst(state, p);
    const areasControlled = Object.values(state.control).filter((c) => c === p.id).length;
    const unitsByModel: Record<OpModel, number> = { STR: 0, MTR: 0, LTR: 0, HOTEL: 0 };
    for (const a of p.assets) {
      if (a.status === "live") unitsByModel[a.model] += a.units;
    }
    return {
      playerId: p.id,
      won: state.winnerId === p.id,
      bankrupt: p.bankrupt,
      survivalMonth: p.bankrupt ? (p.bankruptTurn ?? state.month) : state.month,
      tombstone: p.bankruptReason,
      cash: Math.round(p.cash),
      estate: Math.round(Math.max(0, p.cash) + equity(p)),
      noi,
      debt: Math.round(totalLoanDebt(p) + p.owedOwners),
      unitsLive: p.assets.filter((a) => a.status === "live").reduce((s, a) => s + a.units, 0),
      unitsByModel,
      unitsControlled: p.assets.reduce((s, a) => s + a.units, 0),
      areasControlled,
      citySets: citySetCount(state, p.id),
      rentCollected: Math.round(p.stats.strRevenue + p.stats.mtrRevenue + p.stats.ltrRevenue),
      bankruptciesCaused: p.stats.bankruptciesCaused,
      biggestAuctionWin: p.stats.biggestAuctionWin,
      biggestWin: win,
      biggestMistake: mistake,
      strongestArea: strongestArea(state, p),
      archetype: pickArchetype(state, p, noi),
      strategyLabel: strategyLabel(p),
      opsUsed: playerLoad(p),
      opsCap: opsCapacity(p),
    };
  });
}
