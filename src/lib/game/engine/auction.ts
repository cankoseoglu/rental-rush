// ---------------------------------------------------------------------------
// The auction engine. Fast 3-round cash auctions over five lot types:
// unit · building · owner mandate · permit · distressed (bankruptcy).
// One pending drives the whole thing; `current` follows the actor so the
// existing pump/modal machinery works for humans and bots alike.
// ---------------------------------------------------------------------------

import type {
  AreaDef,
  Asset,
  AuctionLot,
  AuctionPending,
  GameState,
  PlayerState,
} from "../types";
import { clamp } from "../rng";
import {
  acquisitionCosts,
  areaById,
  makeAsset,
  projectAcquisition,
  simulateAssetMonth,
  overloadPenaltyFor,
  type AcquisitionSpec,
} from "./sim";

export const MIN_INCREMENT = 1_000;

export const bidIncrement = (highBid: number): number =>
  Math.max(MIN_INCREMENT, Math.round(highBid * 0.1 / 500) * 500);

export const minNextBid = (a: AuctionPending): number =>
  a.highBidder === null ? a.lot.reserve : a.highBid + bidIncrement(a.highBid);

// --- lot builders -------------------------------------------------------------

export function unitLot(state: GameState, area: AreaDef): AuctionLot {
  return {
    id: `lot${state.nextId++}`,
    type: "unit",
    areaId: area.id,
    label: `Off-market unit · ${area.name}`,
    desc: `A sourced rental unit in ${area.name}. Winning bid replaces the setup cost — winner picks model and furnishing, then pays standard lease terms (£${Math.round(area.ltrRent * 1.05).toLocaleString("en-GB")}/mo).`,
    units: 1,
    reserve: Math.round((area.ltrRent * 1.2) / 500) * 500,
  };
}

export function buildingLot(state: GameState, area: AreaDef): AuctionLot {
  const units = area.buildingUnits;
  return {
    id: `lot${state.nextId++}`,
    type: "building",
    areaId: area.id,
    label: `${units}-unit building lease · ${area.name}`,
    desc: `The whole block. Winning bid replaces the setup cost; lease runs £${Math.round(units * area.ltrRent * 0.88).toLocaleString("en-GB")}/mo from signing, fit-out before revenue. High risk, high upside.`,
    units,
    reserve: Math.round((units * area.ltrRent * 1.1) / 500) * 500,
  };
}

export function mandateLot(state: GameState, area: AreaDef, units: number): AuctionLot {
  return {
    id: `lot${state.nextId++}`,
    type: "mandate",
    areaId: area.id,
    label: `Owner mandate · ${units} units · ${area.name}`,
    desc: `A local owner hands ${units} furnished units to one operator. Winning bid is the signing bonus; units go live immediately on standard management terms.`,
    units,
    reserve: Math.round((units * 1_200) / 500) * 500,
  };
}

export function permitLot(state: GameState, area: AreaDef): AuctionLot {
  return {
    id: `lot${state.nextId++}`,
    type: "permit",
    areaId: area.id,
    label: `Nightly-stay permit · ${area.name}`,
    desc: `City Hall releases one blanket permit for ${area.name} (reg risk ${area.regRisk}/100). The holder's STR and Hotel inventory there never needs another licence.`,
    units: 0,
    reserve: Math.round((2_000 + area.regRisk * 60) / 500) * 500,
  };
}

