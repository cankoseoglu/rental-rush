// ---------------------------------------------------------------------------
// The Market Cycle Deck. One card is drawn at every Month End and tightens
// the screws as the game ages. The deck never ends the game — it just makes
// weak operators die faster until one player is left standing.
// Phase 0 (months 1-7): expansion · Phase 1 (8-14): squeeze ·
// Phase 2 (15+): consolidation.
// ---------------------------------------------------------------------------

import type { GameState } from "../types";
import { clamp } from "../rng";

export interface MarketCard {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  phases: Array<0 | 1 | 2>;
  /** apply global effects; may return a follow-up auction request */
  apply: (state: GameState) => { auction?: "permit" | "distressed" } | void;
}

const addGlobalMod = (
  state: GameState,
  mod: { key: string; label: string; monthsLeft: number; occMult?: number; adrMult?: number; rentMult?: number; costMult?: number },
) => {
  state.market.globalMods.push(mod);
};

export const MARKET_CARDS: MarketCard[] = [
  {
    id: "low_season",
    title: "Low season",
    emoji: "🌧️",
    blurb: "Searches slump everywhere. Nightly calendars thin out.",
    phases: [0, 1, 2],
    apply: (s) => addGlobalMod(s, { key: "mc_low", label: "Low season", monthsLeft: 1, occMult: 0.88 }),
  },
  {
    id: "demand_spike",
    title: "Demand spike",
    emoji: "🎪",
    blurb: "A run of events floods every city with guests. Controllers cash in on visitors.",
    phases: [0, 1, 2],
    apply: (s) => {
      addGlobalMod(s, { key: "mc_spike", label: "Demand spike", monthsLeft: 1, occMult: 1.12 });
      s.market.demandSpike = true;
    },
  },
  {
    id: "ota_boost",
    title: "OTA algorithm boost",
    emoji: "📲",
    blurb: "The platforms reward polished operators with placement.",
    phases: [0, 1],
    apply: (s) => addGlobalMod(s, { key: "mc_algo", label: "Algorithm boost", monthsLeft: 1, occMult: 1.06 }),
  },
  {
    id: "cleaning_inflation",
    title: "Cleaning cost inflation",
    emoji: "🧽",
    blurb: "Turnover crews raise prices across the board.",
    phases: [0, 1, 2],
    apply: (s) => addGlobalMod(s, { key: "mc_clean", label: "Cleaning inflation", monthsLeft: 2, costMult: 1.15 }),
  },
  {
    id: "insurance_up",
    title: "Insurance costs rise",
    emoji: "🛡️",
    blurb: "Underwriters reprice short-let risk. Every live unit costs more to cover.",
    phases: [0, 1, 2],
    apply: (s) => {
      s.market.insurancePerUnit = Math.min(400, s.market.insurancePerUnit + 120);
    },
  },
  {
    id: "owner_expectations",
    title: "Owner expectations rise",
    emoji: "🧍",
    blurb: "Owners compare notes. Payout demands creep upward.",
    phases: [1, 2],
    apply: (s) => addGlobalMod(s, { key: "mc_owner", label: "Owner squeeze", monthsLeft: 2, rentMult: 1 }),
  },
  {
    id: "rates_rise",
    title: "Interest rates rise",
    emoji: "📈",
    blurb: "The Bank moves again. Every variable mortgage and new loan costs more.",
    phases: [1, 2],
    apply: (s) => {
      if (s.market.rateRises >= 3) return;
      s.market.ratePm += 0.001;
      s.market.rateRises += 1;
    },
  },
  {
    id: "funding_winter",
    title: "Funding winter",
    emoji: "🥶",
    blurb: "Credit desks pull back. Bridge money gets vicious, limits shrink.",
    phases: [1, 2],
    apply: (s) => {
      s.market.bridgeRatePm = Math.min(0.045, s.market.bridgeRatePm + 0.007);
      s.market.creditTightness = Math.max(0.6, s.market.creditTightness - 0.15);
    },
  },
  {
    id: "labour_shortage",
    title: "Labour shortage",
    emoji: "🧑‍🔧",
    blurb: "Cleaners and maintenance crews can name their price this month.",
    phases: [1, 2],
    apply: (s) => addGlobalMod(s, { key: "mc_labour", label: "Labour shortage", monthsLeft: 1, costMult: 1.2 }),
  },
  {
    id: "reg_crackdown",
    title: "Regulation crackdown",
    emoji: "🚨",
    blurb: "Councils sweep for unlicensed nightly inventory. Fines fly.",
    phases: [1, 2],
    apply: (s) => {
      s.market.crackdownMonths = 2;
    },
  },
  {
    id: "permit_scarcity",
    title: "City permit scarcity",
    emoji: "📜",
    blurb: "City Hall releases one precious nightly-stay permit — to the highest bidder.",
    phases: [1, 2],
    apply: () => ({ auction: "permit" }),
  },
  {
    id: "consolidation",
    title: "Hospitality consolidation",
    emoji: "🦈",
    blurb: "A struggling operator's lender quietly brings a unit to market.",
    phases: [2],
    apply: () => ({ auction: "distressed" }),
  },
];

/** Draw one card for this month (seeded), apply it, return it + any auction. */
export function drawMarketCard(
  state: GameState,
  rng: () => number,
): { card: MarketCard; auction?: "permit" | "distressed" } {
  const phase = state.month >= 12 ? 2 : state.month >= 6 ? 1 : 0;
  const pool = MARKET_CARDS.filter(
    (c) => c.phases.includes(phase) && c.id !== state.market.lastCard?.id,
  );
  const card = pool[Math.floor(rng() * pool.length)];
  const out = card.apply(state) ?? {};
  state.market.lastCard = { id: card.id, title: card.title, emoji: card.emoji, blurb: card.blurb };
  return { card, auction: out.auction };
}

/** Consolidation-phase passive pressure, applied at month end. The longer the
 * endgame drags, the harder the market squeezes — a stalemate between two
 * stable operators MUST eventually break. */
export function phasePressure(state: GameState) {
  const phase = state.month >= 12 ? 2 : state.month >= 6 ? 1 : 0;
  if (phase === 2) {
    // financing keeps tightening, and the credit lines themselves dry up
    state.market.bridgeRatePm = clamp(state.market.bridgeRatePm + 0.001, 0.025, 0.05);
    state.market.creditTightness = Math.max(0.4, state.market.creditTightness - 0.05);
    // insurance never stops creeping
    state.market.insurancePerUnit = Math.min(600, state.market.insurancePerUnit + 100);
  }
  if (state.month >= 10) {
    // market fatigue: compounding occupancy decay until somebody breaks
    state.market.globalMods.push({
      key: `fatigue${state.month}`,
      label: "Market fatigue",
      monthsLeft: 999,
      occMult: 0.975,
    });
  }
}
