# Rental Rush: Operator Mode — design notes (V3 · winner-take-all)

A property-operator board game. 1 human vs 2 AI rivals on a square 24-tile
board of NEIGHBOURHOODS. **The only win condition: last solvent operator
standing.** No Enterprise Value, no final score, no fixed turn count. You win
by bankrupting everyone else.

## The loop

Months run forever until one player remains. Each month every solvent player
takes one board move (2d6 over 16 area tiles + guest/owner/permit event tiles
+ an auction house + 4 corners), then Month End runs for everyone: the full
P&L (revenue → owner payouts → lease → debt service → staff → maintenance &
ops → projects & furnishing → refunds → fines → stay fees), pipelines advance,
control updates, insolvency checks fire, and one Market Cycle card is drawn.

## The endgame engine (why games end)

- **Stay fees escalate forever**: base by area level (£800/£1,400/£2,200) ×
  controller's live book × hotel/premium mix × city-set (×1.75) × demand ×
  an age multiplier that grows ~12%/month from month 6 (cap ×4, fee cap rises
  £1k/month after month 12). Landing on a strong rival's turf late-game costs
  £5k-£15k+.
- **Market Cycle deck** (phase 0 expansion / 1 squeeze from month 6 / 2
  consolidation from month 12): rates, funding winters (credit capacity
  shrinks), crackdowns (auto-fines on unlicensed nightly units), labour and
  cleaning inflation, insurance creep (+£100/unit/month in consolidation,
  cap £600), permit scarcity (permit auctions), lender sales.
- **Market fatigue**: from month 10, a permanent compounding −2.5% occupancy
  mod per month. LTR is defensive but not immune (√-sensitivity, voids rise).
- **Floors rise**: insolvency floor −£50k → −£25k (consolidation) → −£10k
  (month 18+). Bridge rates climb toward 5%/month.
- Verified: 100% of simulated games end with exactly one solvent winner,
  p50 ≈ month 30-35, max < 50.

## Bankruptcy → elimination → distressed auctions

Cash below £0 triggers an Insolvency Check (bridge loan, fire sales, auction
your own assets to rivals, hand-backs, payout delays, staff cuts, STR→MTR/LTR
conversions). Below the floor: eliminated. A tombstone reason is generated
("over-expanded into nightly inventory, licence delays, bridge interest…"),
the killer is credited (most stay fees extracted), and the carcass goes to
distressed auction — live units, buildings, owner contracts — sold as seen
with real baggage (rating −0.3, deferred maintenance, lease/mortgage
transfers). Unsold lots vanish to the bank.

## Auctions (3 rounds: open → raise → final)

Five lot types: off-market units, whole buildings (bid replaces setup, then
the winner configures model + furnishing), owner mandates (signing-bonus bid,
units go live managed), City Hall permits (area-wide nightly-stay rights),
and distressed lots. Triggers: the Auction House tile, passing on an area
opportunity (30%), permit-scarcity and consolidation market cards, and every
bankruptcy. Bots value lots with the live projection engine, pay premiums to
complete city sets and to deny rivals theirs. Simplification vs the full
spec: mandate/building bids are cash-only (no multi-dimensional fee/guarantee
bidding) — terms are standardised.

## Area control & city sets

Control = live, model-weighted points: LTR 1 · MTR 1.5 · STR 2 · HOTEL 3 per
unit, +15% for premium-furnished; suspended counts 30%, pipeline counts 0.
Controller gets the tile ring + stay fees. Controlling BOTH areas of a city:
×1.75 stay fees, −8% operating var costs, −10% acquisition setup costs there
— and crackdown targeting prefers STR-heavy set owners.

## Ops & models (per live unit)

LTR 0.5 · MTR 1 · STR 2 · HOTEL 3 against capacity 8 (+8 guest ops, +8 AI
ops). Hotels: buildings only, licence/permit + ops staff required, ADR ×1.3,
£150/unit overhead. Overload cuts occupancy and rolls incident dice.

## Post-game (stats, never the winner)

Tombstones, survival month, cash, live units by model, areas/city sets,
monthly net cash flow, rent collected, bankruptcies caused, biggest auction
win, biggest win/mistake, strongest area, archetype (incl. Ruthless Operator
for players who bankrupted a rival). Leaderboards rank wins → survival →
estate. Share card: "Last solvent operator standing — month X" / "Bankrupted
in month X. Avenge me."

## Verification

- `npm run stress` — 54 assertions incl. auction flow, permit coverage,
  distressed transfer with baggage, elimination + tombstones, fee escalation.
- `npm run simulate` — full bot games asserting the sole-survivor invariant,
  P&L identity, control invariant, bounded game length.
- `npm run uitest` — real-Chrome flows (panel authority, scout mode,
  auction-aware month marches).
- `/?auto=1&fast=1` autopilot; `/?modals=1&seed=rr3-test-17` deterministic
  building-auction modal.

## V3 → V4 (Supabase)

`ScoreStore` in `src/lib/game/leaderboard.ts` still hides storage; GameState
remains fully serialisable JSON.
