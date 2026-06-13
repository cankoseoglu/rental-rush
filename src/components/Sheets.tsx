"use client";

// Dock sheets: Empire (your assets by area), Rival snapshot, Team (hiring),
// Bank (loans / refi / investor), and the game log. Bank & Team are available
// any time on your turn — no tile gating in V2.

import { useGame } from "@/lib/store";
import { gbp, gbpFull } from "@/lib/game/format";
import { cityById } from "@/lib/game/data/cities";
import { STAFF, staffById, opsCapacity, staffCost } from "@/lib/game/data/staff";
import {
  areaById,
  equity,
  playerLoad,
  projectAssetNet,
  totalLoanDebt,
} from "@/lib/game/engine/sim";
import { creditLeft } from "@/lib/game/engine/reducer";
import { BANK_RATE, marketPhase } from "@/lib/game/types";
import { Sheet, Bar, AreaArt, ModelTag, StatusTag } from "./ui";
import clsx from "clsx";

export default function Sheets() {
  const game = useGame((s) => s.game);
  const ui = useGame((s) => s.ui);
  const openSheet = useGame((s) => s.openSheet);
  if (!game) return null;

  return (
    <>
      <Sheet open={ui.sheet === "empire"} onClose={() => openSheet(null)} maxW="max-w-lg">
        <Empire />
      </Sheet>
      <Sheet open={ui.sheet === "rival"} onClose={() => openSheet(null)} maxW="max-w-md">
        <Rival />
      </Sheet>
      <Sheet open={ui.sheet === "team"} onClose={() => openSheet(null)} maxW="max-w-lg">
        <Team />
      </Sheet>
      <Sheet open={ui.sheet === "bank"} onClose={() => openSheet(null)} maxW="max-w-lg">
        <Bank />
      </Sheet>
      <Sheet open={ui.sheet === "log"} onClose={() => openSheet(null)} maxW="max-w-md">
        <Log />
      </Sheet>
    </>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <button onClick={onClose} className="btn-dark h-8 px-3 text-xs">
        Close
      </button>
    </div>
  );
}

// --- Empire ----------------------------------------------------------------------

