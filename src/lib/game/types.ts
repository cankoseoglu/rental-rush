// ---------------------------------------------------------------------------
// Rental Rush: Operator Mode — core domain types
// Pure data, fully serialisable (saved to localStorage; Supabase-ready later).
// ---------------------------------------------------------------------------

export type Strategy = "STR" | "MTR" | "LTR";
export type DealType = "buy" | "lease" | "manage";
export type TileKind =
  | "start"
  | "property"
  | "owner"
  | "guest"
  | "regulation"
  | "finance"
  | "hiring"
  | "market"
  | "upgrade";
export type StaffId =
  | "guestOps"
  | "cleaners"
  | "maintenance"
  | "revenue"
  | "ownerSuccess"
  | "aiOps";
export type LoanKind = "bank" | "bridge";
export type GameMode = "quick" | "daily";

// --- balance constants -----------------------------------------------------

export const STRATEGY_OPS: Record<Strategy, number> = { STR: 2, MTR: 1, LTR: 0.5 };
export const MGMT_FEE: Record<Strategy, number> = { STR: 0.2, MTR: 0.15, LTR: 0.1 };

export const START_CASH = 150_000;
export const CREDIT_BASE = 300_000;
export const START_REP = 70;
export const START_TRUST = 70;
export const BASE_OPS = 5;
export const MAX_TURNS = 10;
export const BANKRUPT_FLOOR = -50_000;

export const BUY_DEPOSIT_PCT = 0.3;
export const BUY_FEES_PCT = 0.02;
export const MORTGAGE_LTV = 0.7;
export const BASE_MORTGAGE_RATE = 0.0055; // per month, interest-only
export const BANK_RATE = 0.011;
export const BRIDGE_RATE = 0.025;
export const REFI_LTV = 0.8;
export const SELL_NORMAL = 0.95;
export const SELL_FIRE = 0.85;
export const CONVERT_COST = 500;
export const APPRECIATION = 1.004; // monthly value drift on owned units
export const INVESTOR_CASH = 60_000;
export const INVESTOR_SCORE_CUT = 0.12;
export const START_LANDING_BONUS = 3_000;

// Business year starts in October: survive winter first, cash in spring.
export const MONTH_NAMES = [
  "October", "November", "December", "January", "February",
  "March", "April", "May", "June", "July",
];
export const SEASON = [0.9, 0.8, 1.0, 0.7, 0.75, 0.9, 0.95, 1.0, 1.1, 1.2];

// --- world data ------------------------------------------------------------

export interface CityDef {
  id: string;
  name: string;
  regRisk: number; // 0-100
  priceMult: number;
  adrMult: number;
  demand: number; // baseline occupancy multiplier
  hue: number; // for generated card art
  emoji: string;
  blurb: string;
}

export interface PropertyDef {
  id: string;
  name: string;
  cityId: string;
  neighbourhood: string;
  bedrooms: number;
  type: string;
  typeId: string;
  emoji: string;
  hue: number;
  // underwriting
  strOcc: number; // 0-1 base occupancy
  strAdr: number; // £ per night
  mtrRent: number; // £ per month
  ltrRent: number; // £ per month
  regRisk: number; // 0-100 (city-adjusted)
  maintRisk: number; // 0-100
  reviewSensitivity: number; // 0-100
  ownerExpectation: number; // 0-100, demandingness of the owner
  opsFactor: number; // multiplier on strategy ops cost
  // entry costs
  price: number;
  deposit: number; // cash needed to buy (deposit + fees)
  leaseSetup: number;
  leaseMonthly: number;
  onboardingCost: number;
  allowedDeals: DealType[];
}

export interface StaffDef {
  id: StaffId;
  name: string;
  emoji: string;
  salary: number;
  blurb: string;
  effect: string;
}

export interface Tile {
  idx: number;
  kind: TileKind;
  label: string;
  emoji: string;
}

// --- live state ------------------------------------------------------------

export interface TempMod {
  key: string;
  label: string;
  monthsLeft: number;
  occMult?: number;
  adrMult?: number;
  rentMult?: number; // MTR gross multiplier
}

export interface Holding {
  id: string;
  def: PropertyDef;
  deal: DealType;
  strategy: Strategy;
  review: number; // 3.0 - 5.0
  furnish: number; // ADR multiplier, 0.9 - 1.3
  pricingTools: boolean;
  licence: boolean;
  monthsHeld: number;
  cumNet: number;
  lastNet: number;
  lastOcc: number;
  lastAdr: number;
  value: number; // current market value (buy deals)
  mortgage: number; // outstanding principal
  suspendedMonths: number;
  mods: TempMod[];
}

export interface Loan {
  id: string;
  kind: LoanKind;
  principal: number;
  ratePm: number;
}

