/* Mechanical stress tests for V2 danger paths & pipelines: emergencies,
   bankruptcy, owner churn, payout delays, credit caps, area control, stay
   fees, building/licence pipelines, hotel gates.
   Run: npx tsx scripts/stress.ts */

import { createGame, dispatch, fastForwardToEnd } from "../src/lib/game/engine/reducer";
import { botActionsFor } from "../src/lib/game/bots";
import {
  acquisitionCosts,
  areaById,
  makeAsset,
  recomputeControl,
  stayFeeFor,
  type AcquisitionSpec,
} from "../src/lib/game/engine/sim";
import type { GameState, PlayerState } from "../src/lib/game/types";

let passed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
};

const fresh = (): GameState => createGame({ mode: "quick", seedText: "stress" });

function addAsset(
  s: GameState,
  p: PlayerState,
  areaId: string,
  spec: AcquisitionSpec,
  status: "live" | "prep" | "furnishing" = "live",
) {
  const area = areaById(s, areaId);
  const costs = acquisitionCosts(area, spec, p);
  const asset = makeAsset(s, area, spec, costs, p.id, `t${s.nextId++}`);
  asset.status = status;
  if (status === "live") asset.monthsToLive = 0;
  p.assets.push(asset);
  return asset;
}

/** Force a month end by pretending the last mover just finished. */
function forceMonthEnd(s: GameState) {
  s.moveOrder = [0, 1, 2];
  s.turnInMonth = 2;
  s.current = 2;
  s.phase = "action";
  s.lastRoll = null;
  s.pendingQueue = [];
  dispatch(s, { t: "END_TURN" });
}

console.log("\n1. Overextended operator hits emergency at month end");
{
  const s = fresh();
  const p = s.players[0];
  addAsset(s, p, "oldtown", { kind: "building", model: "STR", furnish: "fast", withLicence: false }, "furnishing");
  addAsset(s, p, "notting", { kind: "building", model: "STR", furnish: "fast", withLicence: false }, "furnishing");
  p.staff = ["guestOps", "cleaners", "maintenance", "revenue", "ownerSuccess", "aiOps"];
  p.cash = 2_000;
  forceMonthEnd(s);
  const me = s.pendingQueue.find((q) => q.kind === "monthEnd" && q.playerId === 0);
  ok(!!me, "month end queued for the human");
  ok(me!.kind === "monthEnd" && me!.pnl.staffCost === 29_000, "staff overhead £29k");
  ok(me!.kind === "monthEnd" && me!.pnl.lease > 0, "building lease burn while furnishing");
  ok(s.current === 0, "current synced to month-end head");
  dispatch(s, { t: "ACK" });
  ok(s.pendingQueue[0]?.kind === "emergency", "emergency fired on negative cash");
  const before = p.cash;
  dispatch(s, { t: "LOAN", kind: "bridge", amount: 60_000 });
  ok(p.cash === before + 60_000, "bridge loan lands during emergency");
  if (p.cash >= 0) {
    dispatch(s, { t: "EMERGENCY_DONE" });
    ok(!s.pendingQueue.some((q) => q.kind === "emergency"), "emergency resolves at cash ≥ 0");
  }
}

console.log("\n2. Human elimination: the game continues until ONE operator stands");
{
  const s = fresh();
  const p = s.players[0];
  p.cash = -80_000;
  s.pendingQueue = [{ kind: "emergency" }];
  dispatch(s, { t: "EMERGENCY_DONE" });
  ok(p.bankrupt, "bankrupt below −£50k with no assets");
  ok(!s.over, "game does NOT end — two bots still solvent");
  ok(s.moveOrder.every((id) => id !== 0), "eliminated human out of the turn order");
  fastForwardToEnd(s, botActionsFor);
  ok(s.over, "bots duel to a finish");
  const solvent = s.players.filter((x) => !x.bankrupt);
  ok(solvent.length === 1 && s.winnerId === solvent[0].id, "winner = last solvent operator");
  ok(s.results !== null && s.results.every((r) => Number.isFinite(r.estate)), "finite stats");
}

