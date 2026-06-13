"use client";

// ---------------------------------------------------------------------------
// Zustand store V2: GameState + turn orchestration + area selection.
// The engine mutates state in place; we shallow-copy the root to re-render.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import type { GameMode, GameState } from "./game/types";
import { createGame, dispatch, type Action } from "./game/engine/reducer";
import { botActionsFor } from "./game/bots";
import { loadGame, saveGame, clearSave } from "./game/save";
import { todayKey } from "./game/leaderboard";

export interface Toast {
  id: number;
  text: string;
  tone: "good" | "bad" | "neutral" | "money";
  color?: string;
}

type Screen = "menu" | "game" | "over";
type SheetKind = "empire" | "rival" | "team" | "bank" | "log" | null;

interface UI {
  screen: Screen;
  busy: boolean;
  displayPos: number[];
  dice: { a: number; b: number; rolling: boolean };
  toasts: Toast[];
  sheet: SheetKind;
  rivalId: number | null;
  selectedAreaId: string | null; // tap-to-inspect any tile
  pendingVisible: boolean;
  autoplay: boolean;
  speed: number;
  banner: string | null;
}

interface Store {
  game: GameState | null;
  ui: UI;
  hasSave: boolean;
  checkSave: () => void;
  newGame: (mode: GameMode, seedOverride?: string) => void;
  resume: () => void;
  quitToMenu: () => void;
  setSpeed: (s: number) => void;
  setAutoplay: (v: boolean) => void;
  openSheet: (s: SheetKind, rivalId?: number) => void;
  selectArea: (areaId: string | null) => void;
  roll: () => Promise<void>;
  act: (a: Action) => void;
  dismissToast: (id: number) => void;
}

let toastId = 1;
let logCursor = 0;

