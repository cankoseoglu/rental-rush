"use client";

// Blocking-moment modals: month-end P&L, events, referrals, emergencies.
// Area decisions live in the side panel, not here.

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useGame } from "@/lib/store";
import type { AuctionPending, FurnishType, OpModel, PendingAction, PnL } from "@/lib/game/types";
import { FURNISH_SPECS } from "@/lib/game/types";
import { gbp, gbpFull } from "@/lib/game/format";
import { acquisitionCosts, areaById, needsLicence, licenceSuccessProb } from "@/lib/game/engine/sim";
import { minNextBid } from "@/lib/game/engine/auction";
import { hasStaff } from "@/lib/game/data/staff";
import { cityById } from "@/lib/game/data/cities";
import { Sheet, AreaArt, MODEL_META } from "./ui";
import EmergencyModal from "./EmergencyModal";

const CATEGORY_TINT: Record<string, string> = {
  guest: "#59C8DC",
  owner: "#FF7AC3",
  regulation: "#FF6F61",
  market: "#6FA8FF",
};

export default function Modals() {
  const game = useGame((s) => s.game);
  const ui = useGame((s) => s.ui);
  if (!game || game.over) return null;
  const current = game.players[game.current];
  const head = game.pendingQueue[0];
  if (!head || ui.autoplay) return null;

  // auctions are a room: the human watches bot bids live and acts on their go
  if (head.kind === "auction") {
    if (!head.order.includes(0)) return null;
    return <AuctionModal pending={head} key={head.lot.id} />;
  }

  if (!current.isHuman || !ui.pendingVisible) return null;

  switch (head.kind) {
    case "monthEnd":
      return <MonthEndModal pnl={head.pnl} />;
    case "event":
      return <EventModal pending={head} key={head.eventId + head.choices.length} />;
    case "referral":
      return <ReferralModal pending={head} />;
    case "lotConfig":
      return head.playerId === 0 ? <LotConfigModal pending={head} key={head.lot.id} /> : null;
    case "emergency":
      return <EmergencyModal />;
    case "area":
      return null; // handled by the side panel
  }
}

// --- month end ---------------------------------------------------------------

function Row({
  label,
  value,
  i,
  strong,
  tone,
}: {
  label: string;
  value: number;
  i: number;
  strong?: boolean;
  tone?: "cost" | "income";
}) {
  if (!strong && value === 0) return null;
  const display = tone === "cost" ? -value : value;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * i, duration: 0.25 }}
      className={`flex items-baseline justify-between ${strong ? "mt-2 border-t-2 border-creamink/20 pt-2" : ""}`}
    >
      <span className={`text-[0.8rem] ${strong ? "font-bold" : "text-creamink/70"}`}>{label}</span>
      <span
        className={`font-ledger ${strong ? "text-xl font-bold" : "text-[0.85rem] font-semibold"} ${
          display < 0 ? "text-coral-500" : strong ? "text-lime-900" : "text-creamink"
        }`}
      >
        {display < 0 ? "−" : strong && display > 0 ? "+" : ""}£
        {Math.abs(Math.round(display)).toLocaleString("en-GB")}
      </span>
    </motion.div>
  );
}

