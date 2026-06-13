// ---------------------------------------------------------------------------
// Final scoring V2: Rental Empire Score over areas & assets.
// ---------------------------------------------------------------------------

import type {
  ArchetypeId,
  FinalResult,
  GameState,
  PlayerState,
  ScoreBreakdown,
} from "../types";
import { opsCapacity } from "../data/staff";
import {
  equity,
  isUnlicensed,
  mgmtMonthlyProfit,
  playerLoad,
  proformaNOI,
  totalLoanDebt,
} from "./sim";

export const ARCHETYPES: Record<
  ArchetypeId,
  { name: string; emoji: string; blurb: string; hue: number }
> = {
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

export function computeScore(state: GameState, p: PlayerState): ScoreBreakdown {
  const eq = equity(p);
  const noi = proformaNOI(p, state);
  const noiValue = 12 * noi;
  const managed = p.assets.filter((a) => a.deal === "manage");
  const managedUnits = managed.reduce((s, a) => s + a.units, 0);
  const mgmtProfit = mgmtMonthlyProfit(p, state);
  const ownerContractValue =
    managedUnits > 0
      ? Math.round(
          mgmtProfit * 10 * (p.trust / 100) * Math.min(1.6, 1 + 0.12 * (managedUnits - 1)),
        )
      : 0;
  const reputationValue = (p.rep - 50) * 2500;
  const debt = totalLoanDebt(p) + p.owedOwners;

  // risk penalties — unsecured debt vs cushion (mortgages live inside equity)
  const unsecured = totalLoanDebt(p) + p.owedOwners;
  const cushion = Math.max(0, p.cash) + eq;
  let riskPenalty =
    unsecured > 0.6 * cushion ? Math.min(90_000, (unsecured - 0.6 * cushion) * 0.6) : 0;
  const over = playerLoad(p) - opsCapacity(p);
  if (over > 0) riskPenalty += over * 12_000;
  for (const a of p.assets) {
    if (a.status === "live" && isUnlicensed(state, p, a)) riskPenalty += 8_000 * Math.min(3, a.units);
  }
  if (p.cash < 0) riskPenalty += Math.abs(p.cash) * 0.5;
  riskPenalty = Math.round(riskPenalty);

  const bankruptcyPenalty = p.bankrupt ? 150_000 : 0;

  const subtotal =
    p.cash + eq + noiValue + ownerContractValue + reputationValue - debt - riskPenalty - bankruptcyPenalty;
  const investorCut = p.investorTaken && subtotal > 0 ? Math.round(subtotal * 0.12) : 0;

  return {
    cash: Math.round(p.cash),
    equity: Math.round(eq),
    noi,
    noiValue: Math.round(noiValue),
    ownerContractValue,
    reputationValue,
    debt: Math.round(debt),
    riskPenalty,
    bankruptcyPenalty,
    investorCut,
    total: Math.round(subtotal - investorCut),
  };
}

function pickArchetype(state: GameState, p: PlayerState, score: ScoreBreakdown): ArchetypeId {
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
  if (s.emergencies > 0) return "chaosSurvivor";
  if (p.rep < 42) return "badReviewMagnet";
  if ((s.finesCount >= 2 && s.finesTotal >= 6_000) || s.licencesRejected >= 2)
    return "regulationVictim";
  if (strShare >= 0.6 && s.strRevenue >= 25_000 && managedUnits < 4) return "strKing";
  if (managedUnits >= 4 && p.trust >= 78) return "ownerWhisperer";
  if (opsUsed >= 8 && s.overloadMonths === 0) return "opsMachine";
  if (score.noi >= 9_000) return "cashflowBeast";
  if (score.total >= 500_000 && p.assets.length <= 3 && s.emergencies === 0)
    return "boringBillionaire";
  if (calmShare >= 0.6) return "safeOperator";
  if (score.noi >= 4_000) return "cashflowBeast";
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

export function computeResults(state: GameState): FinalResult[] {
  return state.players.map((p) => {
    const score = computeScore(state, p);
    const { win, mistake } = bestAndWorst(state, p);
    const areasControlled = Object.values(state.control).filter((c) => c === p.id).length;
    return {
      playerId: p.id,
      score,
      archetype: pickArchetype(state, p, score),
      strategyLabel: strategyLabel(p),
      biggestWin: win,
      biggestMistake: mistake,
      unitsOwned: p.assets.filter((a) => a.deal === "buy").reduce((s, a) => s + a.units, 0),
      unitsLive: p.assets.filter((a) => a.status === "live").reduce((s, a) => s + a.units, 0),
      managedUnits: p.assets.filter((a) => a.deal === "manage").reduce((s, a) => s + a.units, 0),
      areasControlled,
      opsUsed: playerLoad(p),
      opsCap: opsCapacity(p),
    };
  });
}