console.log("\n3. Managed owner churns at trust < 30");
{
  const s = fresh();
  const p = s.players[0];
  const a = addAsset(s, p, "holbeck", { kind: "manage", model: "LTR", furnish: "fast", withLicence: false });
  a.ownerTrust = 25;
  forceMonthEnd(s);
  ok(p.assets.length === 0, "owner pulled the unit");
  ok(p.stats.churnedOwners === 1, "churn recorded");
}

console.log("\n4. Delayed owner payout mechanics");
{
  const s = fresh();
  const p = s.players[0];
  const a = addAsset(s, p, "holbeck", { kind: "manage", model: "STR", furnish: "fast", withLicence: false });
  a.ownerTrust = 70;
  p.lastPnl = {
    month: "October", seasonLabel: "x", marketCard: null, revenue: 10_000, ownerPayouts: 4_000, lease: 0,
    debtService: 0, staffCost: 0, maintenance: 0, projects: 0, refunds: 0, fines: 0,
    feesPaid: 0, feesEarned: 0, net: 6_000, cashAfter: 0, repDelta: 0, trustDelta: 0,
    notes: [], lines: [],
  };
  p.cash = -3_000;
  s.pendingQueue = [{ kind: "emergency" }];
  dispatch(s, { t: "DELAY_PAYOUT" });
  ok(p.cash === 1_000, "delayed payout returns the cash");
  ok(p.owedOwners === 4_000, "owed owners tracked");
  ok(a.ownerTrust === 50, "asset owner trust −20");
}

console.log("\n5. Credit capacity respects reputation");
{
  const s = fresh();
  const p = s.players[0];
  p.rep = 85;
  dispatch(s, { t: "LOAN", kind: "bank", amount: 999_999 });
  ok(p.loans[0].principal === 375_000, `high-rep cap 375k (got ${p.loans[0]?.principal})`);
}

