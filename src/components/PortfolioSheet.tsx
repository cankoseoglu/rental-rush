"use client";

// Slide-up sheets: your portfolio (with actions), rival snapshot, game log.

import { useGame } from "@/lib/store";
import { gbp, gbpFull, stars } from "@/lib/game/format";
import { cityById } from "@/lib/game/data/cities";
import { staffById, opsCapacity, staffCost } from "@/lib/game/data/staff";
import { equity, playerLoad, totalLoanDebt } from "@/lib/game/engine/sim";
import { SELL_NORMAL } from "@/lib/game/types";
import { Sheet, PropertyArt, StrategyTag, Bar } from "./ui";
import type { Strategy } from "@/lib/game/types";
import clsx from "clsx";

export default function Sheets() {
  const game = useGame((s) => s.game);
  const ui = useGame((s) => s.ui);
  const openSheet = useGame((s) => s.openSheet);
  if (!game) return null;

  return (
    <>
      <Sheet open={ui.sheet === "portfolio"} onClose={() => openSheet(null)} maxW="max-w-lg">
        <Portfolio />
      </Sheet>
      <Sheet open={ui.sheet === "rival"} onClose={() => openSheet(null)} maxW="max-w-md">
        <Rival />
      </Sheet>
      <Sheet open={ui.sheet === "log"} onClose={() => openSheet(null)} maxW="max-w-md">
        <Log />
      </Sheet>
    </>
  );
}

