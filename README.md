# Rental Rush: Operator Mode 🏠🎲

A fast, premium web board game about running a rental business. You vs two AI
rivals: acquire properties (buy / lease-arbitrage / manage-for-owner), pick
STR / MTR / LTR strategies, hire a team before the chaos eats you, survive
winter, regulation, owners and your own leverage — in 8–12 minutes.

No signup. Leaderboard nickname is optional and only asked after the game.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

## Useful dev URLs

- `/?auto=1&fast=1` — full autopilot game (smoke test)
- `/?modals=1&seed=rr-test-2` — deterministic deal-modal inspection
- `/` with a saved game → Resume appears on the menu

## Tests

```bash
npm test             # stress tests + 100 simulated games
npm run simulate     # 200 headless bot-vs-bot games with invariant checks
npm run stress       # emergency / bankruptcy / churn / credit mechanics
```

## Stack

Next.js (App Router) · React · TypeScript · Tailwind v4 · zustand · motion ·
canvas-confetti. State persists to localStorage (autosave + resume +
leaderboards); the score store is behind an interface so Supabase can drop in
for V2 (see `docs/DESIGN.md`).