const initialUI = (): UI => ({
  screen: "menu",
  busy: false,
  displayPos: [0, 0, 0],
  dice: { a: 5, b: 2, rolling: false },
  toasts: [],
  sheet: null,
  rivalId: null,
  selectedAreaId: null,
  pendingVisible: false,
  autoplay: false,
  speed: 1,
  banner: null,
});

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const useGame = create<Store>()((set, get) => {
  const sleep = (ms: number) => {
    const { speed } = get().ui;
    const t = reducedMotion() ? Math.min(ms, 40) : ms / speed;
    return new Promise<void>((r) => setTimeout(r, t));
  };

  const refresh = () => {
    const g = get().game;
    if (g) set({ game: { ...g } });
  };

  const pushToasts = () => {
    const g = get().game;
    if (!g) return;
    const fresh = g.log.slice(logCursor);
    logCursor = g.log.length;
    if (!fresh.length) return;
    const items: Toast[] = fresh.map((l) => ({
      id: toastId++,
      text: l.text,
      tone: l.tone,
      color: l.playerId >= 0 ? g.players[l.playerId]?.color : undefined,
    }));
    set((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts, ...items].slice(-4) } }));
    for (const it of items) {
      setTimeout(() => get().dismissToast(it.id), 3400);
    }
  };

  const syncTokens = () => {
    const g = get().game;
    if (!g) return;
    set((s) => ({ ui: { ...s.ui, displayPos: g.players.map((p) => p.pos) } }));
  };

  const showOver = () => {
    const g = get().game;
    if (!g) return;
    clearSave();
    set((s) => ({
      ui: { ...s.ui, screen: "over", busy: false, pendingVisible: false, banner: null, sheet: null },
    }));
  };

  const animateRoll = async () => {
    const g = get().game!;
    const pid = g.current;
    const [a, b] = g.lastRoll ?? [3, 4];
    set((s) => ({ ui: { ...s.ui, dice: { a, b, rolling: true } } }));
    await sleep(700);
    set((s) => ({ ui: { ...s.ui, dice: { a, b, rolling: false } } }));
    await sleep(150);
    for (const step of g.lastPath) {
      set((s) => {
        const dp = [...s.ui.displayPos];
        dp[pid] = step;
        return { ui: { ...s.ui, displayPos: dp } };
      });
      await sleep(175);
    }
    await sleep(220);
  };

  const forceResolve = (g: GameState): Action => {
    const h = g.pendingQueue[0];
    switch (h.kind) {
      case "area":
        return { t: "CLOSE_AREA" };
      case "referral":
        return { t: "REFERRAL", accept: false };
      case "emergency":
        return { t: "DECLARE_BANKRUPTCY" };
      default:
        return { t: "ACK" };
    }
  };

  const runPendings = async (asBot: boolean) => {
    const get_ = get;
    let guard = 0;
    let lastSig = "";
    let same = 0;
    while (true) {
      const g = get_().game;
      if (!g || g.over) return;
      if (!g.pendingQueue.length) return;
      const isBotNow = !g.players[g.current].isHuman || get_().ui.autoplay;
      if (!isBotNow) {
        const h = g.pendingQueue[0];
        // let the landed token register before the panel slides up
        if (h.kind === "area") await sleep(240);
        set((s) => ({
          ui: {
            ...s.ui,
            pendingVisible: true,
            busy: false,
            banner: null,
            selectedAreaId: h.kind === "area" ? h.areaId : s.ui.selectedAreaId,
          },
        }));
        return; // human resolves via panel/modals
      }
      void asBot;
      if (guard++ > 80) return;
      const sig = `${g.current}|${g.pendingQueue[0].kind}|${g.players[g.current].cash}|${g.pendingQueue.length}|${g.month}`;
      same = sig === lastSig ? same + 1 : 0;
      lastSig = sig;
      const actions = same > 10 ? [forceResolve(g)] : botActionsFor(g);
      for (const a of actions) {
        await sleep(360);
        const gg = get_().game;
        if (!gg || gg.over) return;
        dispatch(gg, a);
        pushToasts();
        refresh();
        if (gg.over) {
          showOver();
          return;
        }
      }
    }
  };

  /** Advance the game until it's the human's input (or game over). */
  const pump = async () => {
    const get_ = get;
    for (let i = 0; i < 3000; i++) {
      const g = get_().game;
      if (!g) return;
      if (g.over) {
        showOver();
        return;
      }
      const p = g.players[g.current];
      const isBotTurn = !p.isHuman || get_().ui.autoplay;

      if (g.pendingQueue.length) {
        set((s) => ({
          ui: {
            ...s.ui,
            busy: isBotTurn,
            banner:
              isBotTurn && !p.isHuman
                ? `${p.name} ${p.emoji} is dealing…`
                : isBotTurn
                  ? "Autopilot…"
                  : null,
          },
        }));
        await runPendings(isBotTurn);
        if (!get_().game?.pendingQueue.length) continue;
        if (!isBotTurn) return;
        continue;
      }

      if (g.phase === "action") {
        dispatch(g, { t: "END_TURN" });
        saveGame(g);
        pushToasts();
        refresh();
        continue;
      }

      if (g.phase !== "awaitRoll") return;

      if (!isBotTurn) {
        set((s) => ({ ui: { ...s.ui, busy: false, banner: null, pendingVisible: false } }));
        return;
      }
      set((s) => ({
        ui: { ...s.ui, busy: true, banner: p.isHuman ? "Autopilot…" : `${p.name} ${p.emoji} is plotting…` },
      }));
      await sleep(520);
      const gg = get_().game;
      if (!gg || gg.over) continue;
      dispatch(gg, { t: "ROLL" });
      pushToasts();
      refresh();
      await animateRoll();
    }
  };

  return {
    game: null,
    ui: initialUI(),
    hasSave: false,

    checkSave: () => set({ hasSave: loadGame() !== null }),

    newGame: (mode, seedOverride) => {
      const seedText =
        seedOverride ??
        (mode === "daily" ? `rr-daily-${todayKey()}` : `rr-${Date.now()}-${Math.random()}`);
      const game = createGame({
        mode,
        seedText,
        dailyKey: mode === "daily" ? todayKey() : undefined,
      });
      logCursor = 0;
      set({
        game,
        ui: {
          ...initialUI(),
          screen: "game",
          autoplay: get().ui.autoplay,
          speed: get().ui.speed,
        },
      });
      syncTokens();
      pushToasts();
      saveGame(game);
      void pump();
    },

    resume: () => {
      const game = loadGame();
      if (!game) return;
      logCursor = game.log.length;
      set({ game, ui: { ...initialUI(), screen: "game" } });
      syncTokens();
      void pump();
    },

    quitToMenu: () => {
      const g = get().game;
      if (g && !g.over) saveGame(g);
      set({ ui: { ...get().ui, screen: "menu", sheet: null }, hasSave: loadGame() !== null });
    },

    setSpeed: (speed) => set((s) => ({ ui: { ...s.ui, speed } })),
    setAutoplay: (autoplay) => set((s) => ({ ui: { ...s.ui, autoplay } })),

    openSheet: (sheet, rivalId) =>
      set((s) => ({ ui: { ...s.ui, sheet, rivalId: rivalId ?? null } })),

    selectArea: (selectedAreaId) => set((s) => ({ ui: { ...s.ui, selectedAreaId } })),

    roll: async () => {
      const { game, ui } = get();
      if (!game || game.over || ui.busy) return;
      const p = game.players[game.current];
      if (!p.isHuman || game.phase !== "awaitRoll" || game.pendingQueue.length) return;
      set((s) => ({ ui: { ...s.ui, busy: true } }));
      dispatch(game, { t: "ROLL" });
      pushToasts();
      refresh();
      await animateRoll();
      saveGame(game);
      void pump();
    },

    act: (a) => {
      const g = get().game;
      if (!g || g.over) return;
      dispatch(g, a);
      saveGame(g);
      pushToasts();
      refresh();
      if (g.over) {
        showOver();
        return;
      }
      if (!g.pendingQueue.length) {
        set((s) => ({ ui: { ...s.ui, pendingVisible: false } }));
        void pump();
      }
    },

    dismissToast: (id) =>
      set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } })),
  };
});