function Portfolio() {
  const game = useGame((s) => s.game)!;
  const ui = useGame((s) => s.ui);
  const act = useGame((s) => s.act);
  const openSheet = useGame((s) => s.openSheet);
  const p = game.players[0];
  const actionable = game.current === 0 && !ui.busy && !game.over;
  const load = playerLoad(p);
  const cap = opsCapacity(p);

  return (
    <div className="p-4 pb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Your operation 🦊</h3>
        <button onClick={() => openSheet(null)} className="btn-dark h-8 px-3 text-xs">
          Close
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          ["Cash", gbp(p.cash), p.cash < 0 ? "text-coral-400" : "text-lime-300"],
          ["Equity", gbp(equity(p)), "text-cream-50"],
          ["Loans", gbp(totalLoanDebt(p)), "text-cream-50"],
          ["Rep", `${p.rep}/100`, "text-cream-50"],
          ["Trust", `${p.trust}/100`, "text-cream-50"],
          ["Staff", gbp(staffCost(p)) + "/mo", "text-cream-50"],
        ].map(([k, v, cls]) => (
          <div key={k as string} className="panel px-2 py-1.5">
            <div className="text-[0.58rem] uppercase tracking-wider text-cream-50/45">{k}</div>
            <div className={clsx("font-ledger text-[0.8rem] font-bold", cls)}>{v}</div>
          </div>
        ))}
      </div>

      <div className="mb-1 flex items-center justify-between text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
        <span>Ops capacity</span>
        <span>
          {load.toFixed(1)} / {cap}
        </span>
      </div>
      <Bar value={load} max={cap} color="#59C8DC" danger={load > cap} />

      <div className="mt-4 mb-1.5 text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
        Properties ({p.holdings.length})
      </div>
      {p.holdings.length === 0 && (
        <p className="rounded-2xl bg-ink-800/60 p-4 text-center text-[0.78rem] text-cream-50/50">
          No doors yet. Land on a 🏠 tile and do a deal.
        </p>
      )}
      <div className="space-y-2">
        {p.holdings.map((h) => {
          const sellValue =
            h.deal === "buy" ? Math.round(h.value * SELL_NORMAL) - h.mortgage : null;
          return (
            <div key={h.id} className="panel p-2.5">
              <div className="flex items-center gap-2.5">
                <PropertyArt hue={h.def.hue} emoji={h.def.emoji} className="h-12 w-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[0.8rem] font-bold">{h.def.name}</span>
                    {h.suspendedMonths > 0 && <span className="chip text-coral-400">suspended</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.64rem] text-cream-50/55">
                    <StrategyTag s={h.strategy} />
                    <span className="chip">{h.deal}</span>
                    <span>{cityById(h.def.cityId).name}</span>
                    <span>★ {stars(h.review)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={clsx("font-ledger text-[0.8rem] font-bold", h.lastNet >= 0 ? "text-lime-300" : "text-coral-400")}>
                    {h.monthsHeld ? `${h.lastNet >= 0 ? "+" : ""}${gbp(h.lastNet)}/mo` : "new"}
                  </div>
                  {h.deal === "buy" && (
                    <div className="text-[0.6rem] text-cream-50/45">eq {gbp(h.value - h.mortgage)}</div>
                  )}
                </div>
              </div>
              {actionable && (
                <div className="mt-2 flex items-center justify-between gap-1.5">
                  <div className="flex gap-1">
                    {(["STR", "MTR", "LTR"] as Strategy[]).map((s) => (
                      <button
                        key={s}
                        disabled={h.strategy === s}
                        onClick={() => act({ t: "CONVERT", holdingId: h.id, strategy: s })}
                        className={clsx(
                          "rounded-full px-2 py-1 text-[0.62rem] font-bold",
                          h.strategy === s ? "bg-ink-600 text-cream-50" : "bg-ink-800 text-cream-50/50 hover:text-cream-50",
                        )}
                        title={h.strategy === s ? "current" : "convert £500"}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => act({ t: "SELL", holdingId: h.id })}
                    className="chip text-amber-400"
                  >
                    {h.deal === "buy"
                      ? `Sell ${sellValue !== null ? gbp(sellValue) : ""}`
                      : h.deal === "lease"
                        ? "Exit lease"
                        : "Hand back"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {p.staff.length > 0 && (
        <>
          <div className="mt-4 mb-1.5 text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
            Team
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.staff.map((id) => {
              const s = staffById(id);
              return (
                <span key={id} className="chip">
                  {s.emoji} {s.name} · {gbp(s.salary)}/mo
                  {actionable && (
                    <button
                      onClick={() => act({ t: "FIRE", staff: id })}
                      className="ml-1 text-coral-400"
                      aria-label={`Fire ${s.name}`}
                    >
                      ✕
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </>
      )}

      {p.cityCompliance.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.cityCompliance.map((c) => (
            <span key={c} className="chip text-lime-300">
              ✓ {cityById(c).name} compliant
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Rival() {
  const game = useGame((s) => s.game)!;
  const ui = useGame((s) => s.ui);
  const openSheet = useGame((s) => s.openSheet);
  const p = game.players[ui.rivalId ?? 1];
  if (!p) return null;

  return (
    <div className="p-4 pb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold" style={{ color: p.color }}>
          {p.emoji} {p.name}
          {p.bankrupt && " 💀"}
        </h3>
        <button onClick={() => openSheet(null)} className="btn-dark h-8 px-3 text-xs">
          Close
        </button>
      </div>
      <p className="mb-3 text-[0.74rem] text-cream-50/60">
        {p.personality === "aggressive"
          ? "Leases fast, prices hot, hires late. One bad winter from chaos."
          : "Buys carefully, manages kindly, sleeps well. Annoyingly stable."}
      </p>
      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          ["Cash", gbp(p.cash)],
          ["Doors", `${p.holdings.length}`],
          ["Staff", `${p.staff.length}`],
          ["Rep", `${p.rep}`],
          ["Trust", `${p.trust}`],
          ["Loans", gbp(totalLoanDebt(p))],
        ].map(([k, v]) => (
          <div key={k} className="panel px-2 py-1.5">
            <div className="text-[0.58rem] uppercase tracking-wider text-cream-50/45">{k}</div>
            <div className="font-ledger text-[0.8rem] font-bold">{v}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {p.holdings.map((h) => (
          <div key={h.id} className="panel flex items-center justify-between px-3 py-2">
            <span className="truncate pr-2 text-[0.76rem] font-semibold">
              {h.def.emoji} {h.def.name}
            </span>
            <StrategyTag s={h.strategy} />
          </div>
        ))}
        {p.holdings.length === 0 && (
          <p className="rounded-2xl bg-ink-800/60 p-3 text-center text-[0.74rem] text-cream-50/45">
            {p.bankrupt ? "Liquidated." : "No properties yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function Log() {
  const game = useGame((s) => s.game)!;
  const openSheet = useGame((s) => s.openSheet);
  const toneCls: Record<string, string> = {
    good: "text-lime-300",
    bad: "text-coral-400",
    money: "text-cream-50",
    neutral: "text-cream-50/70",
  };
  return (
    <div className="p-4 pb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">The year so far 📜</h3>
        <button onClick={() => openSheet(null)} className="btn-dark h-8 px-3 text-xs">
          Close
        </button>
      </div>
      <div className="space-y-1.5">
        {[...game.log].reverse().map((l, i) => (
          <div key={i} className="flex items-start gap-2 text-[0.76rem] leading-snug">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: l.playerId >= 0 ? game.players[l.playerId]?.color : "#6FA8FF" }}
            />
            <span className={toneCls[l.tone]}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
