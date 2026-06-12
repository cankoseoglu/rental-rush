// ---------------------------------------------------------------------------
// Leaderboards. V1 stores runs in localStorage behind a tiny store interface
// so a Supabase implementation can drop in later (see ScoreStore).
// ---------------------------------------------------------------------------

import type { ArchetypeId, FinalResult, GameState, PlayerState } from "./types";

export interface SavedRun {
  id: string;
  nickname: string;
  dateISO: string;
  mode: "quick" | "daily";
  dailyKey: string | null;
  score: number;
  archetype: ArchetypeId;
  strategyLabel: string;
  noi: number;
  trust: number;
  rep: number;
  emergencies: number;
  bankruptTurn: number | null;
  strShare: number; // 0-1
  isMock?: boolean;
}

export interface ScoreStore {
  list(): SavedRun[];
  add(run: SavedRun): void;
}

const KEY = "rr.runs.v1";

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

// Swap for a SupabaseScoreStore later without touching the UI.
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
    score: result.score.total,
    archetype: result.archetype,
    strategyLabel: result.strategyLabel,
    noi: result.score.noi,
    trust: p.trust,
    rep: p.rep,
    emergencies: s.emergencies,
    bankruptTurn: p.bankruptTurn,
    strShare: totalRev > 0 ? s.strRevenue / totalRev : 0,
  };
}

// --- mock field --------------------------------------------------------------

const mock = (
  nickname: string,
  score: number,
  archetype: ArchetypeId,
  extra: Partial<SavedRun> = {},
): SavedRun => ({
  id: `mock_${nickname}`,
  nickname,
  dateISO: "2026-06-01T12:00:00Z",
  mode: "quick",
  dailyKey: null,
  score,
  archetype,
  strategyLabel: "Balanced operator",
  noi: Math.round(score / 80),
  trust: 70,
  rep: 70,
  emergencies: 0,
  bankruptTurn: null,
  strShare: 0.5,
  isMock: true,
  ...extra,
});

export const MOCK_RUNS: SavedRun[] = [
  mock("TurnoverTina", 684_000, "strKing", { strShare: 0.86, noi: 14_400 }),
  mock("LeaseLordLou", 598_500, "cashflowBeast", { noi: 16_100, emergencies: 1 }),
  mock("Adriana ADR", 521_300, "strKing", { strShare: 0.78, noi: 11_900 }),
  mock("The Leith Lion", 484_700, "opsMachine", { noi: 10_200 }),
  mock("FiveStarFifi", 452_900, "ownerWhisperer", { trust: 93, noi: 8_800 }),
  mock("PortfolioPat", 411_000, "boringBillionaire", { noi: 6_900 }),
  mock("OccupancyOllie", 376_400, "cashflowBeast", { noi: 9_700, strShare: 0.61 }),
  mock("PennyPincherPru", 341_200, "safeOperator", { strShare: 0.12, noi: 5_200, trust: 81 }),
  mock("VoidPeriodVic", 308_800, "safeOperator", { strShare: 0.2, noi: 4_600 }),
  mock("RegRiskRaj", 263_500, "regulationVictim", { strShare: 0.74, emergencies: 1 }),
  mock("MidTermMo", 229_000, "safeOperator", { strShare: 0.18, noi: 3_900, trust: 84 }),
  mock("ChurnedCharlie", 174_500, "badReviewMagnet", { trust: 38, rep: 39 }),
  mock("BridgeLoanBarry", -38_000, "overleveraged", { emergencies: 3, bankruptTurn: 9 }),
  mock("HotTubHubris", -150_000, "chaosSurvivor", { emergencies: 2, bankruptTurn: 6 }),
  mock("GaryGuarantee", -150_000, "overleveraged", { emergencies: 4, bankruptTurn: 4 }),
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
  sortKey: (r: SavedRun) => number; // higher = better
  metric: (r: SavedRun) => string;
}

const gbpShort = (n: number) => {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${Math.round(abs / 1000)}k`;
  return `${sign}£${abs}`;
};

export const BOARDS: BoardDef[] = [
  {
    id: "overall",
    name: "Overall",
    emoji: "🏆",
    metricLabel: "Empire score",
    eligible: () => true,
    sortKey: (r) => r.score,
    metric: (r) => gbpShort(r.score),
  },
  {
    id: "daily",
    name: "Daily Challenge",
    emoji: "📅",
    metricLabel: "Empire score",
    eligible: (r) => r.mode === "daily" && r.dailyKey === todayKey(),
    sortKey: (r) => r.score,
    metric: (r) => gbpShort(r.score),
  },
  {
    id: "strKing",
    name: "STR King",
    emoji: "👑",
    metricLabel: "Score (60%+ STR)",
    eligible: (r) => r.strShare >= 0.6,
    sortKey: (r) => r.score,
    metric: (r) => gbpShort(r.score),
  },
  {
    id: "safest",
    name: "Safest Operator",
    emoji: "🛡️",
    metricLabel: "Score, zero emergencies",
    eligible: (r) => r.emergencies === 0 && r.bankruptTurn === null,
    sortKey: (r) => r.score,
    metric: (r) => gbpShort(r.score),
  },
  {
    id: "cashflow",
    name: "Cashflow Beast",
    emoji: "🐂",
    metricLabel: "Monthly NOI",
    eligible: (r) => r.bankruptTurn === null,
    sortKey: (r) => r.noi,
    metric: (r) => `${gbpShort(r.noi)}/mo`,
  },
  {
    id: "fastBankrupt",
    name: "Fastest Bankruptcy",
    emoji: "💀",
    metricLabel: "Turns survived",
    eligible: (r) => r.bankruptTurn !== null,
    sortKey: (r) => -(r.bankruptTurn ?? 99),
    metric: (r) => `turn ${r.bankruptTurn}`,
  },
  {
    id: "ownerTrust",
    name: "Best Owner Trust",
    emoji: "🤝",
    metricLabel: "Owner trust",
    eligible: (r) => r.bankruptTurn === null,
    sortKey: (r) => r.trust * 1_000_000 + r.score,
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
