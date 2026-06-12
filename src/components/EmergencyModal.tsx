"use client";

// Cash-crisis modal: bridge loan, fire sales, payout delays, staff cuts,
// strategy conversions — or the long walk to bankruptcy.

import { useState } from "react";
import { useGame } from "@/lib/store";
import { creditLeft } from "@/lib/game/engine/reducer";
import { gbp, gbpFull } from "@/lib/game/format";
import { staffById } from "@/lib/game/data/staff";
import { BANKRUPT_FLOOR, SELL_FIRE } from "@/lib/game/types";
import { Sheet } from "./ui";
import clsx from "clsx";

export default function EmergencyModal() {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const p = game.players[game.current];
  const [armDeclare, setArmDeclare] = useState(false);

  const needed = Math.max(0, -p.cash);
  const bridge = Math.min(needed + 15_000, creditLeft(p));
  const canBridge = bridge >= 5_000;
  const canDelay = (p.lastPnl?.ownerPayouts ?? 0) > 0 && p.owedOwners === 0;
  const strLeases = p.holdings.filter((h) => h.strategy === "STR");

  return (
    <Sheet open locked maxW="max-w-lg" tone="danger">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-coral-500/20 text-2xl">
            🚨
          </span>
          <div>
            <h3 className="font-display text-xl font-bold text-coral-400">Cash crisis</h3>
            <p className="text-[0.74rem] text-cream-50/65">
              You're at{" "}
              <span className="font-ledger font-bold text-coral-400">{gbpFull(p.cash)}</span>. Below{" "}
              {gbpFull(BANKRUPT_FLOOR)} you're done. Claw your way back.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {canBridge && (
            <button
              onClick={() => act({ t: "LOAN", kind: "bridge", amount: bridge })}
              className="panel w-full px-4 py-3 text-left"
            >
              <div className="text-sm font-bold">🌉 Bridge loan +{gbp(bridge)}</div>
              <div className="text-[0.7rem] text-cream-50/55">
                2.5%/month interest. Expensive, fast, no questions.
              </div>
            </button>
          )}

          {canDelay && (
            <button onClick={() => act({ t: "DELAY_PAYOUT" })} className="panel w-full px-4 py-3 text-left">
              <div className="text-sm font-bold">⏳ Delay owner payouts +{gbp(p.lastPnl!.ownerPayouts)}</div>
              <div className="text-[0.7rem] text-coral-400/90">Owner trust −20. They will remember this.</div>
            </button>
          )}

          {p.holdings.length > 0 && (
            <div className="panel px-4 py-3">
              <div className="mb-1.5 text-sm font-bold">🏷️ Fire-sell / hand back</div>
              <div className="space-y-1.5">
                {p.holdings.map((h) => {
                  const proceeds =
                    h.deal === "buy"
                      ? Math.round(h.value * SELL_FIRE) - h.mortgage
                      : h.deal === "lease"
                        ? -h.def.leaseMonthly
                        : 0;
                  return (
                    <button
                      key={h.id}
                      onClick={() => act({ t: "SELL", holdingId: h.id, fire: true })}
                      className="flex w-full items-center justify-between rounded-xl bg-ink-800/70 px-3 py-2 text-left"
                    >
                      <span className="truncate pr-2 text-[0.74rem] font-semibold">
                        {h.def.name}
                        <span className="ml-1 text-[0.62rem] text-cream-50/45">({h.deal})</span>
                      </span>
                      <span
                        className={clsx(
                          "font-ledger shrink-0 text-[0.74rem] font-bold",
                          proceeds > 0 ? "text-lime-300" : "text-cream-50/55",
                        )}
                      >
                        {h.deal === "manage" ? "−5 trust" : `${proceeds >= 0 ? "+" : ""}${gbp(proceeds)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {p.staff.length > 0 && (
            <div className="panel px-4 py-3">
              <div className="mb-1.5 text-sm font-bold">✂️ Cut payroll</div>
              <div className="flex flex-wrap gap-1.5">
                {p.staff.map((id) => {
                  const s = staffById(id);
                  return (
                    <button
                      key={id}
                      onClick={() => act({ t: "FIRE", staff: id })}
                      className="chip text-coral-400"
                    >
                      {s.emoji} {s.name} · save {gbp(s.salary)}/mo
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {strLeases.length > 0 && (
            <div className="panel px-4 py-3">
              <div className="mb-1.5 text-sm font-bold">🔄 Calm a unit down (£500)</div>
              <div className="space-y-1.5">
                {strLeases.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-[0.74rem] font-semibold">{h.def.name}</span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        onClick={() => act({ t: "CONVERT", holdingId: h.id, strategy: "MTR" })}
                        className="chip text-teal-400"
                      >
                        → MTR
                      </button>
                      <button
                        onClick={() => act({ t: "CONVERT", holdingId: h.id, strategy: "LTR" })}
                        className="chip text-sage-400"
                      >
                        → LTR
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {p.cash >= 0 ? (
            <button onClick={() => act({ t: "EMERGENCY_DONE" })} className="btn-primary h-12 w-full text-sm">
              Back to business — {gbpFull(p.cash)}
            </button>
          ) : p.cash >= BANKRUPT_FLOOR ? (
            <button onClick={() => act({ t: "EMERGENCY_DONE" })} className="btn-dark h-12 w-full text-sm">
              Limp on in the red ({gbpFull(p.cash)}) · rep & trust −5
            </button>
          ) : (
            <div className="rounded-2xl bg-coral-500/15 p-3 text-center text-[0.76rem] font-semibold text-coral-400">
              You're beyond {gbpFull(BANKRUPT_FLOOR)}. Raise cash above the floor — or fold.
            </div>
          )}
          <button
            onClick={() => (armDeclare ? act({ t: "DECLARE_BANKRUPTCY" }) : setArmDeclare(true))}
            className={clsx("h-11 w-full rounded-full text-sm font-bold", armDeclare ? "btn-danger" : "text-coral-400/70")}
          >
            {armDeclare ? "Confirm: declare bankruptcy 💀" : "Declare bankruptcy…"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
