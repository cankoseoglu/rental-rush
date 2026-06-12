"use client";

import { useEffect } from "react";
import { useGame } from "@/lib/store";
import StartScreen from "./StartScreen";
import GameScreen from "./GameScreen";
import GameOverScreen from "./GameOverScreen";
import Toasts from "./Toasts";

export default function App() {
  const screen = useGame((s) => s.ui.screen);
  const checkSave = useGame((s) => s.checkSave);
  const setAutoplay = useGame((s) => s.setAutoplay);
  const setSpeed = useGame((s) => s.setSpeed);
  const newGame = useGame((s) => s.newGame);

  useEffect(() => {
    checkSave();
    const sp = new URLSearchParams(window.location.search);
    const seed = sp.get("seed") ?? undefined;
    if (sp.get("auto") === "1") {
      setAutoplay(true);
      if (sp.get("fast") === "1") setSpeed(8);
      newGame(sp.get("daily") === "1" ? "daily" : "quick", seed);
    } else if (sp.get("modals") === "1") {
      // dev hook: start a seeded game and roll the first human turn so the
      // resulting modal can be inspected/screenshotted deterministically
      newGame("quick", seed);
      setTimeout(() => void useGame.getState().roll(), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh overflow-x-clip font-body" data-screen={screen}>
      {screen === "menu" && <StartScreen />}
      {screen === "game" && <GameScreen />}
      {screen === "over" && <GameOverScreen />}
      <Toasts />
    </div>
  );
}
