// ---------------------------------------------------------------------------
// Leaderboards V3. Winning means surviving — boards rank wins and survival
// first; money is just the tiebreak. Storage stays behind ScoreStore so a
// Supabase implementation can drop in later.
// ---------------------------------------------------------------------------

import type { ArchetypeId, FinalResult, GameState, PlayerState } from "./types";

export interface SavedRun {
  id: string;
  nickname: string;
  dateISO: string;
  mode: "quick" | "daily";
  dailyKey: string | null;
  won: boolean;
  monthsSurvived: number;
  estate: number; // cash + owned equity (post-game stat, not a win condition)
  archetype: ArchetypeId;
  strategyLabel: string;
  noi: number;
  trust: number;
  rep: number;
  emergencies: number;
  bankruptciesCaused: number;
  bankruptTurn: number | null;
  strShare: number;
  isMock?: boolean;
}

export interface ScoreStore {
  list(): SavedRun[];
  add(run: SavedRun): void;
}

const KEY = "rr.runs.v3";

class LocalScoreStore implements ScoreStore {
  list(): SavedRun[] {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as SavedRun[];
    } catch {
      return [];
    }
  }
  add(run: SavedRun) {
    const runs = this.list();
    runs.push(run);
    window.localStorage.setItem(KEY, JSON.stringify(runs.slice(-200)));
  }
}

