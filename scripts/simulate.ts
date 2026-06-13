/* Headless V2 harness: plays full bot-only games and asserts invariants.
   Run: npx tsx scripts/simulate.ts [games] [--verbose] */

import { createGame, dispatch, type Action } from "../src/lib/game/engine/reducer";
import { botActionsFor } from "../src/lib/game/bots";
import type { GameState } from "../src/lib/game/types";
import { ARCHETYPES } from "../src/lib/game/engine/score";
import { liveUnitValue } from "../src/lib/game/engine/sim";

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

  while (!s.over && steps++ < 6000) {
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
      s.month,
    ]);
    sameSig = sig === lastSig ? sameSig + 1 : 0;
    lastSig = sig;
    if (sameSig > 14) {
      const h = s.pendingQueue[0];
      const force: Action =
        h.kind === "area"
          ? { t: "CLOSE_AREA" }
          : h.kind === "emergency"
            ? { t: "DECLARE_BANKRUPTCY" }
            : h.kind === "referral"
              ? { t: "REFERRAL", accept: false }
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
let totalAssets = 0;
let totalUnitsLive = 0;
let buildings = 0;
let hotels = 0;
let licApplied = 0;
let emergencies = 0;
let stayFeesTotal = 0;
let controlledAreas = 0;
const minCashes: number[] = [];
const scores: number[] = [];
const noises: number[] = [];
const archCount = new Map<string, number>();
const pnlIdentityErrors: string[] = [];
const controlErrors: string[] = [];

for (let i = 0; i < N; i++) {
  const seed = `sim-${i}`;
  const { state: s, stalled } = playGame(seed);
  if (stalled) stalls++;
  if (!s.over) {
    unfinished++;
    continue;
  }
  if (!s.results) throw new Error(`no results (seed ${seed})`);

  // control invariant: controller has the max live unit value
  for (const area of s.areas) {
    const c = s.control[area.id];
    if (c === null) continue;
    const cv = liveUnitValue(s, c, area.id);
    for (const p of s.players) {
      if (p.id === c) continue;
      const v = liveUnitValue(s, p.id, area.id);
      if (v > cv) controlErrors.push(`seed ${seed} area ${area.id}: ${p.id} (${v}) > controller ${c} (${cv})`);
    }
    controlledAreas++;
  }

  for (const r of s.results) {
    const p = s.players[r.playerId];
    for (const [k, v] of Object.entries(r.score)) assertFinite(v as number, `score.${k}`, seed);
    assertFinite(p.cash, "cash", seed);
    scores.push(r.score.total);
    noises.push(r.score.noi);
    if (p.bankrupt) bankruptcies++;
    totalAssets += p.assets.length + p.stats.assetsSold + p.stats.churnedOwners;
    totalUnitsLive += r.unitsLive;
    buildings += p.assets.filter((a) => a.kind === "building").length;
    hotels += p.assets.filter((a) => a.model === "HOTEL").length;
    licApplied += p.stats.licencesWon + p.stats.licencesRejected;
    emergencies += p.stats.emergencies;
    stayFeesTotal += p.stats.stayFeesPaid;
    minCashes.push(Math.min(...p.cashHistory));
    archCount.set(r.archetype, (archCount.get(r.archetype) ?? 0) + 1);

    if (p.lastPnl) {
      const l = p.lastPnl;
      const recon =
        l.revenue + l.feesEarned - l.ownerPayouts - l.lease - l.debtService - l.staffCost -
        l.maintenance - l.projects - l.refunds - l.fines - l.feesPaid;
      if (Math.abs(recon - l.net) > 2)
        pnlIdentityErrors.push(`seed ${seed} p${p.id}: net ${l.net} vs recon ${recon}`);
    }
    if (p.monthsDone !== (p.bankrupt ? p.monthsDone : 10) && !p.bankrupt)
      pnlIdentityErrors.push(`seed ${seed} p${p.id}: monthsDone ${p.monthsDone} != 10`);
  }
}

scores.sort((a, b) => a - b);
minCashes.sort((a, b) => a - b);
const q = (arr: number[], p: number) => arr[Math.floor(p * (arr.length - 1))] ?? 0;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const n = scores.length;

console.log(`\n=== Rental Rush V2 simulation: ${N} games (${n} player-results) ===`);
console.log(`unfinished: ${unfinished}   stalled: ${stalls}   control errors: ${controlErrors.length}`);
console.log(`bankruptcy rate: ${((bankruptcies / n) * 100).toFixed(1)}%   emergencies/player: ${(emergencies / n).toFixed(2)}`);
console.log(`assets touched/player: ${(totalAssets / n).toFixed(2)}   live units/player: ${(totalUnitsLive / n).toFixed(2)}`);
console.log(`buildings held: ${(buildings / n).toFixed(2)}/player   hotels: ${(hotels / n).toFixed(2)}   licence outcomes: ${(licApplied / n).toFixed(2)}`);
console.log(`stay fees paid/player: £${Math.round(stayFeesTotal / n)}`);
console.log(`controlled areas/game: ${(controlledAreas / Math.max(1, N - unfinished)).toFixed(1)}/16`);
console.log(`score p10/p50/p90: £${Math.round(q(scores, 0.1) / 1000)}k / £${Math.round(q(scores, 0.5) / 1000)}k / £${Math.round(q(scores, 0.9) / 1000)}k`);
console.log(`mean NOI: £${Math.round(mean(noises))}/mo   min-cash p1/p10: £${Math.round(q(minCashes, 0.01) / 1000)}k / £${Math.round(q(minCashes, 0.1) / 1000)}k`);
console.log(`archetypes:`);
for (const [k, v] of [...archCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ARCHETYPES[k as keyof typeof ARCHETYPES].name.padEnd(22)} ${v}`);
}
if (pnlIdentityErrors.length) {
  console.log(`\n!! P&L identity errors (${pnlIdentityErrors.length}):`);
  pnlIdentityErrors.slice(0, 5).forEach((e) => console.log("   " + e));
}
if (controlErrors.length) {
  console.log(`\n!! control errors:`);
  controlErrors.slice(0, 5).forEach((e) => console.log("   " + e));
}

if (VERBOSE) {
  const { state: s } = playGame("sim-demo");
  console.log("\n--- sample game log (sim-demo) ---");
  s.log.forEach((l) => console.log(`[m${String(l.turn).padStart(2)}] ${l.text}`));
  s.results?.forEach((r) => {
    const p = s.players[r.playerId];
    console.log(
      `${p.name.padEnd(5)} score £${Math.round(r.score.total / 1000)}k  cash £${Math.round(p.cash / 1000)}k  noi £${r.score.noi}/mo  assets ${p.assets.length} (${r.unitsLive} live units)  areas ${r.areasControlled}  arch ${r.archetype}${p.bankrupt ? "  BANKRUPT" : ""}`,
    );
  });
}

const fail =
  unfinished > 0 ||
  pnlIdentityErrors.length > 0 ||
  controlErrors.length > 0 ||
  scores.some((s) => !Number.isFinite(s)) ||
  stalls > N * 0.02;
if (fail) {
  console.error("\nSIMULATION FAILED");
  process.exit(1);
}
console.log("\nOK ✓");
