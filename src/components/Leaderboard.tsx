"use client";

import { useEffect, useState } from "react";
import { BOARDS, boardRows, type BoardId, type BoardRow } from "@/lib/game/leaderboard";
import { ARCHETYPES } from "@/lib/game/engine/score";
import clsx from "clsx";

export default function Leaderboard({
  highlightRunId,
  initialBoard = "overall",
}: {
  highlightRunId?: string;
  initialBoard?: BoardId;
}) {
  const [board, setBoard] = useState<BoardId>(initialBoard);
  const [rows, setRows] = useState<BoardRow[]>([]);

  useEffect(() => {
    setRows(boardRows(board, highlightRunId));
  }, [board, highlightRunId]);

  const def = BOARDS.find((b) => b.id === board)!;

  return (
    <div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBoard(b.id)}
            className={clsx(
              "chip shrink-0",
              board === b.id ? "border-lime-400/60 bg-lime-400/10 text-lime-300" : "text-cream-50/60",
            )}
          >
            {b.emoji} {b.name}
          </button>
        ))}
      </div>
      <div className="mb-1.5 px-1 text-[0.62rem] uppercase tracking-wider text-cream-50/40">
        {def.metricLabel}
      </div>
      <div className="space-y-1">
        {rows.length === 0 && (
          <p className="rounded-2xl bg-ink-800/60 p-4 text-center text-[0.74rem] text-cream-50/45">
            Nobody here yet today. Be the first.
          </p>
        )}
        {rows.slice(0, 12).map(({ rank, run, isYou }) => (
          <div
            key={run.id}
            className={clsx(
              "flex items-center gap-2.5 rounded-xl px-3 py-1.5",
              isYou ? "border border-lime-400/60 bg-lime-400/10" : "bg-ink-800/50",
            )}
          >
            <span className={clsx("font-ledger w-7 shrink-0 text-[0.78rem] font-bold", rank <= 3 ? "text-amber-400" : "text-cream-50/45")}>
              {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
            </span>
            <span className="shrink-0 text-sm">{ARCHETYPES[run.archetype].emoji}</span>
            <span className={clsx("min-w-0 flex-1 truncate text-[0.78rem] font-semibold", isYou && "text-lime-300")}>
              {run.nickname}
              {isYou && " (you)"}
            </span>
            <span className="font-ledger shrink-0 text-[0.78rem] font-bold">{def.metric(run)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
