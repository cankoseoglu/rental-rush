// ---------------------------------------------------------------------------
// Rental Rush: Operator Mode — core domain types (V2: area control).
// Board tiles are NEIGHBOURHOODS. Players stack assets (units & buildings)
// inside areas, race pipelines (licensing / furnishing / building prep) and
// fight for area control. Months are synchronized: every player moves once,
// then Month End runs for everyone.
// Pure data, fully serialisable (saved to localStorage; Supabase-ready later).
// ---------------------------------------------------------------------------

export type OpModel = "STR" | "MTR" | "LTR" | "HOTEL";
export type DealType = "buy" | "lease" | "manage";
export type AssetKind = "unit" | "building";
export type AssetStatus = "prep" | "furnishing" | "awaitingLicence" | "live" | "suspended";
export type FurnishType = "fast" | "slow";
export type LicenceState = "none" | "applied" | "approved" | "rejected";
export type TileKind = "start" | "area" | "event" | "corner";
export type EventCategory = "guest" | "owner" | "regulation" | "market";
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

export const OPS_PER_UNIT: Record<OpModel, number> = { STR: 1.0, HOTEL: 1.2, MTR: 0.5, LTR: 0.25 };
export const MGMT_FEE: Record<OpModel, number> = { STR: 0.2, HOTEL: 0.2, MTR: 0.15, LTR: 0.1 };

export const START_CASH = 150_000;
export const CREDIT_BASE = 300_000;
export const START_REP = 70;
export const START_TRUST = 70;
export const BASE_OPS = 5;
export const MAX_MONTHS = 10;
export const BANKRUPT_FLOOR = -50_000;

export const BUY_CASH_PCT = 0.32; // 30% deposit + 2% fees
export const MORTGAGE_LTV = 0.7;
export const BASE_MORTGAGE_RATE = 0.0055; // per month, variable
export const BANK_RATE = 0.011;
export const BRIDGE_RATE = 0.025;
export const REFI_LTV = 0.8;
export const SELL_NORMAL = 0.95;
export const SELL_FIRE = 0.85;
export const APPRECIATION = 1.004;
export const INVESTOR_CASH = 60_000;
export const INVESTOR_SCORE_CUT = 0.12;
export const START_LANDING_BONUS = 3_000;
export const HOTEL_OVERHEAD_PER_UNIT = 150;
export const HOTEL_ADR_MULT = 1.3;
export const SWITCH_COST_PER_UNIT = 500;
export const SWITCH_COST_HOTEL = 1_000;
export const RENOVATE_COST_PER_UNIT = 3_500;

// Business year starts in October: survive winter first, cash in spring.
export const MONTH_NAMES = [
  "October", "November", "December", "January", "February",
  "March", "April", "May", "June", "July",
];
export const SEASON = [0.9, 0.8, 1.0, 0.7, 0.75, 0.9, 0.95, 1.0, 1.1, 1.2];

export const FURNISH_SPECS: Record<
  FurnishType,
  {
    label: string;
    costPerUnit: (level: number) => number;
    months: (kind: AssetKind) => number;
    quality: number; // ADR multiplier
    occBonus: number;
    ratingStart: number;
    ratingCap: number;
    maintMult: number;
  }
> = {
  fast: {
    label: "Fast furnish",
    costPerUnit: (level) => 3_500 + level * 1_000,
    months: () => 1,
    quality: 0.93,
    occBonus: 0,
    ratingStart: 4.25,
    ratingCap: 4.6,
    maintMult: 1.3,
  },
  slow: {
    label: "Premium furnish",
    costPerUnit: (level) => 6_000 + level * 2_000,
    months: (kind) => (kind === "building" ? 3 : 2),
    quality: 1.08,
    occBonus: 0.04,
    ratingStart: 4.5,
    ratingCap: 5.0,
    maintMult: 0.8,
  },
};

// --- world data ------------------------------------------------------------

export interface CityDef {
  id: string;
  name: string;
  regRisk: number;
  priceMult: number;
  adrMult: number;
  demand: number;
  hue: number;
  emoji: string;
  blurb: string;
}

export interface AreaDef {
  id: string;
  name: string;
  cityId: string;
  level: 1 | 2 | 3; // £ / ££ / £££
  demand: 1 | 2 | 3; // low / medium / high
  regRisk: number; // 0-100
  unitPrice: number;
  baseAdr: number;
  baseOcc: number; // 0-1
  mtrRent: number;
  ltrRent: number;
  stayFee: number;
  buildingUnits: number; // size of the one leasable building here
}

export interface Tile {
  idx: number;
  kind: TileKind;
  label: string;
  emoji: string;
  areaId?: string;
  eventCategory?: EventCategory;
}

export interface StaffDef {
  id: StaffId;
  name: string;
  emoji: string;
  salary: number;
  blurb: string;
  effect: string;
}

// --- live state ------------------------------------------------------------