export const scoreStore: ScoreStore = new LocalScoreStore();

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dailyNumber(): number {
  const start = Date.UTC(2026, 0, 1);
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

export function buildRun(
  state: GameState,
  p: PlayerState,
  result: FinalResult,
  nickname: string,
): SavedRun {
  const s = p.stats;
  const totalRev = s.strRevenue + s.mtrRevenue + s.ltrRevenue;
  return {
    id: `run_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    nickname,
    dateISO: new Date().toISOString(),
    mode: state.mode,
    dailyKey: state.dailyKey,
    won: result.won,
    monthsSurvived: result.survivalMonth,
    estate: result.estate,
    archetype: result.archetype,
    strategyLabel: result.strategyLabel,
    noi: result.noi,
    trust: p.trust,
    rep: p.rep,
    emergencies: s.emergencies,
    bankruptciesCaused: result.bankruptciesCaused,
    bankruptTurn: p.bankruptTurn,
    strShare: totalRev > 0 ? s.strRevenue / totalRev : 0,
  };
}

// --- mock field --------------------------------------------------------------

const mock = (
  nickname: string,
  won: boolean,
  months: number,
  estate: number,
  archetype: ArchetypeId,
  extra: Partial<SavedRun> = {},
): SavedRun => ({
  id: `mock_${nickname}`,
  nickname,
  dateISO: "2026-06-01T12:00:00Z",
  mode: "quick",
  dailyKey: null,
  won,
  monthsSurvived: months,
  estate,
  archetype,
  strategyLabel: "Balanced operator",
  noi: Math.round(estate / 60),
  trust: 70,
  rep: 70,
  emergencies: won ? 0 : 1,
  bankruptciesCaused: won ? 1 : 0,
  bankruptTurn: won ? null : months,
  strShare: 0.5,
  isMock: true,
  ...extra,
});

export const MOCK_RUNS: SavedRun[] = [
  mock("TurnoverTina", true, 14, 442_000, "ruthless", { bankruptciesCaused: 2, strShare: 0.82 }),
  mock("LeaseLordLou", true, 19, 381_500, "cashflowBeast", { noi: 14_100 }),
  mock("Adriana ADR", true, 12, 356_000, "strKing", { strShare: 0.78 }),
  mock("The Leith Lion", true, 23, 318_300, "opsMachine"),
  mock("FiveStarFifi", true, 17, 287_750, "ownerWhisperer", { trust: 93 }),
  mock("PortfolioPat", true, 26, 261_900, "boringBillionaire", { strShare: 0.2 }),
  mock("OccupancyOllie", true, 21, 238_400, "cashflowBeast", { noi: 9_700 }),
  mock("PennyPincherPru", true, 28, 212_000, "safeOperator", { strShare: 0.12, trust: 81 }),
  mock("VoidPeriodVic", false, 22, 140_800, "safeOperator", { strShare: 0.2 }),
  mock("RegRiskRaj", false, 16, 83_200, "regulationVictim", { strShare: 0.74 }),
  mock("MidTermMo", false, 13, 38_000, "chaosSurvivor", { emergencies: 2 }),
  mock("ChurnedCharlie", false, 11, 6_500, "badReviewMagnet", { trust: 38, rep: 39 }),
  mock("BridgeLoanBarry", false, 9, 0, "overleveraged", { emergencies: 3 }),
  mock("HotTubHubris", false, 6, 0, "chaosSurvivor", { emergencies: 2 }),
  mock("GaryGuarantee", false, 4, 0, "overleveraged", { emergencies: 4 }),
];

// --- boards -------------------------------------------------------------------

export type BoardId =
  | "overall"
  | "daily"
  | "strKing"
  | "safest"
  | "cashflow"
  | "fastBankrupt"
  | "ownerTrust";

export interface BoardDef {
  id: BoardId;
  name: string;
  emoji: string;
  metricLabel: string;
  eligible: (r: SavedRun) => boolean;
  sortKey: (r: SavedRun) => number;
  metric: (r: SavedRun) => string;
}

const gbpShort = (n: number) => {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${Math.round(abs / 1000)}k`;
  return `${sign}£${abs}`;
};

const survival = (r: SavedRun) =>
  (r.won ? 1_000_000 : 0) + r.monthsSurvived * 1_000 + Math.min(999, Math.max(0, r.estate / 1000));

const winsMetric = (r: SavedRun) =>
  r.won ? `WON · m${r.monthsSurvived} · ${gbpShort(r.estate)}` : `out m${r.monthsSurvived}`;

export const BOARDS: BoardDef[] = [
  {
    id: "overall",
    name: "Overall",
    emoji: "🏆",
    metricLabel: "Wins, then survival",
    eligible: () => true,
    sortKey: survival,
    metric: winsMetric,
  },
  {
    id: "daily",
    name: "Daily Challenge",
    emoji: "📅",
    metricLabel: "Wins, then survival",
    eligible: (r) => r.mode === "daily" && r.dailyKey === todayKey(),
    sortKey: survival,
    metric: winsMetric,
  },
  {
    id: "strKing",
    name: "STR King",
    emoji: "👑",
    metricLabel: "Wins with 60%+ STR",
    eligible: (r) => r.strShare >= 0.6,
    sortKey: survival,
    metric: winsMetric,
  },
  {
    id: "safest",
    name: "Safest Operator",
    emoji: "🛡️",
    metricLabel: "Wins with zero crises",
    eligible: (r) => r.emergencies === 0 && r.won,
    sortKey: survival,
    metric: (r) => `m${r.monthsSurvived} · 0 crises`,
  },
  {
    id: "cashflow",
    name: "Cashflow Beast",
    emoji: "🐂",
    metricLabel: "Monthly NOI at the end",
    eligible: (r) => r.bankruptTurn === null,
    sortKey: (r) => r.noi,
    metric: (r) => `${gbpShort(r.noi)}/mo`,
  },
  {
    id: "fastBankrupt",
    name: "Fastest Bankruptcy",
    emoji: "💀",
    metricLabel: "Months survived",
    eligible: (r) => r.bankruptTurn !== null,
    sortKey: (r) => -(r.bankruptTurn ?? 99),
    metric: (r) => `month ${r.bankruptTurn}`,
  },
  {
    id: "ownerTrust",
    name: "Best Owner Trust",
    emoji: "🤝",
    metricLabel: "Owner trust",
    eligible: (r) => r.bankruptTurn === null,
    sortKey: (r) => r.trust * 1_000_000 + survival(r),
    metric: (r) => `${r.trust}/100`,
  },
];

export interface BoardRow {
  rank: number;
  run: SavedRun;
  isYou: boolean;
}

export function boardRows(boardId: BoardId, highlightRunId?: string): BoardRow[] {
  const def = BOARDS.find((b) => b.id === boardId)!;
  const all = [...MOCK_RUNS, ...scoreStore.list()].filter(def.eligible);
  all.sort((a, b) => def.sortKey(b) - def.sortKey(a));
  return all.slice(0, 50).map((run, i) => ({
    rank: i + 1,
    run,
    isYou: run.id === highlightRunId,
  }));
}

export function rankOnBoard(boardId: BoardId, run: SavedRun): number | null {
  const def = BOARDS.find((b) => b.id === boardId)!;
  if (!def.eligible(run)) return null;
  const all = [...MOCK_RUNS, ...scoreStore.list().filter((r) => r.id !== run.id), run].filter(
    def.eligible,
  );
  all.sort((a, b) => def.sortKey(b) - def.sortKey(a));
  return all.findIndex((r) => r.id === run.id) + 1;
}
