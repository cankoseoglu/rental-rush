import type { GameState } from "./types";

const KEY = "rr.save.v1";

export function saveGame(state: GameState) {
  if (typeof window === "undefined") return;
  try {
    if (state.over) {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    }
  } catch {
    // storage full / private mode — non-fatal
  }
}

export function loadGame(): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    if (state.v !== 1 || state.over) return null;
    return state;
  } catch {
    return null;
  }
}

export function clearSave() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
