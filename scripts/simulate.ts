/* Headless V3 harness: winner-take-all. Plays full bot-only games and asserts
   the elimination invariants. Run: npx tsx scripts/simulate.ts [games] [--verbose] */

import { createGame, dispatch, type Action } from "../src/lib/game/engine/reducer";
import { botActionsFor } from "../src/lib/game/bots";
import type { GameState } from "../src/lib/game/types";
import { ARCHETYPES } from "../src/lib/game/engine/score";
import { liveUnitValue } from "../src/lib/game/engine/sim";

const N = Number(process.argv[2] ?? 200);
const VERBOSE = process.argv.includes("--verbose");
const HARD_MONTH_CAP = 60; // balance must end games long before this

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

  while (!s.over && steps++ < 60_000 && s.month <= HARD_MONTH_CAP) {
    if (s.phase === "awaitRoll") {
      dispatch(s, { t: "ROLL" });
      continue;
    }
    if (s.pendingQueue.length === 0) {
      dispatch(s, { t: "END_TURN" });
      continue;
    }
    const h = s.pendingQueue[0];
    const sig = JSON.stringify([
      s.current,
      h?.kind,
      h?.kind === "auction" ? `${h.round}:${h.actorIdx}:${h.highBid}:${h.passed.length}` : "",
      s.players[s.current].cash,
      s.pendingQueue.length,
      s.month,
    ]);
    sameSig = sig === lastSig ? sameSig + 1 : 0;
    lastSig = sig;
    if (sameSig > 14) {
      const force: Action =
        h.kind === "area"
          ? { t: "CLOSE_AREA" }
          : h.kind === "emergency"
            ? { t: "DECLARE_BANKRUPTCY" }
            : h.kind === "referral"
              ? { t: "REFERRAL", accept: false }
              : h.kind === "auction"
                ? { t: "AUCTION_PASS" }
                : h.kind === "lotConfig"
                  ? { t: "LOT_CONFIG", model: "MTR", furnish: "fast", withLicence: false }
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

let stalls = 0;
let unfinished = 0;
let badWinnerGames = 0;
let auctionsTotal = 0;
let distressedSeen = 0;
let permitsWon = 0;
const endMonths: number[] = [];
const winnerNames = new Map<string, number>();
const archCount = new Map<string, number>();
const pnlIdentityErrors: string[] = [];
const controlErrors: string[] = [];

for (let i = 0; i < N; i++) {
  const seed = `sim-${i}`;
  const { state: s, stalled } = playGame(seed);
  if (stalled) stalls++;
  if (!s.over) {
    unfinished++;
    console.log(`  !! unfinished: ${seed} reached month ${s.month}`);
    continue;
  }
  if (!s.results) throw new Error(`no results (seed ${seed})`);

  // THE invariant: exactly one solvent player, and they are the winner
  const solvent = s.players.filter((p) => !p.bankrupt);
  if (solvent.length !== 1 || s.winnerId !== solvent[0].id) badWinnerGames++;

  endMonths.push(s.month);
  const w = s.players[s.winnerId!];
  winnerNames.set(w.name, (winnerNames.get(w.name) ?? 0) + 1);

  for (const area of s.areas) {
    const c = s.control[area.id];
    if (c === null) continue;
    const cv = liveUnitValue(s, c, area.id);
    for (const p of s.players) {
      if (p.id === c) continue;
      if (liveUnitValue(s, p.id, area.id) > cv)
        controlErrors.push(`seed ${seed} area ${area.id}`);
    }
  }

  for (const r of s.results) {
    const p = s.players[r.playerId];
    assertFinite(p.cash, "cash", seed);
    assertFinite(r.estate, "estate", seed);
    assertFinite(r.noi, "noi", seed);
    auctionsTotal += p.stats.auctionsWon;
    permitsWon += p.permits.length;
    archCount.set(r.archetype, (archCount.get(r.archetype) ?? 0) + 1);
    if (p.stats.biggestAuctionWin) distressedSeen++;

    if (p.lastPnl) {
      const l = p.lastPnl;
      const recon =
        l.revenue + l.feesEarned - l.ownerPayouts - l.lease - l.debtService - l.staffCost -
        l.maintenance - l.projects - l.refunds - l.fines - l.feesPaid;
      if (Math.abs(recon - l.net) > 2)
        pnlIdentityErrors.push(`seed ${seed} p${p.id}: net ${l.net} vs recon ${recon}`);
    }
  }
}

endMonths.sort((a, b) => a - b);
const q = (arr: number[], p: number) => arr[Math.floor(p * (arr.length - 1))] ?? 0;

console.log(`\n=== Rental Rush V3 simulation: ${N} games ===`);
console.log(`unfinished: ${unfinished}   stalled: ${stalls}   bad-winner games: ${badWinnerGames}   control errors: ${controlErrors.length}`);
console.log(`game length (months) p10/p50/p90/max: ${q(endMonths, 0.1)} / ${q(endMonths, 0.5)} / ${q(endMonths, 0.9)} / ${endMonths[endMonths.length - 1] ?? "-"}`);
console.log(`winners: ${[...winnerNames.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`auction wins/game: ${(auctionsTotal / Math.max(1, N - unfinished)).toFixed(2)}   permits won: ${permitsWon}   distressed steals: ${distressedSeen}`);
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
  s.log.forEach((l) => console.log(`[m${String(l.turn).padStart(2)}] ${l.text}`));
  s.results?.forEach((r) => {
    const p = s.players[r.playerId];
    console.log(
      `${p.name.padEnd(5)} ${r.won ? "WINNER" : `out m${r.survivalMonth}`}  cash £${Math.round(p.cash / 1000)}k  units ${r.unitsLive}  areas ${r.areasControlled}  sets ${r.citySets}  kills ${r.bankruptciesCaused}  arch ${r.archetype}`,
    );
    if (r.tombstone) console.log(`      🪦 ${r.tombstone}`);
  });
}

const fail =
  unfinished > 0 ||
  badWinnerGames > 0 ||
  pnlIdentityErrors.length > 0 ||
  controlErrors.length > 0 ||
  stalls > N * 0.02;
if (fail) {
  console.error("\nSIMULATION FAILED");
  process.exit(1);
}
console.log("\nOK ✓");
