/* Headless game harness: plays full bot-only games and asserts invariants.
   Run: npx tsx scripts/simulate.ts [games] [--verbose] */

import { createGame, dispatch, type Action } from "../src/lib/game/engine/reducer";
import { botActionsFor } from "../src/lib/game/bots";
import type { GameState } from "../src/lib/game/types";
import { ARCHETYPES } from "../src/lib/game/engine/score";

const N = Number(process.argv[2] ?? 200);
const VERBOSE = process.argv.includes("--verbose");

interface Outcome {
  state: GameState;
  steps: number;
  stalled: boolean;
}

function playGame(seedText: string): Outcome {
  const s = createGame({ mode: "quick", seedText });
  let steps = 0;
  let lastSig = "";
  let sameSig = 0;

  while (!s.over && steps++ < 4000) {
    if (s.phase === "awaitRoll") {
      dispatch(s, { t: "ROLL" });
      continue;
    }
    if (s.pendingQueue.length === 0) {
      dispatch(s, { t: "END_TURN" });
      continue;
    }
    const sig = JSON.stringify([
      s.current,
      s.pendingQueue[0]?.kind,
      s.players[s.current].cash,
      s.pendingQueue.length,
    ]);
    sameSig = sig === lastSig ? sameSig + 1 : 0;
    lastSig = sig;
    if (sameSig > 12) {
      // stall breaker — force-resolve
      const head = s.pendingQueue[0];
      const force: Action =
        head.kind === "property"
          ? { t: "PASS_DEAL" }
          : head.kind === "emergency"
            ? { t: "DECLARE_BANKRUPTCY" }
            : head.kind === "referral"
              ? { t: "REFERRAL", accept: false }
              : head.kind === "hiring" || head.kind === "finance" || head.kind === "upgrade"
                ? { t: "CLOSE_SHOP" }
                : { t: "ACK" };
      dispatch(s, force);
      return { state: s, steps, stalled: true };
    }
    for (const a of botActionsFor(s)) {
      dispatch(s, a);
      if (s.over) break;
    }
  }
  return { state: s, steps, stalled: false };
}

const assertFinite = (n: number, label: string, seed: string) => {
  if (!Number.isFinite(n)) throw new Error(`NaN/∞ in ${label} (seed ${seed}): ${n}`);
};

let bankruptcies = 0;
let stalls = 0;
let unfinished = 0;
let totalProps = 0;
let totalMonths = 0;
let emergencies = 0;
let noDealPlayers = 0;
let negMonths = 0;
let allMonths = 0;
const minCashes: number[] = [];
const worstNets: number[] = [];
const scores: number[] = [];
const noises: number[] = [];
const archCount = new Map<string, number>();
const pnlIdentityErrors: string[] = [];

for (let i = 0; i < N; i++) {
  const seed = `sim-${i}`;
  const { state: s, stalled } = playGame(seed);
  if (stalled) stalls++;
  if (!s.over) {
    unfinished++;
    continue;
  }
  if (!s.results) throw new Error(`no results (seed ${seed})`);
  for (const r of s.results) {
    const p = s.players[r.playerId];
    for (const [k, v] of Object.entries(r.score)) assertFinite(v as number, `score.${k}`, seed);
    assertFinite(p.cash, "cash", seed);
    scores.push(r.score.total);
    noises.push(r.score.noi);
    if (p.bankrupt) bankruptcies++;
    totalProps += p.holdings.length + p.stats.propertiesSold + p.stats.churnedOwners;
    totalMonths += p.monthsDone;
    emergencies += p.stats.emergencies;
    if (p.holdings.length === 0 && p.stats.propertiesSold === 0 && !p.bankrupt) noDealPlayers++;
    archCount.set(r.archetype, (archCount.get(r.archetype) ?? 0) + 1);
    minCashes.push(Math.min(...p.cashHistory));
    if (Number.isFinite(p.stats.worstMonthNet)) {
      worstNets.push(p.stats.worstMonthNet);
      negMonths += p.cashHistory.length; // placeholder, replaced below
    }
    allMonths += p.monthsDone;

    if (p.lastPnl) {
      const l = p.lastPnl;
      const recon =
        l.revenue - l.ownerPayouts - l.lease - l.debtService - l.staffCost - l.maintenance - l.refunds - l.fines;
      if (Math.abs(recon - l.net) > 2)
        pnlIdentityErrors.push(`seed ${seed} p${p.id}: net ${l.net} vs recon ${recon}`);
    }
  }
}

scores.sort((a, b) => a - b);
const q = (p: number) => scores[Math.floor(p * (scores.length - 1))];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

console.log(`\n=== Rental Rush simulation: ${N} games (${scores.length} player-results) ===`);
console.log(`unfinished games: ${unfinished}   stalled: ${stalls}`);
console.log(`bankruptcy rate: ${((bankruptcies / scores.length) * 100).toFixed(1)}%`);
console.log(`emergencies/player: ${(emergencies / scores.length).toFixed(2)}`);
console.log(`players who never did a deal: ${noDealPlayers} (${((noDealPlayers / scores.length) * 100).toFixed(1)}%)`);
console.log(`avg properties touched/player: ${(totalProps / scores.length).toFixed(2)}`);
console.log(`avg months simulated/player: ${(totalMonths / scores.length).toFixed(2)}`);
console.log(`score p10/p50/p90: £${Math.round(q(0.1) / 1000)}k / £${Math.round(q(0.5) / 1000)}k / £${Math.round(q(0.9) / 1000)}k`);
console.log(`mean NOI: £${Math.round(mean(noises))}/mo`);
minCashes.sort((a, b) => a - b);
worstNets.sort((a, b) => a - b);
const qq = (arr: number[], p: number) => arr[Math.floor(p * (arr.length - 1))] ?? 0;
console.log(`min cash p1/p10/p50: £${Math.round(qq(minCashes, 0.01) / 1000)}k / £${Math.round(qq(minCashes, 0.1) / 1000)}k / £${Math.round(qq(minCashes, 0.5) / 1000)}k`);
console.log(`worst month net p1/p10/p50: £${Math.round(qq(worstNets, 0.01))} / £${Math.round(qq(worstNets, 0.1))} / £${Math.round(qq(worstNets, 0.5))}`);
void negMonths; void allMonths;
console.log(`archetypes:`);
for (const [k, v] of [...archCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ARCHETYPES[k as keyof typeof ARCHETYPES].name.padEnd(22)} ${v}`);
}
if (pnlIdentityErrors.length) {
  console.log(`\n!! P&L identity errors (${pnlIdentityErrors.length}):`);
  pnlIdentityErrors.slice(0, 5).forEach((e) => console.log("   " + e));
}

if (VERBOSE) {
  const { state: s } = playGame("sim-demo");
  console.log("\n--- sample game log (sim-demo) ---");
  s.log.forEach((l) => console.log(`[t${String(l.turn).padStart(2)}] ${l.text}`));
  s.results?.forEach((r) => {
    const p = s.players[r.playerId];
    console.log(
      `${p.name.padEnd(5)} score £${Math.round(r.score.total / 1000)}k  cash £${Math.round(p.cash / 1000)}k  noi £${r.score.noi}/mo  props ${p.holdings.length}  arch ${r.archetype}${p.bankrupt ? "  BANKRUPT" : ""}`,
    );
  });
}

const fail =
  unfinished > 0 ||
  pnlIdentityErrors.length > 0 ||
  scores.some((s) => !Number.isFinite(s)) ||
  stalls > N * 0.02;
if (fail) {
  console.error("\nSIMULATION FAILED");
  process.exit(1);
}
console.log("\nOK ✓");
