# Rental Rush: Operator Mode — design notes (V2 · area control)

A 8–12 minute property-operator board game. 1 human vs 2 AI rivals. Square
24-tile board, but not a Monopoly clone: tiles are NEIGHBOURHOODS that several
players build into simultaneously, and the depth lives in a rental-operations
simulation — pipelines, licences, ops capacity, owner trust, seasonality.

## Design rule

The board stays quiet: city colour band, area name, £ level, controller
border, owner pills (Y3 S1), live model badges (S2 M1 H6), pipeline chips
(LIC 2M / FURN 1M / BUILD 1M), tokens. Everything deeper — demand, regulation,
assets, opportunities, impact previews — lives in the side panel (right rail
on desktop, bottom sheet on mobile). You never open a modal just to see who
owns an area.

## Core loop (synchronized months)

Each player moves once per month (2d6 around 16 area tiles + 4 event tiles +
4 corners); after all three move, Month End runs for everyone: revenue, lease
obligations, debt service, payroll, maintenance & ops, projects & furnishing,
refunds, fines, stay fees — then pipelines advance and area control updates.
10 months, October → July: winter bites before the spring payoff.

## Areas & control

Areas hold any number of assets from any player. Controller = highest LIVE
unit value (incumbent keeps ties); the controller's colour rings the tile and
rivals landing there pay a stay fee (≈£400–1,250 scaled by their live book).

## Assets & pipelines

- Kinds: rented unit (arbitrage), bought unit (mortgage + equity), managed
  owner unit (instant, fee-based, per-asset owner trust, max 2/area — the
  owner pool is finite), leased building (4–8 units, lease burn from signing,
  1 month prep + furnishing, the empire move).
- Furnishing: fast (1mo, cheap, ADR −7%, rating cap 4.6, +30% breakage) vs
  slow (2–3mo, +60% cost, ADR +8%, occ +4pts, cap 5.0, −20% breakage).
  Buildings pay fit-out in monthly instalments.
- Licensing: project pipeline (2–4mo, cost scales with units & regulation,
  approval odds drop with reg risk, +compliance/+AI-ops help). Rejection →
  reapply (+12% odds), convert to MTR/LTR, or exit. Unlicensed STR in
  reg≥60 areas trades at a drag and eats inspection fines; hotels simply
  cannot open unlicensed.
- Models: STR / MTR / LTR / HOTEL. Hotel = buildings only, licence + ops
  staff required, ADR ×1.3, occ +5pts, var 22%, £150/unit overhead, 1.2
  ops/unit. Ops per live unit: STR 1.0 · HOTEL 1.2 · MTR 0.5 · LTR 0.25
  against capacity 5 (+3 guest ops, +3 AI ops). Overload cuts occupancy and
  rolls incident dice.

## Verified balance (200-game headless sims)

Every game terminates; P&L identity reconciles; the area-control invariant
holds. Bot baseline: ~4.7 assets/player, ~7 live units, score p50 ≈ £240k,
p90 ≈ £305k, mean NOI ≈ +£2.5k/mo, emergencies ≈ 0.1/player. Humans beat it
with buildings, hotels and staffed-up scale. Tuning lessons encoded in bots:
price the post-pipeline ops load, average projections across remaining
seasons, only hire staff the gross can carry, never start a pipeline the
calendar can't finish.

## Verification

- `npm run stress` — 31 assertions: emergencies, bankruptcy, churn, payout
  delays, credit caps, control & stay fees, building/licence pipelines,
  hotel gates.
- `npm run simulate` — 200 bot games with invariants.
- `/?auto=1&fast=1` — in-browser autopilot; `/?modals=1&seed=rr2-test-2` —
  deterministic area-panel inspection.

## V2 → V3 (Supabase)

`ScoreStore` in `src/lib/game/leaderboard.ts` still hides storage; GameState
remains fully serialisable JSON.