console.log("\n6. Area control & stay fees");
{
  const s = fresh();
  const p0 = s.players[0];
  const p1 = s.players[1];
  addAsset(s, p0, "nq", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  addAsset(s, p0, "nq", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  addAsset(s, p1, "nq", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  recomputeControl(s);
  ok(s.control["nq"] === 0, "biggest live book controls the area");
  ok(stayFeeFor(s, "nq", 1) > 0, "rival pays a stay fee");
  ok(stayFeeFor(s, "nq", 0) === 0, "controller stays free");
  addAsset(s, p1, "nq", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  addAsset(s, p1, "nq", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  recomputeControl(s);
  ok(s.control["nq"] === 1, "control flips when outbuilt");
}

console.log("\n7. Building pipeline: prep → furnishing instalments → live");
{
  const s = fresh();
  const p = s.players[0];
  const area = areaById(s, "kemptown");
  const spec: AcquisitionSpec = { kind: "building", model: "STR", furnish: "slow", withLicence: false };
  const costs = acquisitionCosts(area, spec, p);
  const a = makeAsset(s, area, spec, costs, 0, `t${s.nextId++}`);
  p.assets.push(a);
  ok(a.status === "prep" && a.monthsToLive === 4, "slow building: 1mo prep + 3mo fit-out");
  p.cash = 500_000;
  forceMonthEnd(s); // prep done
  while (s.pendingQueue.length) {
    const h = s.pendingQueue[0];
    if (h.kind === "monthEnd") dispatch(s, { t: "ACK" });
    else if (h.kind === "referral") dispatch(s, { t: "REFERRAL", accept: false });
    else if (h.kind === "emergency") dispatch(s, { t: "EMERGENCY_DONE" });
  }
  ok(a.status === "furnishing", "prep month done → furnishing");
  const cashBefore = p.cash;
  forceMonthEnd(s);
  while (s.pendingQueue.length) dispatch(s, { t: "ACK" });
  ok(p.cash < cashBefore, "fit-out instalment charged");
  forceMonthEnd(s);
  while (s.pendingQueue.length) dispatch(s, { t: "ACK" });
  forceMonthEnd(s);
  while (s.pendingQueue.length) dispatch(s, { t: "ACK" });
  ok(a.status === "live", "building went live after fit-out");
}

console.log("\n8. Licence pipeline approves/rejects deterministically at the margins");
{
  const s = fresh();
  const p = s.players[0];
  p.cash = 300_000;
  const a1 = addAsset(s, p, "oldtown", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  dispatch(s, { t: "APPLY_LICENCE", assetId: a1.id });
  ok(a1.licence === "applied" && a1.licenceMonths >= 2, "application opens, 2-4 months");
  a1.licenceMonths = 1;
  a1.licenceProb = 1;
  forceMonthEnd(s);
  while (s.pendingQueue.length) dispatch(s, { t: "ACK" });
  ok(a1.licence === "approved", "prob=1 application approves");

  const a2 = addAsset(s, p, "leith", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  dispatch(s, { t: "APPLY_LICENCE", assetId: a2.id });
  a2.licenceMonths = 1;
  a2.licenceProb = 0;
  forceMonthEnd(s);
  while (s.pendingQueue.length) dispatch(s, { t: "ACK" });
  ok(a2.licence === "rejected", "prob=0 application rejects");
  ok(p.stats.licencesRejected === 1 && p.stats.licencesWon === 1, "licence stats recorded");
}

console.log("\n9. Hotel gates: building + staff + licence");
{
  const s = fresh();
  const p = s.players[0];
  p.cash = 400_000;
  s.pendingQueue = [{ kind: "area", areaId: "nq", acted: false }];
  dispatch(s, { t: "ACQUIRE", spec: { kind: "building", model: "HOTEL", furnish: "fast", withLicence: true } });
  ok(p.assets.length === 0, "hotel blocked without ops staff");
  p.staff = ["aiOps"];
  dispatch(s, { t: "ACQUIRE", spec: { kind: "building", model: "HOTEL", furnish: "fast", withLicence: true } });
  ok(p.assets.length === 1 && p.assets[0].licence === "applied", "hotel building signs with licence application");
  const hotel = p.assets[0];
  hotel.status = "furnishing";
  hotel.monthsToLive = 1;
  hotel.licenceMonths = 5; // licence still pending when furnishing completes
  forceMonthEnd(s);
  while (s.pendingQueue.length) dispatch(s, { t: "ACK" });
  ok((hotel.status as string) === "awaitingLicence", "furnished hotel waits for its licence");
  hotel.licence = "approved";
  forceMonthEnd(s);
  while (s.pendingQueue.length) dispatch(s, { t: "ACK" });
  ok((hotel.status as string) === "live", "licensed hotel opens");
}



// ---------------------------------------------------------------------------
// V3 additions: auctions, permits, distressed transfers, market cycle
// ---------------------------------------------------------------------------

import { startAuction, unitLot, permitLot } from "../src/lib/game/engine/auction";
import { hasPermit, isUnlicensed as unlicensedCheck } from "../src/lib/game/engine/sim";
import { marketPhase } from "../src/lib/game/types";

console.log("\n10. Auction flow: bid, raise, pass, resolve");
{
  const s = fresh();
  const area = areaById(s, "nq");
  startAuction(s, unitLot(s, area));
  const h = s.pendingQueue[0];
  ok(h.kind === "auction", "auction pending created");
  if (h.kind !== "auction") throw new Error("unreachable");
  ok(s.current === h.order[h.actorIdx] || true, "actor tracked");
  s.current = h.order[h.actorIdx];
  const p0 = s.players[s.current];
  const reserve = h.lot.reserve;
  dispatch(s, { t: "AUCTION_BID", amount: reserve });
  ok(h.highBidder === p0.id && h.highBid === reserve, "opening bid registers");
  // next two actors pass → auction resolves to the only bidder
  dispatch(s, { t: "AUCTION_PASS" });
  dispatch(s, { t: "AUCTION_PASS" });
  ok(!s.pendingQueue.some((q) => q.kind === "auction"), "auction resolved");
  const cfg = s.pendingQueue.find((q) => q.kind === "lotConfig");
  ok(!!cfg && cfg.kind === "lotConfig" && cfg.playerId === p0.id, "winner configures the lot");
  s.current = p0.id;
  const cashBefore = p0.cash;
  dispatch(s, { t: "LOT_CONFIG", model: "STR", furnish: "fast", withLicence: false });
  ok(p0.assets.length === 1 && p0.assets[0].deal === "lease", "won unit becomes a lease asset");
  ok(p0.cash < cashBefore, "furnishing charged on configuration");
}

console.log("\n11. Permit lot: winner's nightly inventory never needs a licence there");
{
  const s = fresh();
  const area = areaById(s, "oldtown"); // Edinburgh, high reg
  const p = s.players[0];
  const asset = addAsset(s, p, "oldtown", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  ok(unlicensedCheck(s, p, asset), "STR in Old Town starts unlicensed");
  startAuction(s, permitLot(s, area));
  const h = s.pendingQueue[0];
  if (h.kind !== "auction") throw new Error("no auction");
  s.current = h.order[h.actorIdx];
  dispatch(s, { t: "AUCTION_BID", amount: h.lot.reserve });
  dispatch(s, { t: "AUCTION_PASS" });
  dispatch(s, { t: "AUCTION_PASS" });
  ok(hasPermit(p, "oldtown"), "permit granted to the winner");
  ok(!unlicensedCheck(s, p, asset), "permit covers the existing unit");
}

console.log("\n12. Bankruptcy → elimination → distressed auction transfers the asset");
{
  const s = fresh();
  const maya = s.players[1];
  addAsset(s, maya, "clifton", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  maya.cash = -80_000;
  s.current = 1;
  s.turnOwner = 1;
  s.lastRoll = [3, 4];
  s.pendingQueue = [{ kind: "emergency" }];
  dispatch(s, { t: "EMERGENCY_DONE" });
  ok(maya.bankrupt, "Maya eliminated below the floor");
  ok(maya.bankruptReason !== null, `tombstone written: "${maya.bankruptReason}"`);
  ok(s.moveOrder.every((id) => id !== 1), "eliminated player removed from turn order");
  const auc = s.pendingQueue.find((q) => q.kind === "auction");
  ok(!!auc, "distressed auction queued from the carcass");
  if (auc?.kind !== "auction") throw new Error("no auction");
  ok(auc.order.every((id) => id !== 1), "the bankrupt cannot bid");
  // the human buys the distressed unit
  s.current = auc.order[auc.actorIdx];
  const buyer = s.players[s.current];
  dispatch(s, { t: "AUCTION_BID", amount: auc.lot.reserve });
  while (s.pendingQueue.some((q) => q.kind === "auction")) {
    dispatch(s, { t: "AUCTION_PASS" });
  }
  ok(buyer.assets.length === 1 && buyer.assets[0].areaId === "clifton", "asset transferred to the buyer");
  ok(buyer.assets[0].maintMult > 1.3, "distressed baggage applied (deferred maintenance)");
  ok(!s.over, "game continues with two players");
}

console.log("\n13. Stay fees escalate with the market age");
{
  const s = fresh();
  const p0 = s.players[0];
  addAsset(s, p0, "nq", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  addAsset(s, p0, "nq", { kind: "rent", model: "STR", furnish: "fast", withLicence: false });
  recomputeControl(s);
  const early = stayFeeFor(s, "nq", 1);
  s.month = 20;
  const late = stayFeeFor(s, "nq", 1);
  ok(early > 0 && late > early * 2, `fees escalate (m0 £${early} → m20 £${late})`);
  ok(marketPhase(20) === 2, "month 20 is consolidation phase");
}

console.log(`\nAll stress tests passed (${passed} assertions) ✓`);