export function distressedLots(state: GameState, victim: PlayerState): AuctionLot[] {
  return victim.assets.map((asset) => {
    const area = areaById(state, asset.areaId);
    const flaws: string[] = [];
    if (asset.rating < 4.2) flaws.push("battered reviews");
    if (asset.deal === "manage") flaws.push("shaken owner");
    if (asset.maintMult > 1.1) flaws.push("deferred maintenance");
    if (asset.deal === "lease") flaws.push(`£${asset.monthlyFixed.toLocaleString("en-GB")}/mo lease transfers`);
    if (asset.deal === "buy") flaws.push(`£${Math.round(asset.mortgage / 1000)}k mortgage transfers`);
    if (asset.status !== "live") flaws.push("unfinished pipeline");
    const replacement =
      asset.deal === "buy"
        ? Math.max(10_000, asset.value - asset.mortgage)
        : asset.units * area.ltrRent * 2 + 4_000;
    return {
      id: `lot${state.nextId++}`,
      type: "distressed" as const,
      areaId: asset.areaId,
      label: `DISTRESSED · ${area.name} ${asset.kind === "building" ? `block (${asset.units}u)` : "unit"} · ${asset.model}`,
      desc: `Seized from ${victim.name}'s collapsed operation. Sold as seen${flaws.length ? ` — ${flaws.join(", ")}` : ""}. Unsold lots return to the bank.`,
      units: asset.units,
      reserve: Math.round((replacement * 0.45) / 500) * 500,
      asset: { ...asset, mods: [...asset.mods] },
      distressedOf: victim.id,
      flaws,
    };
  });
}

// --- lifecycle -------------------------------------------------------------------

export function startAuction(state: GameState, lot: AuctionLot, excludeId?: number) {
  const order = state.players
    .filter((p) => !p.bankrupt && p.id !== excludeId)
    .map((p) => p.id);
  if (!order.length) return;
  const pending: AuctionPending = {
    kind: "auction",
    lot,
    round: 1,
    order,
    actorIdx: 0,
    highBid: 0,
    highBidder: null,
    passed: [],
    feed: [],
  };
  state.pendingQueue.push(pending);
}

const activeBidders = (a: AuctionPending) => a.order.filter((id) => !a.passed.includes(id));

/** Advance to the next actor / round. Returns true when the auction is over. */
export function advanceAuction(a: AuctionPending): boolean {
  const live = activeBidders(a);
  if (live.length === 0) return true;
  if (live.length === 1 && a.highBidder !== null && live[0] === a.highBidder) return true;

  for (let step = 1; step <= a.order.length; step++) {
    const idx = (a.actorIdx + step) % a.order.length;
    if (idx <= a.actorIdx) {
      // wrapped → next round
      if (a.round >= 3) return true;
      a.round = (a.round + 1) as 2 | 3;
    }
    if (!a.passed.includes(a.order[idx])) {
      a.actorIdx = idx;
      return false;
    }
  }
  return true;
}

