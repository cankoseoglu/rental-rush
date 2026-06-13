"use client";

// Player cards (top) + the human's meter strip + the action dock.

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
    <div className="mx-auto flex w-full max-w-3xl gap-1.5 px-3">
      {game.players.map((p) => {
        const active = game.current === p.id && !game.over;
        const units = p.assets.reduce((s, a) => s + a.units, 0);
        const areas = Object.values(game.control).filter((c) => c === p.id).length;
        return (
          <button
            key={p.id}
            onClick={() => openSheet(p.isHuman ? "empire" : "rival", p.id)}
            className={clsx(
              "relative flex-1 rounded-2xl border-2 border-[#131722] bg-gradient-to-b from-[#FDF8EC] to-[#F1E7CE] px-2.5 py-1.5 text-left text-creamink",
              p.bankrupt && "opacity-40 saturate-0",
            )}
            style={{
              boxShadow: active
                ? `0 3px 0 rgba(0,0,0,0.28), 0 0 0 3px ${p.color}66`
                : "0 3px 0 rgba(0,0,0,0.28)",
            }}
          >
            <span
              className="absolute -top-[7px] left-3 h-[11px] w-7 rounded-full border-2 border-[#131722]"
              style={{ background: p.color }}
            />
            <div className="flex items-center justify-between gap-1 pl-0.5">
              <span className="truncate text-[0.7rem] font-extrabold">
                {p.emoji} {p.name}
                {p.bankrupt && " 💀"}
              </span>
              {active && <span className="text-[0.55rem] font-bold text-creamink/50">PLAYING</span>}
            </div>
            <div className={clsx("font-ledger text-[0.95rem] font-extrabold leading-tight", p.cash < 0 && "text-coral-500")}>
              {gbp(p.cash)}
            </div>
            <div className="flex items-center gap-1.5 text-[0.56rem] font-bold text-creamink/55">
              <span>🏠 {units}u</span>
              <span>🚩 {areas}</span>
              <span>★ {p.rep}</span>
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
    valueClass,
    sub,
    children,
  }: {
    label: string;
    value?: string;
    valueClass?: string;
    sub?: string;
    children?: React.ReactNode;
  }) => (
    <button onClick={() => openSheet("empire", 0)} className="panel flex flex-col gap-0.5 px-2.5 py-1.5 text-left">
      <span className="text-[0.56rem] font-bold uppercase tracking-wider text-cream-50/45">{label}</span>
      {value !== undefined && (
        <span className={clsx("font-ledger text-[0.84rem] font-semibold leading-none", valueClass)}>{value}</span>
      )}
      {children}
      {sub && <span className="text-[0.56rem] text-cream-50/45">{sub}</span>}
    </button>
  );

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-1.5 px-3">
      <Cell label="Cash" value={gbp(p.cash)} valueClass={p.cash < 0 ? "text-coral-400" : "text-lime-300"} />
      <Cell
        label={p.lastPnl ? "Last month" : "Est. monthly"}
        value={`${flow >= 0 ? "+" : ""}${gbp(flow)}`}
        valueClass={flow >= 0 ? "text-lime-300" : "text-coral-400"}
      />
      <Cell
        label="Debt"
        value={gbp(debt)}
        valueClass={debt > 250_000 ? "text-amber-400" : "text-cream-50"}
        sub={staffCost(p) > 0 ? `payroll ${gbp(staffCost(p))}/mo` : undefined}
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

  const Side = ({ emoji, label, sheet }: { emoji: string; label: string; sheet: "empire" | "bank" | "team" | "log" }) => (
    <button
      onClick={() => openSheet(sheet)}
      className="btn-dark flex h-12 w-12 flex-col items-center justify-center gap-0 text-base leading-none"
      aria-label={label}
      title={label}
    >
      {emoji}
      <span className="text-[0.45rem] font-bold uppercase tracking-wide text-cream-50/55">{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-ink-950 via-ink-950/95 to-transparent pt-6 lg:left-0 lg:right-[420px]">
      <div className="safe-bottom mx-auto flex w-full max-w-2xl items-center gap-1.5 px-3 pb-2">
        <Side emoji="📁" label="Empire" sheet="empire" />
        <Side emoji="🏦" label="Bank" sheet="bank" />
        <button
          onClick={() => void roll()}
          disabled={!canRoll}
          className="btn-primary h-12 min-w-0 flex-1 truncate px-2 text-[0.95rem] tracking-wide"
        >
          {canRoll ? "ROLL THE DICE 🎲" : ui.banner ?? (current.isHuman ? "…" : `${current.name} is playing…`)}
        </button>
        <Side emoji="🧑‍💼" label="Team" sheet="team" />
        <Side emoji="📜" label="Log" sheet="log" />
      </div>
    </div>
  );
}
