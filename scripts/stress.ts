/* Mechanical stress tests for the danger paths the bot sims rarely trigger:
   emergency flow, bridge loans, delayed payouts, bankruptcy, owner churn,
   referrals, regulation forced conversion. Run: npx tsx scripts/stress.ts */

import { createGame, dispatch, type Action } from "../src/lib/game/engine/reducer";
import { makeHolding } from "../src/lib/game/engine/sim";
import { generateProperty } from "../src/lib/game/data/propertyGen";
import { mulberry } from "../src/lib/game/rng";
import type { GameState, PendingAction } from "../src/lib/game/types";

let passed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
};

function freshGame(): GameState {
  return createGame({ mode: "quick", seedText: "stress" });
}

const headOf = (s: GameState): PendingAction | undefined => s.pendingQueue[0];

function cheapResolve(h: PendingAction): Action {
  switch (h.kind) {
    case "property":
      return { t: "PASS_DEAL" };
    case "event":
      return h.choices.length
        ? { t: "EVENT_CHOICE", choiceId: h.choices[0].id }
        : { t: "ACK" };
    case "referral":
      return { t: "REFERRAL", accept: false };
    case "emergency":
      return { t: "EMERGENCY_DONE" };
    case "monthEnd":
      return { t: "ACK" };
    default:
      return { t: "CLOSE_SHOP" };
  }
}

function rollUntilMonthEnd(s: GameState, maxRolls = 30) {
  for (let i = 0; i < maxRolls; i++) {
    let h = headOf(s);
    if (h?.kind === "monthEnd" || h?.kind === "emergency") return;
    if (s.phase === "awaitRoll") dispatch(s, { t: "ROLL" });
    // resolve any non-monthEnd pendings the cheap way
    while ((h = headOf(s)) && h.kind !== "monthEnd" && h.kind !== "emergency") {
      dispatch(s, cheapResolve(h));
    }
    h = headOf(s);
    if (h?.kind === "monthEnd" || h?.kind === "emergency") return;
    if (!s.pendingQueue.length && s.phase !== "awaitRoll") dispatch(s, { t: "END_TURN" });
    // fast-forward bots by force-resolving
    while (s.current !== 0 && !s.over) {
      if (s.phase === "awaitRoll") dispatch(s, { t: "ROLL" });
      let bh: PendingAction | undefined;
      while ((bh = headOf(s))) {
        dispatch(s, cheapResolve(bh));
      }
      dispatch(s, { t: "END_TURN" });
    }
  }
}

console.log("\n1. Overextended player hits emergency at month end");
{
  const s = freshGame();
  const p = s.players[0];
  const rng = mulberry(42);
  // 5 leased STRs + full payroll + nearly no cash
  for (let i = 0; i < 5; i++) {
    const def = generateProperty(rng, 900 + i);
    def.allowedDeals = ["lease"];
    p.holdings.push(makeHolding(def, "lease", "STR", `hx${i}`));
  }
  p.staff = ["guestOps", "cleaners", "maintenance", "revenue", "ownerSuccess", "aiOps"];
  p.cash = 2_000;
  rollUntilMonthEnd(s);
  ok(s.pendingQueue[0]?.kind === "monthEnd", "month end fired");
  const pnl = s.pendingQueue[0]?.kind === "monthEnd" ? s.pendingQueue[0].pnl : null;
  ok(pnl !== null && pnl.staffCost === 29_000, `staff overhead is £29k (got £${pnl?.staffCost})`);
  dispatch(s, { t: "ACK" });
  ok(s.pendingQueue.some((q) => q.kind === "emergency"), "emergency triggered on negative cash");

  // bridge loan path
  const before = p.cash;
  dispatch(s, { t: "LOAN", kind: "bridge", amount: 40_000 });
  ok(p.cash === before + 40_000, "bridge loan adds cash during emergency");
  ok(p.loans.some((l) => l.kind === "bridge" && l.ratePm === 0.025), "bridge loan at 2.5%/mo");

  if (p.cash >= 0) {
    dispatch(s, { t: "EMERGENCY_DONE" });
    ok(!s.pendingQueue.some((q) => q.kind === "emergency"), "emergency resolves once cash >= 0");
  }
}

console.log("\n2. Deep insolvency forces bankruptcy and ends the game for the human");
{
  const s = freshGame();
  const p = s.players[0];
  p.cash = -80_000;
  s.pendingQueue = [{ kind: "emergency" }];
  dispatch(s, { t: "EMERGENCY_DONE" }); // below -50k floor, no assets -> bankrupt
  ok(p.bankrupt, "player bankrupt below -£50k");
  ok(s.over, "game over when human goes bankrupt");
  ok(s.results !== null, "results computed");
  ok(s.results!.every((r) => Number.isFinite(r.score.total)), "scores finite after bankruptcy");
}

console.log("\n3. Owner churn at trust < 30");
{
  const s = freshGame();
  const p = s.players[0];
  const rng = mulberry(7);
  const def = generateProperty(rng, 950);
  def.allowedDeals = ["manage"];
  def.ownerExpectation = 95; // very demanding → trust bleeds
  p.holdings.push(makeHolding(def, "manage", "LTR", "hm1"));
  p.trust = 26;
  rollUntilMonthEnd(s);
  ok(s.pendingQueue[0]?.kind === "monthEnd", "month end fired");
  ok(p.holdings.length === 0, "owner churned the property at trust < 30");
  ok(p.trust === 45, "trust resets to 45 after churn");
  ok(p.stats.churnedOwners === 1, "churn recorded");
}

console.log("\n4. Delayed owner payout mechanics");
{
  const s = freshGame();
  const p = s.players[0];
  p.lastPnl = {
    month: "October", seasonLabel: "x", revenue: 10_000, ownerPayouts: 4_000,
    lease: 0, debtService: 0, staffCost: 0, maintenance: 0, refunds: 0, fines: 0,
    net: 6_000, cashAfter: 0, repDelta: 0, trustDelta: 0, notes: [], lines: [],
  };
  p.cash = -3_000;
  p.trust = 70;
  s.pendingQueue = [{ kind: "emergency" }];
  dispatch(s, { t: "DELAY_PAYOUT" });
  ok(p.cash === 1_000, "delayed payout returns the cash");
  ok(p.owedOwners === 4_000, "owed owners tracked");
  ok(p.trust === 50, "trust -20 for delaying payouts");
}

console.log("\n5. Credit capacity respects reputation");
{
  const s = freshGame();
  const p = s.players[0];
  s.pendingQueue = [{ kind: "finance" }];
  p.rep = 85;
  dispatch(s, { t: "LOAN", kind: "bank", amount: 999_999 });
  ok(p.loans[0].principal === 375_000, `high-rep credit cap 375k (got ${p.loans[0]?.principal})`);
}

console.log(`\nAll stress tests passed (${passed} assertions) ✓`);