/** Apply the winning lot to the winner. Returns a short outcome log line. */
export function resolveAuction(state: GameState, a: AuctionPending): string {
  const lot = a.lot;
  if (a.highBidder === null) {
    if (lot.sellerId !== undefined && lot.asset) {
      // voluntary sale that found no buyer — the seller keeps the asset
      const seller = state.players[lot.sellerId];
      if (!seller.bankrupt) {
        seller.assets.push({ ...lot.asset, mods: [...lot.asset.mods] });
        if (lot.asset.kind === "building") state.buildingTaken[lot.asset.areaId] = seller.id;
        return `Nobody bid — ${seller.name} keeps the ${areaById(state, lot.areaId).name} ${lot.asset.kind}.`;
      }
    }
    if (lot.type === "building") {
      // the block stays on the market
      return `Nobody bid — the ${areaById(state, lot.areaId).name} building stays with its owner.`;
    }
    return `Nobody bid — the lot returns to the bank.`;
  }
  const winner = state.players[a.highBidder];
  winner.cash -= a.highBid;
  winner.stats.auctionsWon += 1;
  winner.stats.auctionSpend += a.highBid;
  if (lot.sellerId !== undefined && !state.players[lot.sellerId].bankrupt) {
    state.players[lot.sellerId].cash += a.highBid; // voluntary sale proceeds
  }
  const area = areaById(state, lot.areaId);

  if (lot.type === "permit") {
    winner.permits.push(lot.areaId);
    winner.stats.notables.push({ label: `Won the ${area.name} permit at auction`, value: 6_000 });
    return `${winner.name} won the ${area.name} permit for £${a.highBid.toLocaleString("en-GB")}.`;
  }

  if (lot.type === "mandate") {
    const spec: AcquisitionSpec = { kind: "manage", model: area.regRisk >= 60 ? "MTR" : "STR", furnish: "fast", withLicence: false };
    const costs = acquisitionCosts(area, spec, winner, state);
    const asset = makeAsset(state, area, spec, costs, winner.id, `a${state.nextId++}`);
    asset.units = lot.units;
    asset.ownerTrust = 72;
    winner.assets.push(asset);
    return `${winner.name} won the ${area.name} owner mandate (${lot.units} units) for £${a.highBid.toLocaleString("en-GB")}.`;
  }

  if (lot.type === "distressed" && lot.asset) {
    const asset: Asset = { ...lot.asset, mods: [...lot.asset.mods] };
    asset.id = `a${state.nextId++}`;
    asset.ownerId = winner.id;
    // sold as seen: the baggage is real
    asset.rating = clamp(asset.rating - 0.3, 3, asset.ratingCap);
    asset.maintMult = Math.round(asset.maintMult * 1.1 * 100) / 100;
    if (asset.deal === "manage") asset.ownerTrust = Math.min(55, asset.ownerTrust);
    winner.assets.push(asset);
    if (asset.kind === "building") state.buildingTaken[asset.areaId] = winner.id;
    const label = `Bought ${lot.label.replace("DISTRESSED · ", "").replace("OFFERED · ", "")} at auction for £${a.highBid.toLocaleString("en-GB")}`;
    if (a.highBid <= lot.reserve * 1.3) winner.stats.notables.push({ label, value: 8_000 });
    winner.stats.biggestAuctionWin = label;
    return `${winner.name} picked up the distressed ${area.name} ${asset.kind} for £${a.highBid.toLocaleString("en-GB")}.`;
  }

  // unit & building lots: bid replaced the setup cost; winner now configures
  state.pendingQueue.push({ kind: "lotConfig", playerId: winner.id, lot, paid: a.highBid });
  return `${winner.name} won ${lot.label} for £${a.highBid.toLocaleString("en-GB")}.`;
}

// --- bot valuation -----------------------------------------------------------------

export function botLotValue(state: GameState, p: PlayerState, lot: AuctionLot): number {
  const area = areaById(state, lot.areaId);
  if (lot.type === "permit") {
    const exposed = p.assets.filter(
      (a) => a.areaId === lot.areaId && (a.model === "STR" || a.model === "HOTEL"),
    ).length;
    const base = 2_000 + area.regRisk * 50;
    return base + exposed * 4_000 + (area.regRisk >= 60 ? 3_000 : 0);
  }
  if (lot.type === "distressed" && lot.asset) {
    const ghost: Asset = { ...lot.asset, ownerId: p.id, mods: [] };
    ghost.rating = clamp(ghost.rating - 0.3, 3, ghost.ratingCap);
    const m = simulateAssetMonth(ghost, p, state, 7, null, overloadPenaltyFor(p));
    // value the run-rate, haircut for baggage and late-game risk
    return Math.max(0, m.playerNet * 10);
  }
  if (lot.type === "mandate") {
    const spec: AcquisitionSpec = { kind: "manage", model: area.regRisk >= 60 ? "MTR" : "STR", furnish: "fast", withLicence: false };
    const proj = projectAcquisition(state, p, area, spec);
    return Math.max(0, proj.liveNet * lot.units * 9);
  }
  const spec: AcquisitionSpec = {
    kind: lot.type === "building" ? "building" : "rent",
    model: "STR",
    furnish: p.personality === "steady" ? "slow" : "fast",
    withLicence: false,
  };
  const proj = projectAcquisition(state, p, area, spec);
  // the bid replaces setup; value = what setup was worth plus margin upside
  return Math.max(0, proj.costs.setupCost * 0.9 + proj.liveNet * 4);
}
