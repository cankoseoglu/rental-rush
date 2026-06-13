// ---------------------------------------------------------------------------
// Rental Rush: Operator Mode — core domain types (V3: winner-take-all).
// The ONLY win condition: last solvent rental operator standing.
// Bankrupt players are eliminated and their assets go to distressed auction.
// Months run until one player remains; a market-cycle deck ratchets pressure
// so the endgame arrives naturally. No Enterprise Value, no final score.
// Pure data, fully serialisable (saved to localStorage; Supabase-ready later).
// ---------------------------------------------------------------------------

export type OpModel = "STR" | "MTR" | "LTR" | "HOTEL";
export type DealType = "buy" | "lease" | "manage";
export type AssetKind = "unit" | "building";
export type AssetStatus = "prep" | "furnishing" | "awaitingLicence" | "live" | "suspended";
export type FurnishType = "fast" | "slow";
export type LicenceState = "none" | "applied" | "approved" | "rejected";
export type TileKind = "start" | "area" | "event" | "auction" | "corner";
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

export const OPS_PER_UNIT: Record<OpModel, number> = { STR: 2.0, HOTEL: 3.0, MTR: 1.0, LTR: 0.5 };
export const CONTROL_POINTS: Record<OpModel, number> = { LTR: 1, MTR: 1.5, STR: 2, HOTEL: 3 };
export const MGMT_FEE: Record<OpModel, number> = { STR: 0.2, HOTEL: 0.2, MTR: 0.15, LTR: 0.1 };

export const START_CASH = 150_000;
export const CREDIT_BASE = 300_000;
export const START_REP = 70;
export const START_TRUST = 70;
export const BASE_OPS = 8; // per-unit ops costs doubled in V3, capacity follows
export const BANKRUPT_FLOOR = -50_000;
export const BANKRUPT_FLOOR_LATE = -25_000; // consolidation phase tightens credit

export const BUY_CASH_PCT = 0.32;
export const MORTGAGE_LTV = 0.7;
export const BASE_MORTGAGE_RATE = 0.0055;
export const BANK_RATE = 0.011;
export const BRIDGE_RATE = 0.025;
export const REFI_LTV = 0.8;
export const SELL_NORMAL = 0.95;
export const SELL_FIRE = 0.85;
export const APPRECIATION = 1.004;
export const START_LANDING_BONUS = 3_000;
export const HOTEL_OVERHEAD_PER_UNIT = 150;
export const HOTEL_ADR_MULT = 1.3;
export const SWITCH_COST_PER_UNIT = 500;
export const SWITCH_COST_HOTEL = 1_000;
export const RENOVATE_COST_PER_UNIT = 3_500;

// market phases: 0 expansion · 1 squeeze · 2 consolidation
export const PHASE_SQUEEZE_MONTH = 6;
export const PHASE_CONSOLIDATION_MONTH = 12;

// Business year starts in October: survive winter first, cash in spring.
export const MONTH_NAMES = [
  "October", "November", "December", "January", "February",
  "March", "April", "May", "June", "July",
  "August", "September",
];
export const SEASON = [0.9, 0.8, 1.0, 0.7, 0.75, 0.9, 0.95, 1.0, 1.1, 1.2, 1.25, 1.05];

