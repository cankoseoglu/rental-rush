"use client";

// Hiring / Finance / Upgrade tile modals.

import { useGame } from "@/lib/store";
import { STAFF, opsCapacity, staffCost } from "@/lib/game/data/staff";
import { CITIES, cityById } from "@/lib/game/data/cities";
import { creditLeft } from "@/lib/game/engine/reducer";
import { playerLoad, totalLoanDebt } from "@/lib/game/engine/sim";
import { gbp, gbpFull } from "@/lib/game/format";
import { BANK_RATE, BRIDGE_RATE, INVESTOR_CASH } from "@/lib/game/types";
import { Sheet, Bar, PropertyArt } from "./ui";
import clsx from "clsx";

function ShopHeader({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-700 text-xl">
        {emoji}
      </span>
      <div>
        <h3 className="font-display text-lg font-bold leading-tight">{title}</h3>
        <p className="text-[0.72rem] text-cream-50/55">{sub}</p>
      </div>
    </div>
  );
}

export function HiringModal() {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const p = game.players[game.current];
  const load = playerLoad(p);
  const cap = opsCapacity(p);

  return (
    <Sheet open locked maxW="max-w-lg">
      <div className="p-4">
        <ShopHeader
          emoji="🧑‍💼"
          title="The hiring market"
          sub={`Payroll ${gbp(staffCost(p))}/mo · ops load ${load.toFixed(1)}/${cap}`}
        />
        <div className="mb-3">
          <Bar value={load} max={cap} color="#59C8DC" danger={load > cap} />
          {load > cap && (
            <p className="mt-1 text-[0.7rem] font-semibold text-coral-400">
              You're over capacity — guests are noticing. Hire or convert something.
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STAFF.map((s) => {
            const hired = p.staff.includes(s.id);
            return (
              <div key={s.id} className={clsx("panel p-3", hired && "border-lime-400/40")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{s.emoji}</span>
                    <div>
                      <div className="text-[0.8rem] font-bold leading-tight">{s.name}</div>
                      <div className="font-ledger text-[0.68rem] text-cream-50/60">
                        {gbp(s.salary)}/mo
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => act(hired ? { t: "FIRE", staff: s.id } : { t: "HIRE", staff: s.id })}
                    className={clsx(
                      hired ? "btn-dark" : "btn-primary",
                      "h-8 px-3 text-[0.72rem] font-bold",
                    )}
                  >
                    {hired ? "Let go" : "Hire"}
                  </button>
                </div>
                <div className="mt-1.5 text-[0.7rem] font-semibold text-teal-400">{s.effect}</div>
                <div className="text-[0.68rem] leading-snug text-cream-50/50">{s.blurb}</div>
              </div>
            );
          })}
        </div>
        <button onClick={() => act({ t: "CLOSE_SHOP" })} className="btn-primary mt-3 h-11 w-full text-sm">
          Done hiring
        </button>
      </div>
    </Sheet>
  );
}

export function FinanceModal() {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const p = game.players[game.current];
  const left = creditLeft(p);
  const refis = p.holdings.filter(
    (h) => h.deal === "buy" && Math.round(h.value * 0.8) > h.mortgage + 5000,
  );

  return (
    <Sheet open locked maxW="max-w-lg">
      <div className="p-4">
        <ShopHeader
          emoji="🏦"
          title="Capital desk"
          sub={`Credit available ${gbp(left)} · loans outstanding ${gbp(totalLoanDebt(p))}`}
        />

        {p.loans.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {p.loans.map((l) => (
              <div key={l.id} className="panel flex items-center justify-between px-3 py-2">
                <div>
                  <span className="text-[0.78rem] font-bold capitalize">{l.kind} loan</span>
                  <span className="ml-2 font-ledger text-[0.72rem] text-cream-50/60">
                    {gbpFull(l.principal)} · {gbp(l.principal * l.ratePm)}/mo interest
                  </span>
                </div>
                <button
                  onClick={() => act({ t: "REPAY", loanId: l.id, amount: Math.min(l.principal, Math.max(0, p.cash)) })}
                  disabled={p.cash <= 0}
                  className="btn-dark h-8 px-3 text-[0.7rem]"
                >
                  Repay
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-1 text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
          Bank loan · {(BANK_RATE * 100).toFixed(1)}%/mo interest-only
        </div>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {[25_000, 50_000, 100_000].map((amt) => (
            <button
              key={amt}
              disabled={left < amt}
              onClick={() => act({ t: "LOAN", kind: "bank", amount: amt })}
              className="btn-dark h-10 text-[0.78rem] font-bold"
            >
              +{gbp(amt)}
            </button>
          ))}
        </div>

        <div className="mb-1 text-[0.66rem] font-bold uppercase tracking-wider text-coral-400/90">
          Bridge loan · {(BRIDGE_RATE * 100).toFixed(1)}%/mo — desperate money
        </div>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          <button
            disabled={left < 25_000}
            onClick={() => act({ t: "LOAN", kind: "bridge", amount: 25_000 })}
            className="btn-dark h-10 border-coral-500/40 text-[0.78rem] font-bold text-coral-400"
          >
            +£25k
          </button>
        </div>

        {refis.length > 0 && (
          <>
            <div className="mb-1 text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
              Refinance to 80% LTV (1% fee)
            </div>
            <div className="mb-3 space-y-1.5">
              {refis.map((h) => {
                const release = Math.round(h.value * 0.8) - h.mortgage;
                return (
                  <button
                    key={h.id}
                    onClick={() => act({ t: "REFI", holdingId: h.id })}
                    className="panel flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <span className="truncate text-[0.78rem] font-semibold">{h.def.name}</span>
                    <span className="font-ledger text-[0.78rem] font-bold text-lime-300">
                      release {gbp(Math.round(release * 0.99))}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!p.investorTaken && (
          <button
            onClick={() => act({ t: "INVESTOR" })}
            className="panel mb-3 w-full border-violet-400/40 px-3 py-2.5 text-left"
          >
            <div className="text-[0.8rem] font-bold text-violet-400">
              😇 Angel investor · +{gbp(INVESTOR_CASH)} now
            </div>
            <div className="text-[0.7rem] text-cream-50/55">
              They take 12% of your final Rental Empire Score. No repayments.
            </div>
          </button>
        )}

        <button onClick={() => act({ t: "CLOSE_SHOP" })} className="btn-primary h-11 w-full text-sm">
          Leave the bank
        </button>
      </div>
    </Sheet>
  );
}

export function UpgradeModal() {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const p = game.players[game.current];
  const cities = CITIES.filter((c) => p.holdings.some((h) => h.def.cityId === c.id));

  return (
    <Sheet open locked maxW="max-w-lg">
      <div className="p-4">
        <ShopHeader emoji="🛠️" title="Upgrades" sub="Sharpen the assets you already run" />

        {p.holdings.length === 0 && (
          <p className="mb-3 rounded-2xl bg-ink-800/70 p-4 text-center text-[0.78rem] text-cream-50/55">
            Nothing to upgrade yet — go land a property first.
          </p>
        )}

        <div className="space-y-2">
          {p.holdings.map((h) => (
            <div key={h.id} className="panel flex items-center gap-3 p-2.5">
              <PropertyArt hue={h.def.hue} emoji={h.def.emoji} className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.78rem] font-bold">{h.def.name}</div>
                <div className="text-[0.64rem] text-cream-50/50">
                  furnish ×{h.furnish.toFixed(2)} · review {h.review.toFixed(1)}★
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  disabled={h.furnish >= 1.3 || p.cash < 4000}
                  onClick={() => act({ t: "UPGRADE_FURNISH", holdingId: h.id })}
                  className="btn-dark h-9 px-2.5 text-[0.66rem] font-bold"
                  title="+12% ADR, +0.1 review"
                >
                  🛋️ £4k
                </button>
                <button
                  disabled={h.pricingTools || p.cash < 2500}
                  onClick={() => act({ t: "UPGRADE_PRICING", holdingId: h.id })}
                  className="btn-dark h-9 px-2.5 text-[0.66rem] font-bold"
                  title="+6% ADR from photos & dynamic pricing"
                >
                  📸 {h.pricingTools ? "✓" : "£2.5k"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {cities.length > 0 && (
          <>
            <div className="mb-1 mt-3 text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
              City compliance — blocks fines, permits & licence drama
            </div>
            <div className="space-y-1.5">
              {cities.map((c) => {
                const owned = p.cityCompliance.includes(c.id);
                const cost = 3000 + c.regRisk * 80;
                return (
                  <button
                    key={c.id}
                    disabled={owned || p.cash < cost}
                    onClick={() => act({ t: "UPGRADE_COMPLIANCE", cityId: c.id })}
                    className={clsx(
                      "panel flex w-full items-center justify-between px-3 py-2 text-left",
                      owned && "border-lime-400/50",
                    )}
                  >
                    <span className="text-[0.78rem] font-semibold">
                      {c.emoji} {c.name}
                      <span className="ml-1.5 text-[0.64rem] text-cream-50/50">
                        reg risk {cityById(c.id).regRisk}/100
                      </span>
                    </span>
                    <span className={clsx("font-ledger text-[0.78rem] font-bold", owned ? "text-lime-300" : "")}>
                      {owned ? "compliant ✓" : gbp(cost)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button onClick={() => act({ t: "CLOSE_SHOP" })} className="btn-primary mt-3 h-11 w-full text-sm">
          Done
        </button>
      </div>
    </Sheet>
  );
}