function MonthEndModal({ pnl }: { pnl: PnL }) {
  const act = useGame((s) => s.act);
  let i = 0;
  return (
    <Sheet open locked maxW="max-w-md">
      <div className="p-4">
        <div className="card-cream p-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-display text-lg font-bold tracking-tight">{pnl.month} — the books</span>
            <span className="rounded-full bg-creamink/8 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-creamink/60">
              {pnl.seasonLabel}
            </span>
          </div>
          <div className="mb-2 font-ledger text-[0.62rem] uppercase tracking-widest text-creamink/40">
            Month-end profit &amp; loss
          </div>
          {pnl.marketCard && (
            <div className="mb-3 rounded-lg border border-creamink/15 bg-creamink/5 px-2.5 py-1.5 text-[0.7rem] font-semibold leading-snug text-creamink/75">
              {pnl.marketCard}
            </div>
          )}
          <div className="space-y-1.5">
            <Row label="Rental revenue" value={pnl.revenue} i={i++} />
            <Row label="Stay fees earned" value={pnl.feesEarned} i={i++} />
            <Row label="Owner payouts" value={pnl.ownerPayouts} i={i++} tone="cost" />
            <Row label="Lease obligations" value={pnl.lease} i={i++} tone="cost" />
            <Row label="Mortgage & debt service" value={pnl.debtService} i={i++} tone="cost" />
            <Row label="Staff overhead" value={pnl.staffCost} i={i++} tone="cost" />
            <Row label="Maintenance & ops" value={pnl.maintenance} i={i++} tone="cost" />
            <Row label="Projects & furnishing" value={pnl.projects} i={i++} tone="cost" />
            <Row label="Refunds" value={pnl.refunds} i={i++} tone="cost" />
            <Row label="Fines" value={pnl.fines} i={i++} tone="cost" />
            <Row label="Stay fees paid" value={pnl.feesPaid} i={i++} tone="cost" />
            <Row label="Net cash flow" value={pnl.net} i={i++} strong />
          </div>

          {(pnl.repDelta !== 0 || pnl.trustDelta !== 0) && (
            <div className="mt-3 flex gap-1.5">
              {pnl.repDelta !== 0 && (
                <span className={`rounded-full px-2 py-0.5 text-[0.66rem] font-bold ${pnl.repDelta > 0 ? "bg-lime-400/30 text-lime-900" : "bg-coral-500/15 text-coral-500"}`}>
                  Rep {pnl.repDelta > 0 ? "+" : ""}
                  {pnl.repDelta}
                </span>
              )}
              {pnl.trustDelta !== 0 && (
                <span className={`rounded-full px-2 py-0.5 text-[0.66rem] font-bold ${pnl.trustDelta > 0 ? "bg-lime-400/30 text-lime-900" : "bg-coral-500/15 text-coral-500"}`}>
                  Trust {pnl.trustDelta > 0 ? "+" : ""}
                  {pnl.trustDelta}
                </span>
              )}
            </div>
          )}

          {pnl.notes.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-dashed border-creamink/20 pt-2">
              {pnl.notes.slice(0, 5).map((n, idx) => (
                <li key={idx} className="text-[0.72rem] leading-snug text-creamink/70">
                  · {n}
                </li>
              ))}
            </ul>
          )}

          {pnl.lines.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[0.72rem] font-bold text-creamink/60">
                Per-asset detail
              </summary>
              <div className="mt-2 space-y-1.5">
                {pnl.lines.map((l, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[0.72rem]">
                    <span className="truncate pr-2 text-creamink/80">
                      {l.name}{" "}
                      <span className="opacity-50">
                        · {l.units}u {l.model}
                        {l.status !== "live" ? ` · ${l.status}` : l.model === "STR" || l.model === "HOTEL" ? ` ${Math.round(l.occ * 100)}%` : ""}
                      </span>
                    </span>
                    <span className={`font-ledger font-semibold ${l.net < 0 ? "text-coral-500" : ""}`}>
                      {l.net < 0 ? "−" : "+"}£{Math.abs(l.net).toLocaleString("en-GB")}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={`font-ledger text-sm font-semibold ${pnl.cashAfter < 0 ? "text-coral-400" : "text-cream-50/80"}`}>
            Cash: {gbpFull(pnl.cashAfter)}
          </span>
          <button onClick={() => act({ t: "ACK" })} className="btn-primary h-11 max-w-[200px] flex-1 text-sm">
            Continue
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// --- events --------------------------------------------------------------------

function EventModal({ pending }: { pending: Extract<PendingAction, { kind: "event" }> }) {
  const act = useGame((s) => s.act);
  const tint = CATEGORY_TINT[pending.category] ?? "#6FA8FF";
  return (
    <Sheet open locked maxW="max-w-md">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ background: `${tint}1f`, border: `1px solid ${tint}55` }}
          >
            {pending.emoji}
          </div>
          <div>
            <div className="text-[0.6rem] font-bold uppercase tracking-widest" style={{ color: tint }}>
              {pending.category === "guest"
                ? "Guest issue"
                : pending.category === "owner"
                  ? "Owner call"
                  : pending.category === "regulation"
                    ? "Regulation"
                    : "Market shift"}
            </div>
            <h3 className="font-display text-lg font-bold leading-tight">{pending.title}</h3>
          </div>
        </div>

        <p className="mt-3 text-[0.86rem] leading-relaxed text-cream-50/85">{pending.flavor}</p>

        {pending.effects.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pending.effects.map((e, i) => (
              <span
                key={i}
                className={`chip ${e.includes("−") || e.toLowerCase().includes("fine") ? "text-coral-400" : e.includes("+") ? "text-lime-300" : "text-cream-50/75"}`}
              >
                {e}
              </span>
            ))}
          </div>
        )}

        {pending.choices.length > 0 ? (
          <div className="mt-4 space-y-2">
            {pending.choices.map((c) => (
              <button
                key={c.id}
                disabled={c.disabled}
                onClick={() => act({ t: "EVENT_CHOICE", choiceId: c.id })}
                className="panel w-full px-4 py-3 text-left transition hover:border-lime-400/40 disabled:opacity-40"
              >
                <div className="text-sm font-bold">{c.label}</div>
                <div className="text-[0.72rem] text-cream-50/55">{c.detail}</div>
              </button>
            ))}
          </div>
        ) : (
          <button onClick={() => act({ t: "ACK" })} className="btn-primary mt-4 h-11 w-full text-sm">
            Carry on
          </button>
        )}
      </div>
    </Sheet>
  );
}

// --- owner referral ----------------------------------------------------------------

function ReferralModal({ pending }: { pending: Extract<PendingAction, { kind: "referral" }> }) {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const area = areaById(game, pending.areaId);
  const city = cityById(area.cityId);
  return (
    <Sheet open locked maxW="max-w-md">
      <div className="p-5">
        <div className="text-[0.6rem] font-bold uppercase tracking-widest text-violet-400">
          Owner referral 🤝
        </div>
        <h3 className="font-display text-lg font-bold">A happy owner sent a friend</h3>
        <p className="mt-1 text-[0.82rem] text-cream-50/75">
          They want you to manage their unit in {area.name} — no onboarding cost, live immediately.
          It starts {area.regRisk >= 60 ? "as MTR (the area's regulation is spicy)" : "as STR"}; switch it later if you like.
        </p>
        <div className="panel mt-3 flex items-center gap-3 p-3">
          <AreaArt hue={city.hue} emoji={city.emoji} className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{area.name}</div>
            <div className="text-[0.72rem] text-cream-50/60">
              {city.name} · {"£".repeat(area.level)} area · ADR £{area.baseAdr} · occ {Math.round(area.baseOcc * 100)}%
            </div>
            <div className="text-[0.72rem] text-cream-50/60">+1 unit · warm owner (trust 78)</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => act({ t: "REFERRAL", accept: false })} className="btn-dark h-11 flex-1 text-sm">
            Not now
          </button>
          <button onClick={() => act({ t: "REFERRAL", accept: true })} className="btn-primary h-11 flex-[2] text-sm">
            Take it on — free
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// --- auctions: the room where rivals get hurt -----------------------------------

const LOT_TINT: Record<string, string> = {
  unit: "#59C8DC",
  building: "#FFB454",
  mandate: "#FF7AC3",
  permit: "#C9A0FF",
  distressed: "#FF6F61",
};

function AuctionModal({ pending }: { pending: AuctionPending }) {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const me = game.players[0];
  const area = areaById(game, pending.lot.areaId);
  const city = cityById(area.cityId);
  const tint = LOT_TINT[pending.lot.type];
  const myGo = pending.order[pending.actorIdx] === 0 && !pending.passed.includes(0);
  const iPassed = pending.passed.includes(0);
  const min = minNextBid(pending);
  const highBidder =
    pending.highBidder !== null ? game.players[pending.highBidder] : null;
  const raise = Math.round((min * 1.15) / 100) * 100;

  return (
    <Sheet open locked maxW="max-w-md">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[0.6rem] font-bold uppercase tracking-widest" style={{ color: tint }}>
              🔨 {pending.lot.type === "distressed" ? "Distressed auction" : "Auction"} · round {pending.round}/3
            </div>
            <h3 className="font-display text-lg font-bold leading-tight">{pending.lot.label}</h3>
            <div className="text-[0.66rem] text-cream-50/55">
              {city.emoji} {city.name} · {"£".repeat(area.level)} area
            </div>
          </div>
          <AreaArt hue={city.hue} emoji={city.emoji} className="h-12 w-12 shrink-0 rounded-xl" />
        </div>

        <p className="mt-2 text-[0.76rem] leading-relaxed text-cream-50/75">{pending.lot.desc}</p>
        {pending.lot.flaws && pending.lot.flaws.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {pending.lot.flaws.map((f) => (
              <span key={f} className="chip text-coral-400">
                ⚠️ {f}
              </span>
            ))}
          </div>
        )}

        {/* bid state */}
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-ink-850/80 px-3.5 py-2.5">
          <div>
            <div className="text-[0.56rem] font-bold uppercase tracking-wider text-cream-50/45">
              {highBidder ? "Highest bid" : "Reserve"}
            </div>
            <div className="font-ledger text-xl font-extrabold">
              {gbpFull(highBidder ? pending.highBid : pending.lot.reserve)}
            </div>
          </div>
          {highBidder && (
            <div className="text-right">
              <div className="text-[0.56rem] font-bold uppercase tracking-wider text-cream-50/45">held by</div>
              <div className="text-sm font-extrabold" style={{ color: highBidder.color }}>
                {highBidder.emoji} {highBidder.name}
              </div>
            </div>
          )}
        </div>

        {/* live feed */}
        <div className="mt-2 min-h-[3.2em] space-y-0.5">
          {pending.feed.slice(-4).map((f, i) => (
            <div key={`${i}-${f}`} className="text-[0.7rem] text-cream-50/60">
              · {f}
            </div>
          ))}
          {!pending.feed.length && (
            <div className="text-[0.7rem] italic text-cream-50/40">The room settles. Paddles ready.</div>
          )}
        </div>

        {/* your move */}
        {iPassed ? (
          <div className="mt-3 rounded-xl bg-ink-800/60 px-3 py-2 text-center text-[0.72rem] text-cream-50/50">
            You're out of this one — watching the hammer.
          </div>
        ) : myGo ? (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <button
              disabled={me.cash < min}
              onClick={() => act({ t: "AUCTION_BID", amount: min })}
              className="btn-primary h-12 text-[0.78rem]"
            >
              Bid {gbp(min)}
            </button>
            <button
              disabled={me.cash < raise}
              onClick={() => act({ t: "AUCTION_BID", amount: raise })}
              className="btn-dark h-12 text-[0.78rem] font-bold"
            >
              Push {gbp(raise)}
            </button>
            <button onClick={() => act({ t: "AUCTION_PASS" })} className="btn-dark h-12 text-[0.78rem] font-bold text-coral-400">
              Pass
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-ink-800/60 px-3 py-2 text-center text-[0.72rem] text-cream-50/50">
            {game.players[pending.order[pending.actorIdx]]?.name} is deciding…
          </div>
        )}
        <div className="mt-1.5 text-center text-[0.6rem] text-cream-50/40">
          Your cash: {gbpFull(me.cash)} · overbidding into the red is your funeral
        </div>
      </div>
    </Sheet>
  );
}

// --- configure a won lot -----------------------------------------------------------

function LotConfigModal({ pending }: { pending: Extract<PendingAction, { kind: "lotConfig" }> }) {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const me = game.players[0];
  const area = areaById(game, pending.lot.areaId);
  const city = cityById(area.cityId);
  const isBuilding = pending.lot.type === "building";
  const [model, setModel] = useState<OpModel>("STR");
  const [furnish, setFurnish] = useState<FurnishType>("fast");
  const [withLicence, setWithLicence] = useState(false);

  const spec = useMemo(
    () => ({ kind: (isBuilding ? "building" : "rent") as "building" | "rent", model, furnish, withLicence }),
    [isBuilding, model, furnish, withLicence],
  );
  const costs = useMemo(() => acquisitionCosts(area, spec, me, game), [area, spec, me, game]);
  const dueNow = costs.cashNow - costs.setupCost;
  const licNeeded = needsLicence(area, model, me);

  return (
    <Sheet open locked maxW="max-w-md">
      <div className="p-4">
        <div className="text-[0.6rem] font-bold uppercase tracking-widest text-lime-300">
          🔨 Lot won · set it up
        </div>
        <h3 className="font-display text-lg font-bold leading-tight">{pending.lot.label}</h3>
        <p className="mt-0.5 text-[0.7rem] text-cream-50/55">
          Your {gbpFull(pending.paid)} bid covered the setup. Now choose how it runs —
          furnishing {isBuilding ? "bills in instalments during fit-out" : `due now`}.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(["STR", "MTR", "LTR", "HOTEL"] as OpModel[]).map((m) => {
            const meta = MODEL_META[m];
            const ok =
              m !== "HOTEL" ||
              (isBuilding && (hasStaff(me, "guestOps") || hasStaff(me, "aiOps")));
            return (
              <button
                key={m}
                disabled={!ok}
                onClick={() => setModel(m)}
                className={clsx2(
                  "rounded-full px-2.5 py-1 text-[0.66rem] font-extrabold transition",
                  model === m ? "text-ink-900" : "text-cream-50/70",
                  !ok && "opacity-35",
                )}
                style={{
                  background: model === m ? meta.color : `${meta.color}1f`,
                  border: `1px solid ${meta.color}66`,
                }}
              >
                {meta.emoji} {meta.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(["fast", "slow"] as FurnishType[]).map((f) => {
            const fs = FURNISH_SPECS[f];
            const months = fs.months(isBuilding ? "building" : "unit");
            return (
              <button
                key={f}
                onClick={() => setFurnish(f)}
                className={clsx2(
                  "rounded-xl border px-2.5 py-2 text-left",
                  furnish === f ? "border-lime-400/70 bg-lime-400/8" : "border-line bg-ink-800/50",
                )}
              >
                <div className="text-[0.72rem] font-bold">
                  {f === "fast" ? "⚡" : "🧱"} {fs.label}
                  <span className="font-ledger ml-1 text-[0.6rem] text-cream-50/50">{months}mo</span>
                </div>
              </button>
            );
          })}
        </div>

        {licNeeded && model !== "HOTEL" && (
          <button
            onClick={() => setWithLicence(!withLicence)}
            className={clsx2(
              "mt-2 flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left",
              withLicence ? "border-violet-400/70 bg-violet-400/10" : "border-line bg-ink-800/50",
            )}
          >
            <span className="text-[0.7rem] font-bold">
              ⚖️ Apply for the licence now
              <span className="ml-1 text-[0.58rem] font-medium text-cream-50/50">
                {Math.round(licenceSuccessProb(area, model, me) * 100)}% odds
              </span>
            </span>
            <span className="font-ledger text-[0.72rem] font-bold text-violet-400">
              {withLicence ? "✓ " : "+"}
              {gbp(costs.licenceCost)}
            </span>
          </button>
        )}

        <button
          onClick={() => act({ t: "LOT_CONFIG", model, furnish, withLicence })}
          className="btn-primary mt-3 h-12 w-full text-sm"
        >
          Set it up{dueNow > 0 ? ` · ${gbp(dueNow)} furnishing` : ""} · {gbp(costs.monthlyFixed)}/mo lease
        </button>
        <div className="mt-1 text-center text-[0.6rem] text-cream-50/40">
          {city.emoji} {city.name} · reg risk {area.regRisk}/100
        </div>
      </div>
    </Sheet>
  );
}

// tiny local clsx to avoid an extra import churn in this file
function clsx2(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
