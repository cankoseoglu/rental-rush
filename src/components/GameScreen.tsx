"use client";

import { useState } from "react";
import { useGame } from "@/lib/store";
import Board from "./Board";
import AreaPanel from "./AreaPanel";
import BoardKey from "./BoardKey";
import { PlayerStrip, HumanHud, ActionDock } from "./Hud";
import Modals from "./Modals";
import Sheets from "./Sheets";
import { Sheet } from "./ui";

export default function GameScreen() {
  const game = useGame((s) => s.game);
  const ui = useGame((s) => s.ui);
  const setSpeed = useGame((s) => s.setSpeed);
  const toggleSound = useGame((s) => s.toggleSound);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const selectArea = useGame((s) => s.selectArea);
  const [keyOpen, setKeyOpen] = useState(false);
  if (!game) return null;

  const head = game.pendingQueue[0];
  const interactiveArea =
    head?.kind === "area" && game.players[game.current].isHuman && !ui.autoplay && ui.pendingVisible
      ? head.areaId
      : null;
  const panelAreaId = interactiveArea ?? ui.selectedAreaId;

  const scoutHint = (
    <div className="p-6 text-center text-[0.78rem] text-cream-50/45">
      <div className="mb-2 text-2xl">🗺️</div>
      Tap any neighbourhood to inspect it.
      <br />
      Land on one to do deals.
    </div>
  );

  return (
    <div className="min-h-dvh" data-testid="game-screen">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2.5 pb-32 pt-2 lg:flex-row lg:justify-center lg:items-start lg:gap-5 lg:px-5">
        {/* LEFT: thin top bar + the board, sized to fill the screen height */}
        <div className="flex min-w-0 flex-col gap-2.5 lg:w-[min(calc(100vw-420px),calc(100svh-120px))] lg:shrink-0">
          <div className="flex w-full items-center justify-between px-3 lg:px-0">
            <button onClick={quitToMenu} className="font-display text-sm font-extrabold tracking-tight">
              RENTAL<span className="text-lime-400">RUSH</span>
            </button>
            <div className="flex items-center gap-1.5">
              {ui.autoplay && <span className="chip text-amber-400">autopilot</span>}
              <button
                onClick={toggleSound}
                className="chip text-cream-50/70"
                aria-label={ui.soundMuted ? "unmute sound" : "mute sound"}
                aria-pressed={!ui.soundMuted}
              >
                {ui.soundMuted ? "🔇" : "🔊"}
              </button>
              <button onClick={() => setSpeed(ui.speed === 1 ? 2 : 1)} className="chip text-cream-50/70" aria-label="toggle game speed">
                {ui.speed === 1 ? "1×" : "2×"} ⏩
              </button>
              <button onClick={() => setKeyOpen(true)} className="chip text-cream-50/70" aria-label="board key">
                ❔ Key
              </button>
              <button onClick={quitToMenu} className="chip text-cream-50/70" aria-label="menu">
                ☰
              </button>
            </div>
          </div>

          {/* mobile keeps players above + meters below the board */}
          <div className="lg:hidden">
            <PlayerStrip />
          </div>
          <Board />
          <div className="lg:hidden">
            <HumanHud />
          </div>
        </div>

        {/* RIGHT rail (desktop): players, meters, then the area panel */}
        <aside className="sticky top-2 hidden max-h-[calc(100dvh-1rem)] w-[360px] shrink-0 flex-col gap-2.5 overflow-y-auto lg:flex">
          <PlayerStrip />
          <HumanHud />
          <div className="panel">
            {panelAreaId ? (
              <AreaPanel areaId={panelAreaId} interactive={interactiveArea === panelAreaId} />
            ) : (
              scoutHint
            )}
          </div>
        </aside>
      </div>

      {/* mobile: area panel as bottom sheet */}
      <div className="lg:hidden">
        <Sheet
          open={!!interactiveArea || (!!ui.selectedAreaId && !ui.busy && !interactiveArea && !head)}
          locked={!!interactiveArea}
          onClose={() => selectArea(null)}
          maxW="max-w-lg"
        >
          {panelAreaId && (
            <AreaPanel areaId={panelAreaId} interactive={interactiveArea === panelAreaId} />
          )}
        </Sheet>
      </div>

      <ActionDock />
      <Modals />
      <Sheets />
      <BoardKey open={keyOpen} onClose={() => setKeyOpen(false)} />
    </div>
  );
}
