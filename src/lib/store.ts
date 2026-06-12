"use client";

// ---------------------------------------------------------------------------
// Zustand store: holds the GameState, orchestrates turn flow, animations and
// bot turns. The engine mutates state in place; we shallow-copy the root to
// re-render. All UI pacing (dice, token hops, bot "thinking") lives here.
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
type SheetKind = "portfolio" | "log" | "rival" | null;

interface UI {
  screen: Screen;
  busy: boolean; // an animation/bot sequence is running
  displayPos: number[]; // animated token positions
  dice: { a: number; b: number; rolling: boolean; show: boolean };
  toasts: Toast[];
  sheet: SheetKind;
  rivalId: number | null;
  pendingVisible: boolean;
  autoplay: boolean;
  speed: number; // 1 normal, 2 fast
  banner: string | null; // “Maya is plotting…”
}

interface Store {
  game: GameState | null;
  ui: UI;
  hasSave: boolean;
  // lifecycle
  checkSave: () => void;
  newGame: (mode: GameMode, seedOverride?: string) => void;
  resume: () => void;
  quitToMenu: () => void;
  setSpeed: (s: number) => void;
  setAutoplay: (v: boolean) => void;
  openSheet: (s: SheetKind, rivalId?: number) => void;
  // gameplay
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
  dice: { a: 5, b: 2, rolling: false, show: true },
  toasts: [],
  sheet: null,
  rivalId: null,
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
    set((s) => ({ ui: { ...s.ui, screen: "over", busy: false, pendingVisible: false, banner: null } }));
  };

  /** Dice + token-hop animation for whoever just rolled. */
  const animateRoll = async () => {
    const g = get().game!;
    const pid = g.current;
    const [a, b] = g.lastRoll ?? [3, 4];
    set((s) => ({ ui: { ...s.ui, dice: { a, b, rolling: true, show: true } } }));
    await sleep(700);
    set((s) => ({ ui: { ...s.ui, dice: { a, b, rolling: false, show: true } } }));
    await sleep(150);
    for (const step of g.lastPath) {
      set((s) => {
        const dp = [...s.ui.displayPos];
        dp[pid] = step;
        return { ui: { ...s.ui, displayPos: dp } };
      });
      await sleep(110);
    }
    await sleep(180);
  };

  /** Bot (or autopilot) plays out its pending queue. */
  const runPendings = async (asBot: boolean) => {
    const get_ = get;
    let guard = 0;
    let lastSig = "";
    let same = 0;
    while (true) {
      const g = get_().game;
      if (!g || g.over) return;
      if (!g.pendingQueue.length) return;
      if (!asBot) {
        set((s) => ({ ui: { ...s.ui, pendingVisible: true, busy: false } }));
        return; // human resolves via modals
      }
      if (guard++ > 60) return;
      const sig = `${g.current}|${g.pendingQueue[0].kind}|${g.players[g.current].cash}|${g.pendingQueue.length}`;
      same = sig === lastSig ? same + 1 : 0;
      lastSig = sig;
      const actions =
        same > 10
          ? ([forceResolve(g)] as Action[]) // stall breaker
          : botActionsFor(g);
      for (const a of actions) {
        await sleep(380);
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

  const forceResolve = (g: GameState): Action => {
    const h = g.pendingQueue[0];
    switch (h.kind) {
      case "property":
        return { t: "PASS_DEAL" };
      case "referral":
        return { t: "REFERRAL", accept: false };
      case "emergency":
        return { t: "DECLARE_BANKRUPTCY" };
      case "hiring":
      case "finance":
      case "upgrade":
        return { t: "CLOSE_SHOP" };
      default:
        return { t: "ACK" };
    }
  };

  /** Advance the game until it's the human's await-roll (or game over). */
  const pump = async () => {
    const get_ = get;
    // generous ceiling: a full 30-turn game with retries needs ~150 iterations
    for (let i = 0; i < 2000; i++) {
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
            banner: isBotTurn && !p.isHuman ? `${p.name} ${p.emoji} is dealing…` : null,
          },
        }));
        await runPendings(isBotTurn);
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

      // awaiting a roll
      if (!isBotTurn) {
        set((s) => ({ ui: { ...s.ui, busy: false, banner: null, pendingVisible: false } }));
        return;
      }
      set((s) => ({
        ui: { ...s.ui, busy: true, banner: p.isHuman ? "Autopilot…" : `${p.name} ${p.emoji} is plotting…` },
      }));
      await sleep(550);
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
      // when the human clears the queue, hand control back to the pump
      if (!g.pendingQueue.length) {
        set((s) => ({ ui: { ...s.ui, pendingVisible: false } }));
        void pump();
      }
    },

    dismissToast: (id) =>
      set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } })),
  };
});