export const FURNISH_SPECS: Record<
  FurnishType,
  {
    label: string;
    costPerUnit: (level: number) => number;
    months: (kind: AssetKind) => number;
    quality: number;
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
  level: 1 | 2 | 3;
  demand: 1 | 2 | 3;
  regRisk: number;
  unitPrice: number;
  baseAdr: number;
  baseOcc: number;
  mtrRent: number;
  ltrRent: number;
  buildingUnits: number;
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
  costMult?: number; // cleaning/maintenance inflation
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
  monthsToLive: number;
  furnish: FurnishType;
  furnishQ: number;
  maintMult: number;
  rating: number;
  ratingCap: number;
  licence: LicenceState;
  licenceMonths: number;
  licenceProb: number;
  licenceAttempts: number;
  monthlyFixed: number;
  mortgage: number;
  value: number;
  ownerTrust: number;
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
  strRevenue: number;
  mtrRevenue: number;
  ltrRevenue: number;
  mgmtFees: number;
  stayFeesPaid: number;
  stayFeesEarned: number;
  feesPaidTo: Record<number, number>; // who is bleeding you dry (per rival)
  bankruptciesCaused: number;
  auctionsWon: number;
  auctionSpend: number;
  biggestAuctionWin: string | null;
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
  trust: number;
  staff: StaffId[];
  assets: Asset[];
  loans: Loan[];
  mods: TempMod[];
  cityCompliance: string[];
  permits: string[]; // area-level STR/hotel permits won at auction
  monthsDone: number;
  bankrupt: boolean;
  bankruptTurn: number | null; // month of elimination
  bankruptReason: string | null;
  owedOwners: number;
  accruedFines: number;
  accruedRefunds: number;
  accruedProjects: number;
  accruedFeesPaid: number;
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
  marketCard: string | null; // this month's market-cycle headline
  revenue: number;
  ownerPayouts: number;
  lease: number;
  debtService: number;
  staffCost: number;
  maintenance: number;
  projects: number;
  refunds: number;
  fines: number;
  feesPaid: number;
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

// --- auctions ----------------------------------------------------------------

export type AuctionLotType = "unit" | "building" | "mandate" | "permit" | "distressed";

export interface AuctionLot {
  id: string;
  type: AuctionLotType;
  areaId: string;
  label: string;
  desc: string;
  units: number;
  reserve: number; // minimum opening bid
  /** distressed lots carry the seized asset (with its baggage) */
  asset?: Asset;
  distressedOf?: number; // bankrupt player id, for flavour
  sellerId?: number; // voluntary sales: proceeds (and unsold lots) go here
  flaws?: string[]; // disclosed problems on distressed lots
}

export interface AuctionPending {
  kind: "auction";
  lot: AuctionLot;
  round: 1 | 2 | 3;
  order: number[]; // solvent players in seat order
  actorIdx: number; // pointer into order
  highBid: number;
  highBidder: number | null;
  passed: number[];
  feed: string[]; // short human-readable bid history for the modal
}

export type PendingAction =
  | { kind: "area"; areaId: string; acted: boolean }
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
  | { kind: "referral"; playerId: number; areaId: string }
  | AuctionPending
  | { kind: "lotConfig"; playerId: number; lot: AuctionLot; paid: number };

export interface LogEntry {
  turn: number;
  playerId: number;
  text: string;
  tone: "good" | "bad" | "neutral" | "money";
}

export interface MarketState {
  ratePm: number;
  rateRises: number;
  bridgeRatePm: number;
  creditTightness: number; // 1 = normal; <1 shrinks credit capacity
  insurancePerUnit: number; // flat monthly cost while active
  crackdownMonths: number; // unlicensed nightly units auto-fined while > 0
  demandSpike: boolean; // boosts stay fees this month
  lastCard: { id: string; title: string; emoji: string; blurb: string } | null;
  globalMods: TempMod[];
  cityMods: Record<string, TempMod[]>;
}

// --- results (post-game stats only — NOT a win condition) ----------------------

export interface FinalResult {
  playerId: number;
  won: boolean;
  bankrupt: boolean;
  survivalMonth: number; // month reached (bankrupt: month of death)
  tombstone: string | null;
  cash: number;
  estate: number; // cash + owned equity, a stat for leaderboards only
  noi: number;
  debt: number;
  unitsLive: number;
  unitsByModel: Record<OpModel, number>;
  unitsControlled: number;
  areasControlled: number;
  citySets: number;
  rentCollected: number;
  bankruptciesCaused: number;
  biggestAuctionWin: string | null;
  biggestWin: string;
  biggestMistake: string;
  strongestArea: string | null;
  archetype: ArchetypeId;
  strategyLabel: string;
  opsUsed: number;
  opsCap: number;
}

export type ArchetypeId =
  | "ruthless"
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
  v: number; // save version (3 = winner-take-all)
  seed: number;
  rngState: number;
  mode: GameMode;
  dailyKey: string | null;
  tiles: Tile[];
  areas: AreaDef[];
  buildingTaken: Record<string, number | null>;
  control: Record<string, number | null>;
  players: PlayerState[];
  current: number; // whose input the game is waiting on (auctions move this)
  turnOwner: number; // whose board-turn it is
  month: number;
  moveOrder: number[];
  turnInMonth: number;
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

/** Market phase: 0 expansion · 1 squeeze · 2 consolidation (endgame pressure). */
export const marketPhase = (month: number): 0 | 1 | 2 =>
  month >= PHASE_CONSOLIDATION_MONTH ? 2 : month >= PHASE_SQUEEZE_MONTH ? 1 : 0;
