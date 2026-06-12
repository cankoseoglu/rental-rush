"use client";

import { useGame } from "@/lib/store";
import Board from "./Board";
import { PlayerStrip, HumanHud, ActionDock } from "./Hud";
import Modals from "./Modals";
import Sheets from "./PortfolioSheet";

export default function GameScreen() {
  const game = useGame((s) => s.game);
  const ui = useGame((s) => s.ui);
  const setSpeed = useGame((s) => s.setSpeed);
  const quitToMenu = useGame((s) => s.quitToMenu);
  if (!game) return null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-2.5 pb-32 pt-2" data-testid="game-screen">
      {/* top bar */}
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-3">
        <button onClick={quitToMenu} className="font-display text-sm font-extrabold tracking-tight">
          RENTAL<span className="text-lime-400">RUSH</span>
        </button>
        <div className="flex items-center gap-1.5">
          {ui.autoplay && <span className="chip text-amber-400">autopilot</span>}
          <button
            onClick={() => setSpeed(ui.speed === 1 ? 2 : 1)}
            className="chip text-cream-50/70"
            aria-label="toggle game speed"
          >
            {ui.speed === 1 ? "1×" : "2×"} ⏩
          </button>
          <button onClick={quitToMenu} className="chip text-cream-50/70" aria-label="menu">
            ☰
          </button>
        </div>
      </div>

      <PlayerStrip />

      <div className="md:flex md:items-center md:justify-center md:gap-8">
        <Board />
        <div className="mt-2 md:mt-0 md:w-[340px]">
          <HumanHud />
        </div>
      </div>

      <ActionDock />
      <Modals />
      <Sheets />
    </div>
  );
}