export interface TempMod {
  key: string;
  label: string;
  monthsLeft: number;
  occMult?: number;
  adrMult?: number;
  rentMult?: number;
}

export interface Asset {
  id: string;
  ownerId: number;
  areaId: string;
  kind: AssetKind;
  units: number;
  deal: DealType;
  model: OpModel;
  status: AssetStatus;
  monthsToLive: number; // remaining prep+furnishing months while not live
  furnish: FurnishType;
  furnishQ: number; // ADR quality multiplier
  maintMult: number;
  rating: number; // 3.0 - 5.0
  ratingCap: number;
  licence: LicenceState;
  licenceMonths: number; // months remaining on application
  licenceProb: number;
  licenceAttempts: number;
  monthlyFixed: number; // lease obligation (runs from contract signing)
  mortgage: number; // outstanding principal (buy deals)
  value: number; // market value (buy deals)
  ownerTrust: number; // managed deals only (else 0)
  suspendedMonths: number;
  cumNet: number;
  lastNet: number;
  lastOcc: number;
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
  value: number;
}

export interface PlayerStats {
  finesTotal: number;
  finesCount: number;
  refundsTotal: number;
  emergencies: number;
  overloadMonths: number;
  strRevenue: number; // STR + HOTEL gross
  mtrRevenue: number;
  ltrRevenue: number;
  mgmtFees: number;
  stayFeesPaid: number;
  stayFeesEarned: number;
  peakDebt: number;
  churnedOwners: number;
  bridgeLoans: number;
  assetsSold: number;
  referrals: number;
  licencesWon: number;
  licencesRejected: number;
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
  trust: number; // blended owner trust (managed assets average)
  staff: StaffId[];
  assets: Asset[];
  loans: Loan[];
  mods: TempMod[];
  cityCompliance: string[];
  monthsDone: number;
  bankrupt: boolean;
  bankruptTurn: number | null;
  investorTaken: boolean;
  owedOwners: number;
  accruedFines: number; // since last month-end (already hit cash)
  accruedRefunds: number;
  accruedProjects: number; // licence fees etc. already paid this month
  accruedFeesPaid: number; // stay fees paid this month (already hit cash)
  accruedFeesEarned: number;
  lastEventId: string | null;
  lastPnl: PnL | null;
  cashHistory: number[];
  stats: PlayerStats;
}

export interface PnLLine {
  name: string;
  model: OpModel;
  deal: DealType;
  status: AssetStatus;
  gross: number;
  net: number;
  occ: number;
  units: number;
}

export interface PnL {
  month: string;
  seasonLabel: string;
  revenue: number;
  ownerPayouts: number;
  lease: number;
  debtService: number;
  staffCost: number;
  maintenance: number; // maintenance + cleaning/ops + hotel overhead
  projects: number; // furnishing + licence spend this month
  refunds: number;
  fines: number;
  feesPaid: number; // stay/market fees paid this month
  feesEarned: number;
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
  evHint: number;
  riskHint: number;
}

export type PendingAction =
  | { kind: "area"; areaId: string } // landed here — actions available
  | {
      kind: "event";
      eventId: string;
      category: EventCategory;
      title: string;
      emoji: string;
      flavor: string;
      effects: string[];
      choices: EventChoice[];
      memo: Record<string, number | string>;
    }
  | { kind: "monthEnd"; playerId: number; pnl: PnL }
  | { kind: "emergency" }
  | { kind: "referral"; playerId: number; areaId: string };

export interface LogEntry {
  turn: number;
  playerId: number;
  text: string;
  tone: "good" | "bad" | "neutral" | "money";
}

export interface MarketState {
  ratePm: number;
  rateRises: number;
  cityMods: Record<string, TempMod[]>;
}

export interface ScoreBreakdown {
  cash: number;
  equity: number;
  noi: number;
  noiValue: number;
  ownerContractValue: number;
  reputationValue: number;
  debt: number;
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
  unitsOwned: number; // owned (buy) units
  unitsLive: number;
  managedUnits: number;
  areasControlled: number;
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
  v: number; // save version (2 = area control)
  seed: number;
  rngState: number;
  mode: GameMode;
  dailyKey: string | null;
  tiles: Tile[];
  areas: AreaDef[];
  buildingTaken: Record<string, number | null>; // areaId -> playerId who leased it
  control: Record<string, number | null>; // areaId -> controlling playerId
  players: PlayerState[];
  current: number;
  month: number; // 0-based; game ends after MAX_MONTHS month-ends
  moveOrder: number[]; // solvent player ids due to move this month
  turnInMonth: number; // index into moveOrder
  maxMonths: number;
  market: MarketState;
  phase: "awaitRoll" | "moving" | "action" | "over";
  emergencyHandled: boolean;
  pendingQueue: PendingAction[];
  lastRoll: [number, number] | null;
  lastPath: number[];
  log: LogEntry[];
  over: boolean;
  winnerId: number | null;
  results: FinalResult[] | null;
  nextId: number;
}
