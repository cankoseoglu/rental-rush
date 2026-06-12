"use client";

// Player strip (all 3) + the human's meter row + action dock.

import { useGame } from "@/lib/store";
import { gbp } from "@/lib/game/format";
import { opsCapacity, staffCost } from "@/lib/game/data/staff";
import { playerLoad, proformaNOI, totalDebt } from "@/lib/game/engine/sim";
import { Bar } from "./ui";
import clsx from "clsx";

export function PlayerStrip() {
  const game = useGame((s) => s.game);
  const openSheet = useGame((s) => s.openSheet);
  if (!game) return null;
  return (
    <div className="mx-auto flex w-full max-w-xl gap-1.5 px-3">
      {game.players.map((p) => {
        const active = game.current === p.id && !game.over;
        return (
          <button
            key={p.id}
            onClick={() => openSheet(p.isHuman ? "portfolio" : "rival", p.id)}
            className={clsx(
              "panel relative flex-1 px-2.5 py-1.5 text-left transition-all",
              active && "ring-1 ring-offset-0",
              p.bankrupt && "opacity-40 saturate-0",
            )}
            style={active ? ({ ["--tw-ring-color" as string]: p.color } as React.CSSProperties) : undefined}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{p.emoji}</span>
              <span className="truncate text-[0.72rem] font-bold" style={{ color: p.color }}>
                {p.name}
              </span>
              {p.bankrupt && <span className="text-[0.6rem]">💀</span>}
            </div>
            <div className={clsx("font-ledger text-[0.82rem] font-semibold", p.cash < 0 ? "text-coral-400" : "text-cream-50")}>
              {gbp(p.cash)}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[0.6rem] text-cream-50/55">
              <span>🏠 {p.holdings.length}</span>
              <span>★ {p.rep}</span>
              <span>🤝 {p.trust}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function HumanHud() {
  const game = useGame((s) => s.game);
  const openSheet = useGame((s) => s.openSheet);
  if (!game) return null;
  const p = game.players[0];
  const load = playerLoad(p);
  const cap = opsCapacity(p);
  const noi = proformaNOI(p, game);
  const debt = totalDebt(p);
  const flow = p.lastPnl ? p.lastPnl.net : noi;

  const Cell = ({
    label,
    value,
    sub,
    valueClass,
    children,
  }: {
    label: string;
    value?: string;
    sub?: string;
    valueClass?: string;
    children?: React.ReactNode;
  }) => (
    <button
      onClick={() => openSheet("portfolio", 0)}
      className="panel flex flex-col gap-0.5 px-2.5 py-1.5 text-left"
    >
      <span className="text-[0.58rem] font-bold uppercase tracking-wider text-cream-50/45">
        {label}
      </span>
      {value !== undefined && (
        <span className={clsx("font-ledger text-[0.85rem] font-semibold leading-none", valueClass)}>
          {value}
        </span>
      )}
      {children}
      {sub && <span className="text-[0.58rem] text-cream-50/45">{sub}</span>}
    </button>
  );

  return (
    <div className="mx-auto grid w-full max-w-xl grid-cols-3 gap-1.5 px-3">
      <Cell
        label="Cash"
        value={gbp(p.cash)}
        valueClass={p.cash < 0 ? "text-coral-400" : "text-lime-300"}
      />
      <Cell
        label={p.lastPnl ? "Last month" : "Est. monthly"}
        value={`${flow >= 0 ? "+" : ""}${gbp(flow)}`}
        valueClass={flow >= 0 ? "text-lime-300" : "text-coral-400"}
      />
      <Cell
        label="Debt"
        value={gbp(debt)}
        valueClass={debt > 250_000 ? "text-amber-400" : "text-cream-50"}
        sub={staffCost(p) > 0 ? `staff ${gbp(staffCost(p))}/mo` : undefined}
      />
      <Cell label={`Ops ${load.toFixed(1)}/${cap}`}>
        <Bar value={load} max={cap} color="#59C8DC" danger={load > cap} />
      </Cell>
      <Cell label={`Reputation ${p.rep}`}>
        <Bar value={p.rep} max={100} color="#B9F33E" danger={p.rep < 40} />
      </Cell>
      <Cell label={`Owner trust ${p.trust}`}>
        <Bar value={p.trust} max={100} color="#C9A0FF" danger={p.trust < 35} />
      </Cell>
    </div>
  );
}

export function ActionDock() {
  const game = useGame((s) => s.game);
  const ui = useGame((s) => s.ui);
  const roll = useGame((s) => s.roll);
  const openSheet = useGame((s) => s.openSheet);
  if (!game) return null;
  const current = game.players[game.current];
  const canRoll =
    current.isHuman && !ui.busy && !ui.autoplay && game.phase === "awaitRoll" && !game.pendingQueue.length;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-ink-950 via-ink-950/95 to-transparent pt-6">
      <div className="safe-bottom mx-auto flex w-full max-w-xl items-center gap-2 px-3 pb-2">
        <button
          onClick={() => openSheet("portfolio", 0)}
          className="btn-dark flex h-12 w-12 items-center justify-center text-lg"
          aria-label="Portfolio"
        >
          📁
        </button>
        <button
          onClick={() => void roll()}
          disabled={!canRoll}
          className="btn-primary h-12 flex-1 text-base tracking-wide"
        >
          {canRoll ? "ROLL THE DICE 🎲" : ui.banner ?? (current.isHuman ? "…" : `${current.name} is playing…`)}
        </button>
        <button
          onClick={() => openSheet("log")}
          className="btn-dark flex h-12 w-12 items-center justify-center text-lg"
          aria-label="Game log"
        >
          📜
        </button>
      </div>
    </div>
  );
}
