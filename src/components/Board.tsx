"use client";

import { useGame } from "@/lib/store";
import { TILE_TINT } from "@/lib/game/data/board";
import { MONTH_NAMES } from "@/lib/game/types";
import { seasonLabel } from "@/lib/game/data/cities";
import Dice from "./Dice";
import clsx from "clsx";

const RADIUS = 43; // % from centre
const TILE = 14.5; // % tile size

function tilePos(idx: number, count: number) {
  const deg = (idx / count) * 360 - 90;
  const rad = (deg * Math.PI) / 180;
  return {
    left: `${50 + RADIUS * Math.cos(rad)}%`,
    top: `${50 + RADIUS * Math.sin(rad)}%`,
  };
}

const TOKEN_OFFSET = [
  { x: -11, y: -11 },
  { x: 11, y: -7 },
  { x: 0, y: 12 },
];

export default function Board() {
  const game = useGame((s) => s.game);
  const ui = useGame((s) => s.ui);
  if (!game) return null;

  const human = game.players[0];
  const current = game.players[game.current];
  const monthIdx = human.monthsDone;
  const month = MONTH_NAMES[monthIdx % MONTH_NAMES.length];
  const landingTile = ui.displayPos[game.current];

  return (
    <div className="relative mx-auto aspect-square w-[min(94vw,440px)] select-none md:w-[min(46vw,560px)]">
      {/* felt ring */}
      <div
        className="absolute inset-[6%] rounded-full border border-line/60"
        style={{
          background:
            "radial-gradient(circle at 50% 38%, rgba(31,48,80,0.55), rgba(10,16,28,0.9) 70%)",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.55)",
        }}
      />
      <div className="absolute inset-[20%] rounded-full border border-dashed border-line/40" />

      {/* tiles */}
      {game.tiles.map((tile) => {
        const pos = tilePos(tile.idx, game.tiles.length);
        const isLanding = landingTile === tile.idx && ui.busy;
        const tint = TILE_TINT[tile.kind];
        return (
          <div
            key={tile.idx}
            title={tile.label}
            className={clsx(
              "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border transition-transform",
              tile.kind === "start"
                ? "border-lime-400/70 bg-lime-400/10"
                : "border-white/8 bg-ink-800/95",
              isLanding && "tile-active scale-110",
            )}
            style={{
              ...pos,
              width: `${tile.kind === "start" ? TILE + 2 : TILE}%`,
              height: `${tile.kind === "start" ? TILE + 2 : TILE}%`,
              boxShadow: "0 8px 18px -8px rgba(0,0,0,0.7)",
            }}
          >
            <span className="text-base leading-none sm:text-lg">{tile.emoji}</span>
            <span
              className="mt-1 h-1 w-4 rounded-full opacity-80"
              style={{ background: tint }}
            />
          </div>
        );
      })}

      {/* tokens */}
      {game.players.map((p) => {
        if (p.bankrupt) return null;
        const pos = tilePos(ui.displayPos[p.id] ?? p.pos, game.tiles.length);
        const off = TOKEN_OFFSET[p.id];
        return (
          <div
            key={p.id}
            className="absolute z-20 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-ink-950 text-[9px] font-extrabold text-ink-900 transition-all duration-150 ease-out"
            style={{
              left: `calc(${pos.left} + ${off.x}px)`,
              top: `calc(${pos.top} + ${off.y}px)`,
              transform: "translate(-50%, -50%)",
              background: p.color,
              boxShadow: `0 0 10px ${p.color}66`,
            }}
            aria-label={`${p.name} token`}
          >
            {p.name[0]}
          </div>
        );
      })}

      {/* centre console */}
      <div className="absolute inset-[24%] z-10 flex flex-col items-center justify-center gap-2 rounded-full text-center">
        <div className="chip font-ledger text-[0.66rem] uppercase tracking-wider text-cream-50/80">
          {month} · {seasonLabel(monthIdx)}
        </div>
        <Dice a={ui.dice.a} b={ui.dice.b} rolling={ui.dice.rolling} />
        <div className="min-h-[2.1em] px-3 text-[0.78rem] font-semibold leading-tight text-cream-50/90">
          {ui.banner ? (
            <span className="opacity-90">{ui.banner}</span>
          ) : current.isHuman ? (
            <span className="text-lime-300">Your roll, operator</span>
          ) : (
            <span>{current.name}&apos;s turn</span>
          )}
        </div>
        <div className="chip text-[0.64rem] text-cream-50/60">
          Turn {Math.min(human.turnsDone + 1, game.maxTurns)}/{game.maxTurns}
        </div>
      </div>
    </div>
  );
}
