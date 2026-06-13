"use client";

// The square board: 24 tiles around a 7×7 cardboard grid. Tiles stay quiet —
// colour band, name, £ level, owner pills, model badges, pipeline chips,
// tokens. Everything deeper lives in the area panel.

import { useGame } from "@/lib/store";
import { tileGridPos } from "@/lib/game/data/areas";
import { cityById, seasonLabel } from "@/lib/game/data/cities";
import { MONTH_NAMES, type GameState, type Tile } from "@/lib/game/types";
import { areaById } from "@/lib/game/engine/sim";
import Dice from "./Dice";
import { BuildingIcon } from "./ui";
import clsx from "clsx";

const levelLabel = (l: number) => "£".repeat(l);

// Pipeline badges: a property here isn't live yet. Icon shows the stage,
// "Nmo" the months left; the full sentence lives in the hover tooltip, and the
// left stripe is colour-coded to whoever owns it.
function pipelineBadges(state: GameState, areaId: string) {
  const badges: Array<{ text: string; color: string; title: string }> = [];
  for (const p of state.players) {
    const who = p.isHuman ? "You have" : `${p.name} has`;
    for (const a of p.assets) {
      if (a.areaId !== areaId) continue;
      const what = a.kind === "building" ? `a ${a.units}-unit building` : "a unit";
      if (a.status === "prep")
        badges.push({
          text: `🏗️ ${a.monthsToLive}mo`,
          color: p.color,
          title: `${who} ${what} in early setup here — fit-out starts next month, live in about ${a.monthsToLive} month${a.monthsToLive === 1 ? "" : "s"}. No income yet.`,
        });
      else if (a.status === "furnishing")
        badges.push({
          text: `🛋️ ${a.monthsToLive}mo`,
          color: p.color,
          title: `${who} ${what} being furnished here — goes live in ${a.monthsToLive} month${a.monthsToLive === 1 ? "" : "s"}. No income until then.`,
        });
      if (a.licence === "applied")
        badges.push({
          text: `📋 ${a.licenceMonths}mo`,
          color: p.color,
          title: `${who} a licence application pending here — the council decides in ${a.licenceMonths} month${a.licenceMonths === 1 ? "" : "s"}.`,
        });
    }
  }
  return badges.slice(0, 2);
}

// Live presence per player: how many live units, and whether any is a "big"
// structure (a leased building or a hotel) → drives the house vs hotel icon.
function livePresence(state: GameState, areaId: string) {
  return state.players
    .map((p) => {
      const live = p.assets.filter((a) => a.areaId === areaId && a.status === "live");
      return {
        p,
        units: live.reduce((s, a) => s + a.units, 0),
        big: live.some((a) => a.model === "HOTEL" || a.kind === "building"),
      };
    })
    .filter((x) => x.units > 0 && !x.p.bankrupt);
}

function hasAnyAssets(state: GameState, areaId: string): boolean {
  return state.players.some((p) => !p.bankrupt && p.assets.some((a) => a.areaId === areaId));
}

