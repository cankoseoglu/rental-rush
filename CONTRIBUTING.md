# Contributing to Rental Rush

Thanks for wanting to make the game better! This is a relaxed, experimental
project, so don't overthink it — small focused PRs are perfect.

## Getting started

```bash
git clone https://github.com/cankoseoglu/rental-rush.git
cd rental-rush
npm install
npm run dev          # http://localhost:3000
```

Read `docs/DESIGN.md` first — it explains how the game actually works (the
economy, area control, auctions, the market cycle). The whole game lives in
`src/lib/game/` as a pure TypeScript engine; the React components under
`src/components/` just render it.

## Before you open a PR

Please make sure these all pass:

```bash
npm run build      # type-check + production build (must be clean)
npm run stress     # mechanical rules assertions
npm run simulate   # full AI-vs-AI games + invariant checks
```

If you changed game balance or rules, `npm run simulate` is the important one —
it plays hundreds of games and asserts that every one still ends with a single
solvent winner, the P&L reconciles, and nothing breaks. Eyeball the printed
stats (game length, bankruptcy rate, archetypes) and make sure they still look
reasonable.

## Pull request workflow

1. Fork the repo, or create a branch if you have access.
2. Make your change in a focused branch (`feature/...` or `fix/...`).
3. Run the checks above.
4. Open a PR against `main` with a short description of **what** and **why**.
   Screenshots or a GIF are very welcome for anything visual.
5. A maintainer will review, maybe suggest tweaks, and merge. Be patient — this
   is a side project.

## Good first contributions

- **New event cards** (`src/lib/game/data/events.ts`) — guest, owner,
  regulation or market events. Self-contained and fun.
- **New market-cycle cards** (`src/lib/game/data/marketCycle.ts`).
- **Balance tuning** — back it with `npm run simulate` output.
- **A new AI personality** (`src/lib/game/bots.ts`).
- **Accessibility** — keyboard nav, screen-reader labels, reduced-motion.
- **Visual polish** or new board/area art.
- **A real backend** for the leaderboard (the `ScoreStore` interface is ready
  for it).

## Style

- TypeScript, no `any` where it can be avoided. Keep the game engine pure
  (no React/DOM imports under `src/lib/game/`).
- Match the surrounding code; we use the project's ESLint/Prettier defaults.
- Keep PRs scoped to one thing.

## Ground rules

- Keep everything **original**. Do not add third-party brand names, logos,
  board designs, card text, music or other protected assets. This game is
  deliberately not affiliated with any existing product.
- Be kind in reviews and issues.

By contributing, you agree your work is licensed under the project's
[MIT License](LICENSE).