function Empire() {
  const game = useGame((s) => s.game)!;
  const ui = useGame((s) => s.ui);
  const openSheet = useGame((s) => s.openSheet);
  const selectArea = useGame((s) => s.selectArea);
  const p = game.players[0];
  const load = playerLoad(p);
  const cap = opsCapacity(p);
  const areas = [...new Set(p.assets.map((a) => a.areaId))];

  return (
    <div className="p-4 pb-6">
      <SheetHeader title="Your empire 🦊" onClose={() => openSheet(null)} />

      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
        {(
          [
            ["Cash", gbp(p.cash), p.cash < 0 ? "text-coral-400" : "text-lime-300"],
            ["Equity", gbp(equity(p)), "text-cream-50"],
            ["Loans", gbp(totalLoanDebt(p)), "text-cream-50"],
            ["Rep", `${p.rep}/100`, "text-cream-50"],
            ["Trust", `${p.trust}/100`, "text-cream-50"],
            ["Payroll", `${gbp(staffCost(p))}/mo`, "text-cream-50"],
          ] as Array<[string, string, string]>
        ).map(([k, v, cls]) => (
          <div key={k} className="panel px-2 py-1.5">
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

      <div className="mb-1.5 mt-4 text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
        Assets by area ({p.assets.length})
      </div>
      {p.assets.length === 0 && (
        <p className="rounded-2xl bg-ink-800/60 p-4 text-center text-[0.78rem] text-cream-50/50">
          No doors yet. Land on a neighbourhood and do a deal.
        </p>
      )}
      <div className="space-y-2">
        {areas.map((areaId) => {
          const area = areaById(game, areaId);
          const city = cityById(area.cityId);
          const assets = p.assets.filter((a) => a.areaId === areaId);
          const controlled = game.control[areaId] === 0;
          return (
            <button
              key={areaId}
              onClick={() => {
                selectArea(areaId);
                openSheet(null);
              }}
              className={clsx("panel w-full p-2.5 text-left", controlled && "border-lime-400/40")}
            >
              <div className="flex items-center gap-2.5">
                <AreaArt hue={city.hue} emoji={city.emoji} className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[0.8rem] font-bold">
                    <span className="truncate">{area.name}</span>
                    {controlled && <span className="text-[0.58rem] font-extrabold text-lime-300">🚩 CONTROLLED</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {assets.map((a) => (
                      <span key={a.id} className="flex items-center gap-1">
                        <ModelTag m={a.model} />
                        <StatusTag status={a.status} monthsToLive={a.monthsToLive} licenceMonths={a.licenceMonths} />
                        <span className={clsx("font-ledger text-[0.62rem] font-bold", (a.status === "live" ? projectAssetNet(game, p, a) : -a.monthlyFixed) >= 0 ? "text-lime-300" : "text-coral-400")}>
                          {a.units}u
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-cream-50/30">›</span>
              </div>
            </button>
          );
        })}
      </div>

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

// --- Rival ------------------------------------------------------------------------

function Rival() {
  const game = useGame((s) => s.game)!;
  const ui = useGame((s) => s.ui);
  const openSheet = useGame((s) => s.openSheet);
  const p = game.players[ui.rivalId ?? 1];
  if (!p) return null;
  const areasControlled = Object.values(game.control).filter((c) => c === p.id).length;

  return (
    <div className="p-4 pb-6">
      <SheetHeader title={`${p.emoji} ${p.name}${p.bankrupt ? " 💀" : ""}`} onClose={() => openSheet(null)} />
      <p className="mb-3 text-[0.74rem] text-cream-50/60">
        {p.personality === "aggressive"
          ? "Leases fast, loves buildings and Hotel Mode, hires late. One bad winter from chaos."
          : "Buys carefully, manages kindly, licences first, sleeps well. Annoyingly stable."}
      </p>
      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
        {(
          [
            ["Cash", gbp(p.cash)],
            ["Units", `${p.assets.reduce((s, a) => s + a.units, 0)}`],
            ["Areas", `${areasControlled}`],
            ["Rep", `${p.rep}`],
            ["Trust", `${p.trust}`],
            ["Loans", gbp(totalLoanDebt(p))],
          ] as Array<[string, string]>
        ).map(([k, v]) => (
          <div key={k} className="panel px-2 py-1.5">
            <div className="text-[0.58rem] uppercase tracking-wider text-cream-50/45">{k}</div>
            <div className="font-ledger text-[0.8rem] font-bold">{v}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {p.assets.map((a) => {
          const area = areaById(game, a.areaId);
          return (
            <div key={a.id} className="panel flex items-center justify-between px-3 py-2">
              <span className="truncate pr-2 text-[0.76rem] font-semibold">
                {area.name} {a.kind === "building" ? `block (${a.units}u)` : "unit"}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <ModelTag m={a.model} />
                <StatusTag status={a.status} monthsToLive={a.monthsToLive} licenceMonths={a.licenceMonths} />
              </span>
            </div>
          );
        })}
        {p.assets.length === 0 && (
          <p className="rounded-2xl bg-ink-800/60 p-3 text-center text-[0.74rem] text-cream-50/45">
            {p.bankrupt ? "Liquidated." : "No assets yet."}
          </p>
        )}
      </div>
    </div>
  );
}

// --- Team --------------------------------------------------------------------------

function Team() {
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
      <SheetHeader title="Your team 🧑‍💼" onClose={() => openSheet(null)} />
      <div className="mb-2 flex items-center justify-between text-[0.7rem] text-cream-50/60">
        <span>
          Payroll <span className="font-ledger font-bold text-cream-50">{gbp(staffCost(p))}/mo</span>
        </span>
        <span>
          Ops {load.toFixed(1)}/{cap}
        </span>
      </div>
      <Bar value={load} max={cap} color="#59C8DC" danger={load > cap} />
      {load > cap && (
        <p className="mt-1 text-[0.7rem] font-semibold text-coral-400">
          Over capacity — reviews and refunds are bleeding. Hire or calm something down.
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STAFF.map((s) => {
          const hired = p.staff.includes(s.id);
          return (
            <div key={s.id} className={clsx("panel p-3", hired && "border-lime-400/40")}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{s.emoji}</span>
                  <div>
                    <div className="text-[0.8rem] font-bold leading-tight">{s.name}</div>
                    <div className="font-ledger text-[0.68rem] text-cream-50/60">{gbp(s.salary)}/mo</div>
                  </div>
                </div>
                <button
                  disabled={!actionable}
                  onClick={() => act(hired ? { t: "FIRE", staff: s.id } : { t: "HIRE", staff: s.id })}
                  className={clsx(hired ? "btn-dark" : "btn-primary", "h-8 px-3 text-[0.72rem] font-bold")}
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
      {!actionable && (
        <p className="mt-2 text-center text-[0.66rem] text-cream-50/40">Hiring opens on your turn.</p>
      )}
    </div>
  );
}

// --- Bank ---------------------------------------------------------------------------

function Bank() {
  const game = useGame((s) => s.game)!;
  const ui = useGame((s) => s.ui);
  const act = useGame((s) => s.act);
  const openSheet = useGame((s) => s.openSheet);
  const p = game.players[0];
  const actionable = game.current === 0 && !ui.busy && !game.over;
  const left = creditLeft(game, p);
  const refis = p.assets.filter((a) => a.deal === "buy" && Math.round(a.value * 0.8) > a.mortgage + 5000);

  return (
    <div className="p-4 pb-6">
      <SheetHeader title="The bank 🏦" onClose={() => openSheet(null)} />
      <div className="mb-3 text-[0.7rem] text-cream-50/60">
        Credit available <span className="font-ledger font-bold text-cream-50">{gbp(left)}</span> · outstanding{" "}
        <span className="font-ledger font-bold text-cream-50">{gbp(totalLoanDebt(p))}</span>
      </div>

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
                disabled={!actionable || p.cash <= 0}
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
            disabled={!actionable || left < amt}
            onClick={() => act({ t: "LOAN", kind: "bank", amount: amt })}
            className="btn-dark h-10 text-[0.78rem] font-bold"
          >
            +{gbp(amt)}
          </button>
        ))}
      </div>

      <div className="mb-1 text-[0.66rem] font-bold uppercase tracking-wider text-coral-400/90">
        Bridge loan · {(game.market.bridgeRatePm * 100).toFixed(1)}%/mo — desperate money
        {marketPhase(game.month) === 2 && " (and getting worse)"}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <button
          disabled={!actionable || left < 25_000}
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
            {refis.map((a) => {
              const area = areaById(game, a.areaId);
              const release = Math.round(a.value * 0.8) - a.mortgage;
              return (
                <button
                  key={a.id}
                  disabled={!actionable}
                  onClick={() => act({ t: "REFI", assetId: a.id })}
                  className="panel flex w-full items-center justify-between px-3 py-2 text-left"
                >
                  <span className="truncate text-[0.78rem] font-semibold">{area.name} {a.kind === "building" ? "block" : "unit"}</span>
                  <span className="font-ledger text-[0.78rem] font-bold text-lime-300">
                    release {gbp(Math.round(release * 0.99))}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {!actionable && (
        <p className="mt-2 text-center text-[0.66rem] text-cream-50/40">The bank answers on your turn.</p>
      )}
    </div>
  );
}

// --- Log ----------------------------------------------------------------------------

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
      <SheetHeader title="The year so far 📜" onClose={() => openSheet(null)} />
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