function AreaTile({ tile, state }: { tile: Tile; state: GameState }) {
  const ui = useGame((s) => s.ui);
  const selectArea = useGame((s) => s.selectArea);
  const area = areaById(state, tile.areaId!);
  const city = cityById(area.cityId);
  const controllerId = state.control[area.id];
  const controller = controllerId !== null && controllerId !== undefined ? state.players[controllerId] : null;
  const present = livePresence(state, area.id);
  const anyAssets = hasAnyAssets(state, area.id);
  const pipes = pipelineBadges(state, area.id);
  const isLanding = ui.displayPos[state.current] === tile.idx && ui.busy;
  const selected = ui.selectedAreaId === area.id;

  return (
    <button
      onClick={() => selectArea(area.id)}
      title={`${area.name}, ${city.name}`}
      className={clsx(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[5px] border-2 border-[#131722] bg-gradient-to-b from-[#FDF8EC] to-[#F4EBD4] text-creamink transition-transform",
        isLanding && "tile-active z-10 scale-[1.07]",
        selected && "z-10 ring-2 ring-lime-400 ring-offset-1 ring-offset-[#131722]",
      )}
      style={
        controller
          ? { boxShadow: `inset 0 0 0 2.5px ${controller.color}cc, 0 2px 0 rgba(0,0,0,0.25)` }
          : { boxShadow: "0 2px 0 rgba(0,0,0,0.25)" }
      }
    >
      <div
        className="h-[7px] w-full shrink-0 border-b-2 border-[#131722]"
        style={{ background: `hsl(${city.hue} 70% 48%)` }}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-[2px] px-[2px] pt-[2px]">
        <div className="font-display w-full text-center text-[0.42rem] font-extrabold uppercase leading-[1.05] tracking-tight sm:text-[0.52rem]">
          {area.name}
        </div>
        <div className="font-ledger text-[0.42rem] font-bold text-creamink/55 sm:text-[0.5rem]">
          {levelLabel(area.level)}
        </div>
        {present.length > 0 ? (
          <div className="mt-[1px] flex max-w-full flex-wrap items-end justify-center gap-x-[3px]">
            {present.map(({ p, units, big }) => (
              <span
                key={p.id}
                className="relative flex items-end leading-none"
                title={`${p.name}: ${units} live ${big ? "building unit" : "unit"}${units > 1 ? "s" : ""}`}
              >
                <BuildingIcon
                  kind={big ? "hotel" : "house"}
                  color={p.color}
                  className="h-[16px] w-[16px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] sm:h-[20px] sm:w-[20px]"
                />
                {units > 1 && (
                  <span className="font-ledger ml-[0.5px] text-[0.46rem] font-extrabold text-creamink/85 sm:text-[0.56rem]">
                    {units}
                  </span>
                )}
              </span>
            ))}
          </div>
        ) : !anyAssets ? (
          <span className="rounded-full border border-creamink/25 px-[4px] text-[0.4rem] font-bold uppercase text-creamink/40 sm:text-[0.46rem]">
            open
          </span>
        ) : null}
      </div>
      {/* pipeline footer */}
      <div className="flex h-[12px] w-full shrink-0 items-end justify-start gap-[2px] px-[2px] pb-[2px]">
        {pipes.map((b, i) => (
          <span
            key={i}
            title={b.title}
            className="rounded-[3px] border border-[#131722] bg-amber-400 px-[2px] text-[0.36rem] font-extrabold leading-[1.4] text-[#131722] sm:text-[0.42rem]"
            style={{ borderLeftWidth: 3, borderLeftColor: b.color }}
          >
            {b.text}
          </span>
        ))}
      </div>
    </button>
  );
}

function SpecialTile({ tile, state }: { tile: Tile; state: GameState }) {
  const ui = useGame((s) => s.ui);
  const isLanding = ui.displayPos[state.current] === tile.idx && ui.busy;
  const corner = tile.kind === "corner" || tile.kind === "start";
  return (
    <div
      title={tile.label}
      className={clsx(
        "relative flex h-full w-full min-w-0 flex-col items-center justify-center gap-[2px] overflow-hidden rounded-[5px] border-2 border-[#131722] p-[2px] text-center",
        tile.kind === "start"
          ? "bg-gradient-to-b from-[#DEF3A8] to-[#C8E882]"
          : corner
            ? "bg-gradient-to-b from-[#EFDFAF] to-[#E4CD8C]"
            : "bg-gradient-to-b from-[#E7E2D2] to-[#DAD2BB]",
        isLanding && "tile-active z-10 scale-[1.07]",
      )}
      style={{ boxShadow: "0 2px 0 rgba(0,0,0,0.25)" }}
    >
      <span className="text-sm leading-none sm:text-lg">{tile.emoji}</span>
      <span className="font-display text-[0.4rem] font-extrabold uppercase leading-[1.05] text-[#131722] sm:text-[0.5rem]">
        {tile.label}
      </span>
    </div>
  );
}

/**
 * Classic board-game playing pieces: one chunky token per player, standing on the
 * board in an overlay layer, gliding tile to tile as displayPos animates.
 * Tokens cluster with per-player offsets so all three fit on one tile.
 */
const TOKEN_OFFSETS = [
  { x: -26, y: -22 }, // You — top-left of the cluster
  { x: 26, y: -22 }, // Maya — top-right
  { x: 0, y: 26 }, // Sam — bottom
];

function TokenLayer({ state }: { state: GameState }) {
  const ui = useGame((s) => s.ui);
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {state.players.map((p) => {
        if (p.bankrupt) return null;
        const idx = ui.displayPos[p.id] ?? p.pos;
        const pos = tileGridPos(idx);
        const off = TOKEN_OFFSETS[p.id];
        const isCurrent = state.current === p.id && !state.over;
        // cell centres in % of the board box (7×7 grid), plus a cluster offset
        const left = `${((pos.col - 0.5) / 7) * 100 + off.x / 7}%`;
        const top = `${((pos.row - 0.5) / 7) * 100 + off.y / 7}%`;
        return (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-150 ease-out"
            style={{ left, top }}
            aria-label={`${p.name} token`}
          >
            {/* keyed by tile so each hop replays the bounce */}
            <div
              key={idx}
              className={clsx(
                "token-hop flex items-center justify-center rounded-full border-2 border-[#131722] text-[0.78rem] leading-none sm:text-base",
                isCurrent ? "h-7 w-7 sm:h-9 sm:w-9" : "h-6 w-6 opacity-90 sm:h-7 sm:w-7",
              )}
              style={{
                background: `radial-gradient(circle at 32% 28%, #ffffffcc, ${p.color} 55%)`,
                boxShadow: isCurrent
                  ? `0 3px 0 rgba(0,0,0,0.35), 0 0 14px ${p.color}cc, 0 0 0 3px ${p.color}55`
                  : `0 2px 0 rgba(0,0,0,0.3), 0 0 8px ${p.color}66`,
              }}
              title={p.name}
            >
              {p.emoji}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Board() {
  const game = useGame((s) => s.game);
  const ui = useGame((s) => s.ui);
  if (!game) return null;
  const current = game.players[game.current];
  const monthIdx = game.month % MONTH_NAMES.length;

  return (
    <div className="no-scrollbar w-full overflow-x-auto">
      <div
        className="mx-auto w-full min-w-[340px] px-1"
        style={{ maxWidth: "min(100%, calc(100svh - 220px))" }}
      >
        <div
          className="relative grid aspect-square w-full grid-cols-7 grid-rows-7 gap-[3px] rounded-2xl border-[3px] border-[#131722] p-[5px]"
          style={{
            background:
              "radial-gradient(circle at 50% 32%, rgba(255,255,255,0.5), transparent 42%), linear-gradient(150deg, #F2E9D2, #E2D5B4)",
            boxShadow:
              "0 14px 0 rgba(0,0,0,0.3), 0 32px 60px rgba(0,0,0,0.35), inset 0 0 0 3px rgba(255,255,255,0.5)",
          }}
        >
          {game.tiles.map((tile) => {
            const pos = tileGridPos(tile.idx);
            return (
              <div key={tile.idx} style={{ gridRow: pos.row, gridColumn: pos.col }} className="min-h-0 min-w-0">
                {tile.kind === "area" ? (
                  <div className="h-full w-full [&>button]:h-full [&>button]:w-full">
                    <AreaTile tile={tile} state={game} />
                  </div>
                ) : (
                  <SpecialTile tile={tile} state={game} />
                )}
              </div>
            );
          })}

          {/* centre console */}
          <div
            className="z-0 m-[2px] flex flex-col items-center justify-center gap-1.5 rounded-xl border-[3px] border-[#131722] px-2 text-center"
            style={{
              gridRow: "2 / 7",
              gridColumn: "2 / 7",
              background:
                "radial-gradient(circle at 50% 28%, rgba(255,255,255,0.65), transparent 38%), linear-gradient(140deg, #EFDFB6, #D9C188)",
            }}
          >
            <div className="font-display text-xl font-extrabold tracking-tighter text-[#131722] sm:text-3xl">
              RENTAL<span className="text-[#4f8a00]">RUSH</span>
            </div>
            <div className="rounded-full border-2 border-[#131722] bg-[#FDF8EC] px-2.5 py-0.5 font-ledger text-[0.6rem] font-bold uppercase tracking-wider text-[#131722] sm:text-[0.7rem]">
              {MONTH_NAMES[monthIdx]} · {seasonLabel(monthIdx)}
            </div>
            <Dice a={ui.dice.a} b={ui.dice.b} rolling={ui.dice.rolling} />
            <div className="min-h-[2em] max-w-[220px] text-[0.72rem] font-bold leading-tight text-[#131722]/85">
              {ui.banner ? (
                ui.banner
              ) : current.isHuman ? (
                <span className="text-[#3c6e00]">Your move, operator</span>
              ) : (
                `${current.name}'s move`
              )}
            </div>
            <div className="rounded-full border-2 border-[#131722]/30 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wider text-[#131722]/60">
              Month {game.month + 1} · last operator standing wins
            </div>
            {game.market.lastCard && (
              <div className="max-w-[230px] text-[0.56rem] font-bold leading-tight text-[#131722]/55">
                {game.market.lastCard.emoji} {game.market.lastCard.title}
              </div>
            )}
          </div>

          <TokenLayer state={game} />
        </div>
      </div>
    </div>
  );
}