export interface Notable {
  label: string;
  value: number; // signed £ impact, used to rank wins/mistakes
}

export interface PlayerStats {
  finesTotal: number;
  finesCount: number;
  refundsTotal: number;
  emergencies: number;
  overloadMonths: number;
  strRevenue: number;
  mtrRevenue: number;
  ltrRevenue: number;
  mgmtFees: number;
  peakDebt: number;
  churnedOwners: number;
  bridgeLoans: number;
  propertiesSold: number;
  referrals: number;
  bestMonthNet: number;
  worstMonthNet: number;
  notables: Notable[];
}

export interface PlayerState {
  id: number;
  name: string;
  isHuman: boolean;
  color: string;
  emoji: string;
  personality?: "aggressive" | "steady";
  pos: number;
  cash: number;
  rep: number;
  trust: number;
  staff: StaffId[];
  holdings: Holding[];
  loans: Loan[];
  mods: TempMod[];
  cityCompliance: string[];
  monthsDone: number;
  turnsDone: number;
  bankrupt: boolean;
  bankruptTurn: number | null;
  investorTaken: boolean;
  owedOwners: number;
  accruedFines: number; // since last month-end (already hit cash)
  accruedRefunds: number;
  lastEventId: string | null;
  lastPnl: PnL | null;
  cashHistory: number[];
  stats: PlayerStats;
}

export interface PnLLine {
  name: string;
  strategy: Strategy;
  deal: DealType;
  gross: number;
  net: number;
  occ: number;
  adr: number;
}

export interface PnL {
  month: string;
  seasonLabel: string;
  revenue: number;
  ownerPayouts: number;
  lease: number;
  debtService: number;
  staffCost: number;
  maintenance: number;
  refunds: number;
  fines: number;
  net: number;
  cashAfter: number;
  repDelta: number;
  trustDelta: number;
  notes: string[];
  lines: PnLLine[];
}

export interface EventChoice {
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
  evHint: number; // bot attractiveness, relative £
  riskHint: number; // 0-1, how gambly this choice is
}

export type PendingAction =
  | { kind: "property"; card: PropertyDef }
  | {
      kind: "event";
      eventId: string;
      category: TileKind;
      title: string;
      emoji: string;
      flavor: string;
      effects: string[]; // already-applied effect summary chips
      choices: EventChoice[]; // empty => info-only, ACK to dismiss
      memo: Record<string, number | string>; // serialisable context for choose()
    }
  | { kind: "hiring" }
  | { kind: "finance" }
  | { kind: "upgrade" }
  | { kind: "monthEnd"; pnl: PnL }
  | { kind: "emergency" }
  | { kind: "referral"; card: PropertyDef };

export interface LogEntry {
  turn: number;
  playerId: number;
  text: string;
  tone: "good" | "bad" | "neutral" | "money";
}

export interface MarketState {
  ratePm: number; // current mortgage rate for new + refi
  rateRises: number;
  cityMods: Record<string, TempMod[]>;
}

export interface ScoreBreakdown {
  cash: number;
  equity: number;
  noi: number; // monthly proforma net operating income
  noiValue: number; // 12 x noi
  ownerContractValue: number;
  reputationValue: number;
  debt: number; // loans + owed payouts subtracted
  riskPenalty: number;
  bankruptcyPenalty: number;
  investorCut: number;
  total: number;
}

export interface FinalResult {
  playerId: number;
  score: ScoreBreakdown;
  archetype: ArchetypeId;
  strategyLabel: string;
  biggestWin: string;
  biggestMistake: string;
  propertiesOwned: number;
  managedUnits: number;
  opsUsed: number;
  opsCap: number;
}

export type ArchetypeId =
  | "strKing"
  | "cashflowBeast"
  | "safeOperator"
  | "chaosSurvivor"
  | "overleveraged"
  | "regulationVictim"
  | "ownerWhisperer"
  | "badReviewMagnet"
  | "boringBillionaire"
  | "opsMachine";

export interface GameState {
  v: number; // save version
  seed: number;
  rngState: number;
  mode: GameMode;
  dailyKey: string | null;
  tiles: Tile[];
  deck: PropertyDef[];
  deckIdx: number;
  players: PlayerState[];
  current: number;
  turnCount: number;
  maxTurns: number;
  market: MarketState;
  phase: "awaitRoll" | "moving" | "action" | "over";
  emergencyHandled: boolean; // reset each turn; one emergency prompt per turn
  pendingQueue: PendingAction[];
  lastRoll: [number, number] | null;
  lastPath: number[];
  log: LogEntry[];
  over: boolean;
  winnerId: number | null;
  results: FinalResult[] | null;
  nextId: number;
}
