"use client";

// Blocking-moment modals: month-end P&L, events, referrals, emergencies.
// Area decisions live in the side panel, not here.

import { motion } from "motion/react";
import { useGame } from "@/lib/store";
import type { PendingAction, PnL } from "@/lib/game/types";
import { gbpFull } from "@/lib/game/format";
import { areaById } from "@/lib/game/engine/sim";
import { cityById } from "@/lib/game/data/cities";
import { Sheet, AreaArt } from "./ui";
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
  const show = !!head && current.isHuman && !ui.autoplay && ui.pendingVisible;
  if (!show || !head) return null;

  switch (head.kind) {
    case "monthEnd":
      return <MonthEndModal pnl={head.pnl} />;
    case "event":
      return <EventModal pending={head} key={head.eventId + head.choices.length} />;
    case "referral":
      return <ReferralModal pending={head} />;
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
          <div className="mb-3 font-ledger text-[0.62rem] uppercase tracking-widest text-creamink/40">
            Month-end profit &amp; loss
          </div>
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
