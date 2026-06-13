# Rental Rush: Operator Mode 🏠🎲

A fast, premium web board game about running a rental business. You versus two
AI rivals: claim neighbourhoods, stack units, lease whole buildings, flip them
to Hotel Mode, fight at auction, survive a tightening market — and squeeze your
opponents with stay fees until they go bankrupt. **The only way to win is to be
the last solvent operator standing.**

It's a familiar square-board property game on the surface, with a real
rental-operations simulation underneath: short / mid / long-term lets, hotel
mode, furnishing and licensing pipelines, owner trust, reputation, ops
capacity, debt, distressed auctions and a market-cycle deck.

No signup, no download, plays instantly in the browser. Built in TypeScript with
a fully headless, testable game engine.

> **This started as a one-shot experiment** to see how far an AI coding agent
> could take a complete game in a single sprint. It's now open source so anyone
> who wants to can make it better. PRs welcome — see
> [CONTRIBUTING.md](CONTRIBUTING.md).

## Play

▶️ **Live:** _(deployment URL goes here)_

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Requires Node 20+.

## How it's built

- **Next.js (App Router) · React · TypeScript · Tailwind v4 · Zustand · Motion**
- The entire game is a **pure, serialisable TypeScript engine** under
  `src/lib/game/` — no React, no DOM. The UI is a thin rendering layer over it.
  - `engine/sim.ts` — prices one asset's month; the *same* maths powers the
    on-screen previews, month-end P&L and the AI bots, so what the player is
    promised is what the engine delivers.
  - `engine/reducer.ts` — the game's rules: turns, months, auctions,
    bankruptcy, elimination.
  - `engine/auction.ts`, `engine/score.ts`, `data/*` — auctions, post-game
    stats, and the seeded world (cities, areas, events, market cycle, staff).
  - `bots.ts` — two AI personalities that value every move with the same
    projection engine the human sees.
- All randomness flows through a seeded RNG on the game state, so games are
  deterministic and reproducible (and the daily challenge is identical for
  everyone).
- Sound is **synthesised live with the Web Audio API** — no audio files.
- State persists to `localStorage`; the leaderboard sits behind a small
  `ScoreStore` interface so a real backend can drop in later.

## Tested like a simulation, not a toy

The engine ships with its own harnesses — the best way to make balance or rules
changes with confidence:

```bash
npm run simulate   # plays hundreds of full AI-vs-AI games, asserts invariants
npm run stress     # 50+ mechanical assertions on the danger paths
npm run uitest     # drives a real browser through the core flows
npm run build      # type-check + production build
```

`npm run simulate` checks, among other things, that **every** game ends with
exactly one solvent winner, that the P&L always reconciles, and that area
control stays consistent. If you change the economy, run it and watch the
numbers.

Handy dev URLs: `/?auto=1&fast=1` (watch the AI autoplay a whole game),
`/?modals=1&seed=rr3-test-17` (jump straight to a deterministic auction).

## Contributing

This is a friendly, experimental project — ideas, bug reports and pull requests
are all welcome. Good first areas: new event cards, market-cycle cards, balance
tuning, accessibility, new AI personalities, visual polish, or a real backend
for the leaderboard. See **[CONTRIBUTING.md](CONTRIBUTING.md)** and
`docs/DESIGN.md` for how the game works.

## Disclaimer

Rental Rush: Operator Mode is an **original game**, inspired by the
property-trading board-game genre and by years of actually operating short-term
rentals. It is **not affiliated with, endorsed by, sponsored by, or connected
to Hasbro, Inc. or the MONOPOLY brand** in any way. It uses no third-party
names, logos, board designs, tokens, card text, or other protected assets. All
artwork, text, code and music are original to this project.

## License

[MIT](LICENSE) — do what you like, just keep the notice. © 2026 Can Köseoglu.
