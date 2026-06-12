# Rental Rush: Operator Mode — design notes

A 8–12 minute property-operator board game. 1 human vs 2 AI rivals. Not a
Monopoly clone: no auctions, no rent-on-landing, no jail — the core loop is a
rental-operations P&L simulation wearing a board game costume.

## Core loop

Roll 2d6 around a 16-tile ring. Tiles: 7 property deals, 2 owner calls,
2 guest issues, 1 regulation, 1 finance, 1 hiring, 1 market shift, 1 upgrades,
1 Start/Month-End. Passing Start closes that player's month: a full P&L runs
(revenue → owner payouts → lease → debt service → staff → maintenance →
refunds → fines → net). With 2d6 on 16 tiles a lap ≈ 2.3 turns, so a 10-turn
game simulates ~4–5 months per player.

The business year starts in **October**: winter (Nov 0.8, Jan 0.7) hits before
the spring/summer payoff. STR looks shiny on ADR but bleeds in winter; MTR/LTR
carry you through; lease-arbitrage STR is the high-wire act, exactly as in the
spec ("high bankruptcy risk if occupancy drops").

## Engine (src/lib/game)

- `engine/sim.ts` — one function (`simulateHoldingMonth`) prices a holding's
  month; the same maths powers month-end, the deal-projection UI and bot
  decisions, so what the player is promised is what the engine delivers.
- STR: `ADR × 30 × occupancy`, where occupancy = base × season × city demand ×
  reputation × review factor (scaled by review sensitivity) × regulation drag ×
  event modifiers − ops-overload penalty. ADR gets furnishing, pricing tools,
  revenue manager, review and seasonal multipliers.
- Deals: **buy** (30% deposit + 2% fees, 70% LTV interest-only variable
  mortgage, equity + 0.4%/mo appreciation), **lease** (setup ≈ deposit +
  furnishing; monthly = LTR × 1.12), **manage** (cheap onboarding; player books
  gross, remits `gross − fee − costs` as owner payout; fee 20/15/10% by
  strategy; trust drives churn at <30 and referrals at ≥80).
- Ops: STR 2.0 / MTR 1.0 / LTR 0.5 points × property factor vs capacity
  5 (+3 guest ops, +3 AI ops). Overload cuts occupancy and rolls monthly
  incident dice (refunds, bad reviews, trust hits).
- Emergencies fire the moment cash < 0; bankruptcy at < −£50k after measures.
- All randomness flows through a serialisable mulberry32 state on GameState —
  daily-challenge games share an identical world.

## Scoring

`cash + equity + 12×NOI + owner contract value + reputation value − loan debt
− risk penalties − bankruptcy penalty − investor cut`. Owner contract value =
monthly management profit × 10 × trust% × (1 + 0.12 per extra managed door,
cap 1.6×). Risk penalties target unsecured leverage (not ordinary mortgages),
end-state ops overload, and unlicensed STR in high-regulation cities.

## Bots

Maya (aggressive: lease/STR bias, ~£6k cash floor, borrows happily, hires
late) and Sam (steady: buy/manage bias, £30k floor, compliance buyer, hires
early). Both score deals with the real projection engine + personality bias +
noise. Verified over 300-game headless sims: every game terminates, no NaNs,
P&L identity holds, scores p10/p50/p90 ≈ £120k/£210k/£245k — beatable but not
free.

## Verification

- `npm run stress` — mechanical tests of the danger paths (emergency, bridge
  loans, payout delays, bankruptcy-ends-game, owner churn, credit caps).
- `npm run simulate` — 200 full bot games with invariant assertions.
- `/?auto=1&fast=1` — in-browser autopilot for end-to-end smoke tests.
- `/?modals=1&seed=rr-test-2` — deterministic first-roll modal inspection.

## V2 / Supabase

`src/lib/game/leaderboard.ts` hides storage behind `ScoreStore` (currently
localStorage). Swap in a SupabaseScoreStore + auth without touching the UI.
GameState is fully serialisable JSON for the same reason.
