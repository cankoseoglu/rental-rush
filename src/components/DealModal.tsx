"use client";

// The property deal modal — the heart of the game. Deal tabs (buy / lease /
// manage), strategy rows with live projections, full underwriting behind a
// disclosure, then one chunky confirm.

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store";
import type { DealType, PropertyDef, Strategy } from "@/lib/game/types";
import { projectDeal, type DealProjection } from "@/lib/game/engine/sim";
import { cityById } from "@/lib/game/data/cities";
import { gbp, gbpFull, expectationLabel, riskLabel } from "@/lib/game/format";
import { Sheet, PropertyArt, STRATEGY_META, DEAL_META } from "./ui";
import clsx from "clsx";

const STRATS: Strategy[] = ["STR", "MTR", "LTR"];

export default function DealModal({ card }: { card: PropertyDef }) {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const p = game.players[game.current];
  const city = cityById(card.cityId);

  const projections = useMemo(() => {
    const map = new Map<string, DealProjection>();
    for (const d of card.allowedDeals)
      for (const st of STRATS) map.set(`${d}:${st}`, projectDeal(card, d, st, p, game));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  const best = useMemo(() => {
    let bestKey: { deal: DealType; strat: Strategy } | null = null;
    let bestNet = -Infinity;
    for (const d of card.allowedDeals)
      for (const st of STRATS) {
        const pr = projections.get(`${d}:${st}`)!;
        if (pr.affordable && pr.net > bestNet) {
          bestNet = pr.net;
          bestKey = { deal: d, strat: st };
        }
      }
    return bestKey ?? { deal: card.allowedDeals[0], strat: "STR" as Strategy };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  const [deal, setDeal] = useState<DealType>(best.deal);
  const [strat, setStrat] = useState<Strategy>(best.strat);
  const sel = projections.get(`${deal}:${strat}`);

  return (
    <Sheet open locked maxW="max-w-lg">
      {/* listing header */}
      <div className="relative">
        <PropertyArt hue={card.hue} emoji={card.emoji} className="h-28 w-full rounded-t-3xl sm:rounded-t-3xl" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 to-transparent px-4 pb-2 pt-8">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold leading-tight">{card.name}</h3>
              <div className="text-[0.72rem] text-cream-50/70">
                {card.neighbourhood}, {city.name} {city.emoji} · {card.bedrooms} bed ·{" "}
                {card.type}
              </div>
            </div>
            <div className="text-right">
              <div className="font-ledger text-sm font-bold text-cream-50">{gbp(card.price)}</div>
              <div className="text-[0.62rem] text-cream-50/55">asking price</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* risk strip */}
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <span className={clsx("chip", card.regRisk >= 60 ? "text-coral-400" : "text-cream-50/70")}>
            ⚖️ Regulation {riskLabel(card.regRisk)}
          </span>
          <span className={clsx("chip", card.maintRisk >= 60 ? "text-amber-400" : "text-cream-50/70")}>
            🔧 Maintenance {riskLabel(card.maintRisk)}
          </span>
          <span className="chip text-cream-50/70">⭐ Review-sensitive {riskLabel(card.reviewSensitivity)}</span>
          <span className="chip text-cream-50/70">🧍 Owner: {expectationLabel(card.ownerExpectation)}</span>
        </div>

        {/* deal tabs */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {(["buy", "lease", "manage"] as DealType[]).map((d) => {
            const allowed = card.allowedDeals.includes(d);
            const cost = d === "buy" ? card.deposit : d === "lease" ? card.leaseSetup : card.onboardingCost;
            const affordable = p.cash >= cost;
            const active = deal === d;
            return (
              <button
                key={d}
                disabled={!allowed}
                onClick={() => setDeal(d)}
                className={clsx(
                  "rounded-2xl border px-2 py-2 text-center transition",
                  active
                    ? "border-lime-400/70 bg-lime-400/10"
                    : "border-line bg-ink-800/60 hover:border-line/80",
                  !allowed && "opacity-30",
                )}
              >
                <div className="text-sm font-bold">
                  {DEAL_META[d].emoji} {DEAL_META[d].label}
                </div>
                <div className={clsx("font-ledger text-[0.7rem]", !allowed ? "" : affordable ? "text-cream-50/60" : "text-coral-400")}>
                  {allowed ? `${gbp(cost)} now` : "not offered"}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 px-1 text-[0.7rem] text-cream-50/50">{DEAL_META[deal].blurb}</p>

        {/* strategy rows */}
        <div className="mt-2 space-y-1.5">
          {STRATS.map((st) => {
            const pr = projections.get(`${deal}:${st}`)!;
            const m = STRATEGY_META[st];
            const active = strat === st;
            return (
              <button
                key={st}
                onClick={() => setStrat(st)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                  active ? "border-lime-400/70 bg-lime-400/8" : "border-line bg-ink-800/50",
                )}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                  style={{ background: `${m.color}1c`, border: `1px solid ${m.color}50` }}
                >
                  {m.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">
                    {m.label}
                    <span className="ml-1.5 text-[0.66rem] font-medium text-cream-50/45">{m.full}</span>
                  </span>
                  <span className="block text-[0.68rem] text-cream-50/55">
                    {st === "STR"
                      ? `≈${Math.round(pr.occ * 100)}% occ · £${pr.adr}/night · RevPAR £${pr.revpar}`
                      : st === "MTR"
                        ? `£${card.mtrRent.toLocaleString("en-GB")}/mo · light vacancies`
                        : `£${card.ltrRent.toLocaleString("en-GB")}/mo · rock steady`}
                    {" · "}ops {pr.opsCost.toFixed(1)}
                  </span>
                </span>
                <span className="text-right">
                  <span className={clsx("font-ledger block text-sm font-bold", pr.net >= 0 ? "text-lime-300" : "text-coral-400")}>
                    {pr.net >= 0 ? "+" : ""}
                    {gbp(pr.net)}/mo
                  </span>
                  {pr.monthlyFixed > 0 && (
                    <span className="block text-[0.62rem] text-cream-50/45">
                      {deal === "buy" ? "mortgage" : "lease"} {gbp(pr.monthlyFixed)}/mo
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* flags */}
        {sel && sel.flags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sel.flags.map((f) => (
              <span
                key={f}
                className={clsx(
                  "chip",
                  f === "Loss-making" || f === "Would exceed ops capacity" || f === "High-regulation city"
                    ? "text-coral-400"
                    : f === "Peak season ahead"
                      ? "text-lime-300"
                      : "text-amber-400",
                )}
              >
                {f === "Peak season ahead" ? "☀️ " : f === "Low season ahead" ? "🌧️ " : "⚠️ "}
                {f}
              </span>
            ))}
          </div>
        )}

        {/* underwriting */}
        <details className="mt-3">
          <summary className="cursor-pointer text-[0.74rem] font-bold text-cream-50/55">
            Full underwriting ▾
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl bg-ink-800/60 p-3 text-[0.72rem] sm:grid-cols-3">
            {(
              [
                ["STR base occupancy", `${Math.round(card.strOcc * 100)}%`],
                ["STR ADR", `£${card.strAdr}/night`],
                ["STR RevPAR", `£${Math.round(card.strAdr * card.strOcc)}`],
                ["MTR rent", `£${card.mtrRent.toLocaleString("en-GB")}/mo`],
                ["LTR rent", `£${card.ltrRent.toLocaleString("en-GB")}/mo`],
                ["Regulation risk", `${card.regRisk}/100`],
                ["Maintenance risk", `${card.maintRisk}/100`],
                ["Review sensitivity", `${card.reviewSensitivity}/100`],
                ["Owner expectation", expectationLabel(card.ownerExpectation)],
                ["Ops load factor", `×${card.opsFactor}`],
                ["Purchase price", gbpFull(card.price)],
                ["Deposit + fees", gbpFull(card.deposit)],
                ["Lease setup", gbpFull(card.leaseSetup)],
                ["Lease monthly", gbpFull(card.leaseMonthly)],
                ["Mgmt onboarding", gbpFull(card.onboardingCost)],
                ["Mgmt fee", "20% / 15% / 10%"],
              ] as Array<[string, string]>
            ).map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="text-[0.6rem] uppercase tracking-wide text-cream-50/40">{k}</span>
                <span className="font-ledger font-semibold text-cream-50/90">{v}</span>
              </div>
            ))}
          </div>
        </details>

        {/* CTA */}
        <div className="mt-4 flex gap-2">
          <button onClick={() => act({ t: "PASS_DEAL" })} className="btn-dark h-12 flex-1 text-sm">
            Pass
          </button>
          <button
            disabled={!sel || !sel.affordable}
            onClick={() => act({ t: "DEAL", deal, strategy: strat })}
            className="btn-primary h-12 flex-[2] text-sm"
          >
            {sel && !sel.affordable
              ? `Need ${gbp(sel.cashNow)}`
              : `${DEAL_META[deal].label} as ${strat} · ${gbp(sel?.cashNow ?? 0)}`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
