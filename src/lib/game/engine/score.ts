// ---------------------------------------------------------------------------
// Final scoring: Rental Empire Score, archetypes, biggest win / mistake.
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
  isCompliant,
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
    blurb: "The council read your portfolio before you did. Fines, permits, forced conversions.",
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
    blurb: "Few properties, no drama, obscene equity. You won by refusing to be interesting.",
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
  const managed = p.holdings.filter((h) => h.deal === "manage").length;
  const mgmtProfit = mgmtMonthlyProfit(p, state);
  const ownerContractValue =
    managed > 0
      ? Math.round(
          mgmtProfit * 10 * (p.trust / 100) * Math.min(1.6, 1 + 0.12 * (managed - 1)),
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
  for (const h of p.holdings) {
    if (
      h.strategy === "STR" &&
      h.def.regRisk >= 60 &&
      !h.licence &&
      !isCompliant(p, h.def.cityId)
    )
      riskPenalty += 8_000;
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
  const managed = p.holdings.filter((h) => h.deal === "manage").length;
  const totalRev = s.strRevenue + s.mtrRevenue + s.ltrRevenue;
  const strShare = totalRev > 0 ? s.strRevenue / totalRev : 0;
  const calmShare = totalRev > 0 ? (s.mtrRevenue + s.ltrRevenue) / totalRev : 0;
  const opsUsed = playerLoad(p);

  if (p.bankrupt) {
    if (s.peakDebt >= 60_000 || s.bridgeLoans > 0) return "overleveraged";
    if (s.finesCount >= 2) return "regulationVictim";
    if (p.rep < 45) return "badReviewMagnet";
    return "chaosSurvivor";
  }
  if (s.emergencies > 0) return "chaosSurvivor";
  if (p.rep < 42) return "badReviewMagnet";
  if (s.finesCount >= 2 && s.finesTotal >= 6_000) return "regulationVictim";
  if (managed >= 2 && p.trust >= 75) return "ownerWhisperer";
  if (strShare >= 0.6 && s.strRevenue >= 20_000) return "strKing";
  if (opsUsed >= 8 && s.overloadMonths === 0) return "opsMachine";
  if (score.noi >= 9_000) return "cashflowBeast";
  if (score.total >= 500_000 && p.holdings.length <= 3 && s.emergencies === 0)
    return "boringBillionaire";
  if (calmShare >= 0.6) return "safeOperator";
  if (score.noi >= 4_000) return "cashflowBeast";
  return "safeOperator";
}

function strategyLabel(p: PlayerState): string {
  const s = p.stats;
  const totalRev = s.strRevenue + s.mtrRevenue + s.ltrRevenue;
  if (totalRev === 0) return "Cautious spectator";
  const managedFeeShare = s.mgmtFees / Math.max(1, totalRev);
  if (managedFeeShare >= 0.25) return "Management-led";
  if (s.strRevenue / totalRev >= 0.55) return "STR-first";
  if (s.mtrRevenue / totalRev >= 0.4) return "Mid-term specialist";
  if (s.ltrRevenue / totalRev >= 0.4) return "Long-let landlord";
  return "Balanced operator";
}

function bestAndWorst(p: PlayerState): { win: string; mistake: string } {
  const candidates = [...p.stats.notables];
  for (const h of p.holdings) {
    if (h.cumNet >= 5_000)
      candidates.push({
        label: `${h.def.name} printed £${Math.round(h.cumNet / 1000)}k`,
        value: h.cumNet,
      });
    if (h.cumNet <= -2_500)
      candidates.push({
        label: `${h.def.name} bled £${Math.round(-h.cumNet / 1000)}k`,
        value: h.cumNet,
      });
  }
  const wins = candidates.filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
  const mistakes = candidates.filter((c) => c.value < 0).sort((a, b) => a.value - b.value);
  return {
    win: wins[0]?.label ?? (p.holdings.length ? "Kept every plate spinning" : "Stayed liquid, stayed alive"),
    mistake: mistakes[0]?.label ?? "Played it almost too safe",
  };
}

export function computeResults(state: GameState): FinalResult[] {
  return state.players.map((p) => {
    const score = computeScore(state, p);
    const { win, mistake } = bestAndWorst(p);
    return {
      playerId: p.id,
      score,
      archetype: pickArchetype(state, p, score),
      strategyLabel: strategyLabel(p),
      biggestWin: win,
      biggestMistake: mistake,
      propertiesOwned: p.holdings.filter((h) => h.deal === "buy").length,
      managedUnits: p.holdings.filter((h) => h.deal === "manage").length,
      opsUsed: playerLoad(p),
      opsCap: opsCapacity(p),
    };
  });
}
