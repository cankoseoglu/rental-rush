// ---------------------------------------------------------------------------
// Event cards, V2: targets are assets inside areas.
// Info events apply at draw; choice events apply on EVENT_CHOICE via choose().
// All context between draw and choose lives in a serialisable memo.
// ---------------------------------------------------------------------------

import type {
  Asset,
  EventCategory,
  EventChoice,
  GameState,
  PendingAction,
  PlayerState,
  TempMod,
} from "../types";
import { cityById } from "./cities";
import { hasStaff } from "./staff";
import { areaById, isUnlicensed } from "../engine/sim";
import { chance, clamp, pick, rint } from "../rng";

export interface EventCtx {
  state: GameState;
  p: PlayerState;
  rng: () => number;
  log: (text: string, tone?: "good" | "bad" | "neutral" | "money") => void;
  notable: (label: string, value: number) => void;
}

interface DrawResult {
  flavor: string;
  effects: string[];
  choices: EventChoice[];
  memo: Record<string, number | string>;
}

export interface GameEvent {
  id: string;
  category: EventCategory;
  title: string;
  emoji: string;
  canApply?: (p: PlayerState, state: GameState) => boolean;
  draw: (ctx: EventCtx) => DrawResult;
  choose?: (ctx: EventCtx, choiceId: string, memo: Record<string, number | string>) => string[];
}

// --- helpers ----------------------------------------------------------------

export const assetLabel = (state: GameState, a: Asset): string => {
  const area = areaById(state, a.areaId);
  return a.kind === "building" ? `the ${area.name} block` : `your ${area.name} unit`;
};

const liveAssets = (p: PlayerState, f?: (a: Asset) => boolean) =>
  p.assets.filter((a) => a.status === "live" && (!f || f(a)));

const nightly = (p: PlayerState) =>
  liveAssets(p, (a) => a.model === "STR" || a.model === "HOTEL");

const randAsset = (ctx: EventCtx, f?: (a: Asset) => boolean): Asset | null => {
  const as = liveAssets(ctx.p, f);
  return as.length ? pick(ctx.rng, as) : null;
};

const byId = (p: PlayerState, id: string | number) =>
  p.assets.find((a) => a.id === id) ?? null;

const fine = (ctx: EventCtx, amount: number, why: string) => {
  ctx.p.cash -= amount;
  ctx.p.accruedFines += amount;
  ctx.p.stats.finesTotal += amount;
  ctx.p.stats.finesCount += 1;
  ctx.notable(`${why} (−£${amount.toLocaleString("en-GB")})`, -amount);
  ctx.log(`${ctx.p.name} fined £${amount.toLocaleString("en-GB")}: ${why}`, "bad");
};

const refund = (ctx: EventCtx, amount: number) => {
  ctx.p.cash -= amount;
  ctx.p.accruedRefunds += amount;
  ctx.p.stats.refundsTotal += amount;
};

const rep = (p: PlayerState, d: number) => {
  p.rep = clamp(Math.round(p.rep + d), 1, 100);
};

const trustAsset = (a: Asset | null, d: number) => {
  if (a && a.deal === "manage") a.ownerTrust = clamp(Math.round(a.ownerTrust + d), 1, 100);
};

const rating = (a: Asset | null, d: number) => {
  if (a) a.rating = clamp(a.rating + d, 3, a.ratingCap);
};

const addMod = (target: { mods: TempMod[] }, m: TempMod) => {
  target.mods.push(m);
};

const money = (n: number) => `£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;

// --- guest events -----------------------------------------------------------

const guestEvents: GameEvent[] = [
  {
    id: "guest_party",
    category: "guest",
    title: "Guest party",
    emoji: "🎉",
    canApply: (p) => nightly(p).length > 0,
    draw: (ctx): DrawResult => {
      const a = randAsset(ctx, (x) => x.model === "STR" || x.model === "HOTEL")!;
      let damage = rint(ctx.rng, 2000, 5000);
      if (hasStaff(ctx.p, "cleaners")) damage = Math.round(damage * 0.6);
      rating(a, -0.1);
      return {
        flavor: `Forty people, a smoke machine and a confused DJ turned up at ${assetLabel(ctx.state, a)}. The neighbours have videos.`,
        effects: [],
        memo: { aid: a.id, damage },
        choices: [
          {
            id: "deposit",
            label: "Claim the damage deposit",
            detail: `Recover 60% of ${money(damage)} — but the guest may go to war in public`,
            evHint: damage * 0.6 - 800,
            riskHint: 0.7,
          },
          {
            id: "eat",
            label: "Eat the cost, keep it quiet",
            detail: `Pay ${money(damage)} yourself and protect the listing`,
            evHint: 0,
            riskHint: 0.1,
          },
        ],
      };
    },
    choose: (ctx, choiceId, memo) => {
      const damage = Number(memo.damage);
      const a = byId(ctx.p, memo.aid as string);
      const out: string[] = [];
      if (choiceId === "deposit") {
        const recovered = Math.round(damage * 0.6);
        ctx.p.cash -= damage - recovered;
        out.push(`−${money(damage - recovered)} net repair`);
        if (chance(ctx.rng, 0.35)) {
          rep(ctx.p, -4);
          rating(a, -0.15);
          out.push("Guest disputes it publicly · Rep −4");
        } else {
          out.push("Deposit claim sticks");
        }
      } else {
        ctx.p.cash -= damage;
        out.push(`−${money(damage)} repairs`);
        if (a?.deal === "manage") {
          trustAsset(a, 3);
          out.push("Owner never finds out · Trust +3");
        }
      }
      return out;
    },
  },
  {
    id: "guest_cleaner_noshow",
    category: "guest",
    title: "Cleaner no-show",
    emoji: "🧹",
    canApply: (p) => nightly(p).length > 0 && !hasStaff(p, "cleaners"),
    draw: (ctx): DrawResult => {
      const a = randAsset(ctx, (x) => x.model === "STR" || x.model === "HOTEL")!;
      return {
        flavor: `Check-in is at 3pm at ${assetLabel(ctx.state, a)}. It is 1:40pm. Your cleaner's phone is off.`,
        effects: [],
        memo: { aid: a.id },
        choices: [
          { id: "emergency", label: "Book an emergency clean", detail: "£400, crisis averted", evHint: -400, riskHint: 0 },
          { id: "risk", label: "Wipe the worktops yourself and pray", detail: "Free, but a 50% chance of a brutal review", evHint: -600, riskHint: 0.9 },
        ],
      };
    },
    choose: (ctx, choiceId, memo) => {
      const a = byId(ctx.p, memo.aid as string);
      if (choiceId === "emergency") {
        ctx.p.cash -= 400;
        return ["−£400 emergency clean"];
      }
      if (chance(ctx.rng, 0.5)) {
        rep(ctx.p, -4);
        rating(a, -0.25);
        return ["“Hair in the shower drain. 2 stars.” · Rep −4"];
      }
      return ["You got away with it. This time."];
    },
  },
  {
    id: "guest_bad_review",
    category: "guest",
    title: "Bad review",
    emoji: "💢",
    canApply: (p) => liveAssets(p).length > 0,
    draw: (ctx): DrawResult => {
      const a = randAsset(ctx)!;
      const soft = hasStaff(ctx.p, "aiOps");
      rep(ctx.p, soft ? -2 : -5);
      rating(a, soft ? -0.1 : -0.25);
      trustAsset(a, -3);
      return {
        flavor: `“The photos are doing a lot of heavy lifting.” One star for ${assetLabel(ctx.state, a)}.${soft ? " Your AI ops system flagged it early and smoothed things over." : ""}`,
        effects: [
          soft ? "Rep −2 (AI ops softened it)" : "Rep −5",
          `Rating −${soft ? "0.1" : "0.25"}`,
          ...(a.deal === "manage" ? ["Owner trust −3"] : []),
        ],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "guest_five_star",
    category: "guest",
    title: "Five-star streak",
    emoji: "🌟",
    canApply: (p) => liveAssets(p).length > 0,
    draw: (ctx): DrawResult => {
      const a = randAsset(ctx)!;
      rep(ctx.p, 5);
      rating(a, 0.2);
      addMod(a, { key: "fivestar", label: "Five-star glow", monthsLeft: 2, occMult: 1.08 });
      trustAsset(a, 4);
      return {
        flavor: `Six five-star reviews in a row for ${assetLabel(ctx.state, a)}. One guest called it “better than my own flat, honestly”.`,
        effects: ["Rep +5", "Rating +0.2", "Occupancy +8% for 2 months", ...(a.deal === "manage" ? ["Owner trust +4"] : [])],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "guest_refund",
    category: "guest",
    title: "Missed messages",
    emoji: "📵",
    canApply: (p) => liveAssets(p).length > 0,
    draw: (ctx): DrawResult => {
      const soft = hasStaff(ctx.p, "aiOps");
      let amount = rint(ctx.rng, 400, 900);
      if (soft) amount = Math.round(amount * 0.4);
      refund(ctx, amount);
      const a = randAsset(ctx)!;
      trustAsset(a, -2);
      return {
        flavor: `A guest at ${assetLabel(ctx.state, a)} messaged four times about the wifi code and got silence. They want money back.${soft ? " The AI ops system caught it on message five." : ""}`,
        effects: [`−${money(amount)} refund`, ...(a.deal === "manage" ? ["Owner trust −2"] : [])],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "guest_boiler",
    category: "guest",
    title: "Boiler breaks",
    emoji: "🥶",
    canApply: (p) => liveAssets(p).length > 0,
    draw: (ctx): DrawResult => {
      const a = randAsset(ctx)!;
      let cost = rint(ctx.rng, 1200, 2800);
      if (a.kind === "building") cost = Math.round(cost * 1.6);
      if (hasStaff(ctx.p, "maintenance")) cost = Math.round(cost * 0.6);
      return {
        flavor: `No hot water at ${assetLabel(ctx.state, a)}, guests mid-stay, and an engineer quoting “sometime Thursday”.`,
        effects: [],
        memo: { aid: a.id, cost },
        choices: [
          { id: "fix", label: "Fix it properly now", detail: `${money(cost)}${hasStaff(ctx.p, "maintenance") ? " (coordinator rate)" : ""}`, evHint: -cost, riskHint: 0 },
          { id: "patch", label: "Patch it for £300", detail: "40% chance it dies again, angrier", evHint: -300 - 0.4 * cost, riskHint: 0.8 },
        ],
      };
    },
    choose: (ctx, choiceId, memo) => {
      const a = byId(ctx.p, memo.aid as string);
      const cost = Number(memo.cost);
      if (choiceId === "fix") {
        ctx.p.cash -= cost;
        return [`−${money(cost)} repair, guests kept warm`];
      }
      ctx.p.cash -= 300;
      if (chance(ctx.rng, 0.4)) {
        const cost2 = Math.round(cost * 1.4);
        ctx.p.cash -= cost2;
        rating(a, -0.2);
        trustAsset(a, -4);
        return [`Patch failed · −${money(300 + cost2)} total`, "Rating −0.2"];
      }
      return ["−£300 · the patch held. Somehow."];
    },
  },
];

// --- owner events -----------------------------------------------------------

const ownerEvents: GameEvent[] = [
  {
    id: "owner_report",
    category: "owner",
    title: "Owner demands a report",
    emoji: "📊",
    canApply: (p) => p.assets.some((a) => a.deal === "manage"),
    draw: (ctx): DrawResult => {
      const a = pick(ctx.rng, ctx.p.assets.filter((x) => x.deal === "manage"));
      if (hasStaff(ctx.p, "ownerSuccess")) {
        trustAsset(a, 4);
        return {
          flavor: `The owner of ${assetLabel(ctx.state, a)} wants "full transparency on the numbers". Your owner success manager already sent a beautiful dashboard. The owner is delighted.`,
          effects: ["Owner trust +4 (handled by owner success manager)"],
          choices: [],
          memo: {},
        };
      }
      return {
        flavor: `The owner of ${assetLabel(ctx.state, a)} texts: "Quick one — where exactly is my money going each month?" It is not a quick one.`,
        effects: [],
        memo: { aid: a.id },
        choices: [
          { id: "full", label: "Build a proper report", detail: "£500 of your evening · Trust +6", evHint: 1500, riskHint: 0 },
          { id: "voice", label: "Send a breezy voice note", detail: "Free · 50% they feel fobbed off", evHint: -400, riskHint: 0.8 },
        ],
      };
    },
    choose: (ctx, choiceId, memo) => {
      const a = byId(ctx.p, memo.aid as string);
      if (choiceId === "full") {
        ctx.p.cash -= 500;
        trustAsset(a, 6);
        return ["−£500", "Owner trust +6"];
      }
      if (chance(ctx.rng, 0.5)) {
        trustAsset(a, -6);
        return ["“So that's a no on the spreadsheet then.” · Trust −6"];
      }
      trustAsset(a, 2);
      return ["They loved the voice note · Trust +2"];
    },
  },
  {
    id: "owner_referral",
    category: "owner",
    title: "Owner referral",
    emoji: "🤝",
    draw: (ctx): DrawResult => {
      const managed = ctx.p.assets.filter((a) => a.deal === "manage");
      if (ctx.p.trust >= 70 && managed.length > 0) {
        return {
          flavor: "One of your owners has been bragging about you at a dinner party. Their friend has a flat and a problem tenant who just left.",
          effects: ["A referred owner wants to talk — free onboarding if you take it"],
          choices: [],
          memo: { referral: 1 },
        };
      }
      return {
        flavor: managed.length
          ? "Your name comes up at a dinner party. Politely. Nothing happens — owners refer operators they rave about, and your trust isn't there yet."
          : "You overhear two landlords complaining about their property manager. If only you managed properties, this would be a lead.",
        effects: [],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "owner_anxious",
    category: "owner",
    title: "Owner reads the news",
    emoji: "😰",
    canApply: (p) => p.assets.some((a) => a.deal === "manage"),
    draw: (ctx): DrawResult => {
      const a = pick(ctx.rng, ctx.p.assets.filter((x) => x.deal === "manage"));
      const compliant = ctx.p.cityCompliance.length > 0 || ctx.p.assets.some((x) => x.licence === "approved");
      return {
        flavor: `"SHORT LETS CRACKDOWN" says the front page. The owner of ${assetLabel(ctx.state, a)} has read it twice and called you three times.`,
        effects: [],
        memo: { aid: a.id, compliant: compliant ? 1 : 0 },
        choices: [
          { id: "walkthrough", label: "Walk them through your compliance plan", detail: compliant ? "You actually have one · Trust +8" : "Improvise convincingly · Trust +5", evHint: 1200, riskHint: 0 },
          { id: "downplay", label: "“Honestly, it'll never happen”", detail: "Free · 40% they panic anyway", evHint: -200, riskHint: 0.7 },
        ],
      };
    },
    choose: (ctx, choiceId, memo) => {
      const a = byId(ctx.p, memo.aid as string);
      if (choiceId === "walkthrough") {
        const d = memo.compliant ? 8 : 5;
        trustAsset(a, d);
        return [`Owner trust +${d}`];
      }
      if (chance(ctx.rng, 0.4)) {
        trustAsset(a, -8);
        return ["They panic anyway · Trust −8"];
      }
      trustAsset(a, 1);
      return ["They calm down · Trust +1"];
    },
  },
];

// --- regulation events -------------------------------------------------------

const regulationEvents: GameEvent[] = [
  {
    id: "reg_inspection",
    category: "regulation",
    title: "Regulation inspection",
    emoji: "🔍",
    draw: (ctx): DrawResult => {
      const targets = nightly(ctx.p);
      if (!targets.length) {
        rep(ctx.p, 1);
        return {
          flavor: "A council inspector pokes around your (entirely compliant, entirely empty) operation and leaves disappointed.",
          effects: ["Rep +1"],
          choices: [],
          memo: {},
        };
      }
      const a = pick(ctx.rng, targets);
      const city = cityById(areaById(ctx.state, a.areaId).cityId);
      if (!isUnlicensed(ctx.state, ctx.p, a)) {
        rep(ctx.p, 3);
        return {
          flavor: `A ${city.name} inspector turns up at ${assetLabel(ctx.state, a)} unannounced. Paperwork: immaculate. Fire doors: labelled. They almost smile.`,
          effects: ["Passed with flying colours · Rep +3"],
          choices: [],
          memo: {},
        };
      }
      const amount = rint(ctx.rng, 3000, 9000);
      fine(ctx, amount, `${city.name} inspection failed at ${assetLabel(ctx.state, a)}`);
      rep(ctx.p, -3);
      return {
        flavor: `A ${city.name} inspector turns up at ${assetLabel(ctx.state, a)} and starts photographing things. You did not know there were that many regulations.`,
        effects: [`Fine −${money(amount)}`, "Rep −3"],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "reg_permit",
    category: "regulation",
    title: "STR permit rejected",
    emoji: "🚫",
    canApply: (p, state) =>
      p.assets.some((a) => a.status === "live" && a.model === "STR" && isUnlicensed(state, p, a)),
    draw: (ctx): DrawResult => {
      const a = pick(
        ctx.rng,
        ctx.p.assets.filter(
          (x) => x.status === "live" && x.model === "STR" && isUnlicensed(ctx.state, ctx.p, x),
        ),
      );
      const area = areaById(ctx.state, a.areaId);
      return {
        flavor: `${cityById(area.cityId).name} council rejects the short-let permit for ${assetLabel(ctx.state, a)}. Effective immediately, it cannot trade nightly.`,
        effects: [],
        memo: { aid: a.id },
        choices: [
          { id: "mtr", label: "Convert to MTR", detail: "Monthly stays, medium revenue", evHint: 500, riskHint: 0.2 },
          { id: "ltr", label: "Convert to LTR", detail: "Long let, stable and quiet", evHint: 200, riskHint: 0 },
        ],
      };
    },
    choose: (ctx, choiceId, memo) => {
      const a = byId(ctx.p, memo.aid as string);
      if (!a) return [];
      a.model = choiceId === "mtr" ? "MTR" : "LTR";
      ctx.notable(`Permit rejected — ${assetLabel(ctx.state, a)} forced out of STR`, -4000);
      return [`Now running ${a.model}`];
    },
  },
  {
    id: "reg_licensing",
    category: "regulation",
    title: "Fast-track licensing scheme",
    emoji: "📜",
    canApply: (p, state) =>
      p.assets.some((a) => a.model === "STR" && isUnlicensed(state, p, a)),
    draw: (ctx): DrawResult => {
      const exposed = ctx.p.assets.filter((a) => a.model === "STR" && isUnlicensed(ctx.state, ctx.p, a));
      const units = exposed.reduce((s, a) => s + a.units, 0);
      const cost = units * 2_500;
      const city = cityById(areaById(ctx.state, exposed[0].areaId).cityId);
      return {
        flavor: `${city.name} opens a fast-track licence window: £2,500 per unit, no questions, ${units} unlicensed unit${units > 1 ? "s" : ""} eligible.`,
        effects: [],
        memo: { cost },
        choices: [
          { id: "pay", label: `Licence everything (${money(cost)})`, detail: "Fully legal, sleep at night", evHint: -cost + 2500, riskHint: 0, disabled: ctx.p.cash < cost },
          { id: "skip", label: "Stay grey-market", detail: "Those units lose 30% occupancy for 2 months", evHint: -3000, riskHint: 0.6 },
        ],
      };
    },
    choose: (ctx, choiceId, memo) => {
      const exposed = ctx.p.assets.filter((a) => a.model === "STR" && isUnlicensed(ctx.state, ctx.p, a));
      if (choiceId === "pay") {
        ctx.p.cash -= Number(memo.cost);
        exposed.forEach((a) => (a.licence = "approved"));
        ctx.p.stats.licencesWon += exposed.length;
        return [`−${money(Number(memo.cost))} · all units licensed`];
      }
      exposed.forEach((a) =>
        addMod(a, { key: "unlicensed", label: "Crackdown", monthsLeft: 2, occMult: 0.7 }),
      );
      return ["Unlicensed units −30% occupancy for 2 months"];
    },
  },
];

// --- market events ------------------------------------------------------------

const marketEvents: GameEvent[] = [
  {
    id: "mkt_rates",
    category: "market",
    title: "Interest rates rise",
    emoji: "📈",
    canApply: (_p, state) => state.market.rateRises < 2,
    draw: (ctx): DrawResult => {
      ctx.state.market.ratePm += 0.0012;
      ctx.state.market.rateRises += 1;
      ctx.log("Base rate rises — every mortgage in the game just got pricier", "bad");
      return {
        flavor: "The Bank raises rates again. Somewhere, a spreadsheet owner screams. Every variable mortgage in the game just got more expensive.",
        effects: ["Mortgage payments up for ALL players", "New loans cost more"],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "mkt_low_season",
    category: "market",
    title: "Demand drops",
    emoji: "🌧️",
    canApply: (p) => nightly(p).length > 0,
    draw: (ctx): DrawResult => {
      addMod(ctx.p, { key: "lowdemand", label: "Soft demand", monthsLeft: 1, occMult: 0.85 });
      return {
        flavor: "Searches are down, the weather is grim, and even the hen parties are staying home. A soft month coming.",
        effects: ["STR & Hotel occupancy −15% next month"],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "mkt_corporate",
    category: "market",
    title: "Corporate demand spike",
    emoji: "🏢",
    draw: (ctx): DrawResult => {
      const mtrs = liveAssets(ctx.p, (a) => a.model === "MTR");
      if (!mtrs.length) {
        return {
          flavor: "A wave of relocating consultants floods the mid-term market. MTR operators are feasting. You, currently, are not one of them.",
          effects: ["No MTR units to benefit"],
          choices: [],
          memo: {},
        };
      }
      addMod(ctx.p, { key: "corp", label: "Corporate demand", monthsLeft: 2, rentMult: 1.25 });
      const units = mtrs.reduce((s, a) => s + a.units, 0);
      return {
        flavor: "An infrastructure project lands nearby and the contractors need housing for months. Your MTR phone will not stop ringing.",
        effects: [`MTR revenue +25% for 2 months (${units} unit${units > 1 ? "s" : ""})`],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "mkt_viral",
    category: "market",
    title: "Viral listing",
    emoji: "🚀",
    canApply: (p) => nightly(p).length > 0,
    draw: (ctx): DrawResult => {
      const a = randAsset(ctx, (x) => x.model === "STR" || x.model === "HOTEL")!;
      addMod(a, { key: "viral", label: "Viral", monthsLeft: 2, occMult: 1.18, adrMult: 1.2 });
      rep(ctx.p, 4);
      ctx.notable(`${assetLabel(ctx.state, a)} went viral`, 6000);
      return {
        flavor: `Someone's video tour of ${assetLabel(ctx.state, a)} hits 2.3M views. The calendar fills itself. You raise prices and apologise to no one.`,
        effects: ["Occupancy +18% & ADR +20% for 2 months", "Rep +4"],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "mkt_price_war",
    category: "market",
    title: "Competitor price war",
    emoji: "⚔️",
    canApply: (p) => nightly(p).length > 0,
    draw: (ctx): DrawResult => {
      const a = randAsset(ctx, (x) => x.model === "STR" || x.model === "HOTEL")!;
      const city = cityById(areaById(ctx.state, a.areaId).cityId);
      const mods = (ctx.state.market.cityMods[city.id] ??= []);
      mods.push({ key: "pricewar", label: "Price war", monthsLeft: 2, adrMult: 0.85 });
      return {
        flavor: `A venture-funded operator drops 200 units on ${city.name} at suicidal nightly rates. Everyone bleeds together.`,
        effects: [`All ${city.name} nightly ADR −15% for 2 months (every player)`],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "mkt_algo",
    category: "market",
    title: "Airbnb algorithm boost",
    emoji: "📲",
    canApply: (p) => nightly(p).length > 0,
    draw: (ctx): DrawResult => {
      if (ctx.p.rep >= 70) {
        addMod(ctx.p, { key: "algo", label: "Algorithm boost", monthsLeft: 2, occMult: 1.1 });
        return {
          flavor: "The algorithm has decided it loves you. Your listings float to page one and sit there, glowing.",
          effects: ["Nightly occupancy +10% for 2 months"],
          choices: [],
          memo: {},
        };
      }
      return {
        flavor: "The algorithm reshuffles. Operators with strong reputations float to page one. You scroll to find your listings. And scroll.",
        effects: ["No boost — reputation below 70"],
        choices: [],
        memo: {},
      };
    },
  },
  {
    id: "mkt_ota_warning",
    category: "market",
    title: "OTA suspension warning",
    emoji: "⚠️",
    canApply: (p) => nightly(p).length > 0,
    draw: (ctx): DrawResult => {
      const weak = nightly(ctx.p).filter((a) => a.rating < 4.1);
      const target = weak.length ? pick(ctx.rng, weak) : null;
      if (!target && ctx.p.rep >= 50) {
        return {
          flavor: "The booking platform runs a quality sweep. Your listings pass quietly. Other operators' group chats are on fire.",
          effects: ["All clear"],
          choices: [],
          memo: {},
        };
      }
      const a = target ?? randAsset(ctx, (x) => x.model === "STR" || x.model === "HOTEL")!;
      return {
        flavor: `"Your listing ${assetLabel(ctx.state, a)} is at risk of suspension pending a quality review." The email is polite. The threat is not.`,
        effects: [],
        memo: { aid: a.id },
        choices: [
          { id: "review", label: "Pay for the quality review", detail: "£1,500, case closed", evHint: -1500, riskHint: 0 },
          { id: "ignore", label: "Ignore the email", detail: "50% chance the listing is suspended for a month", evHint: -2200, riskHint: 0.9 },
        ],
      };
    },
    choose: (ctx, choiceId, memo) => {
      if (choiceId === "review") {
        ctx.p.cash -= 1500;
        return ["−£1,500 · listing safe"];
      }
      if (chance(ctx.rng, 0.5)) {
        const a = byId(ctx.p, memo.aid as string);
        if (a) {
          a.status = "suspended";
          a.suspendedMonths = 1;
          ctx.notable(`${assetLabel(ctx.state, a)} suspended by the OTA`, -3000);
          return ["Suspended — zero revenue next month"];
        }
      }
      return ["The email was bluffing. Nothing happens."];
    },
  },
  {
    id: "mkt_backlog",
    category: "market",
    title: "Maintenance backlog",
    emoji: "🛠️",
    canApply: (p) => liveAssets(p).length > 0,
    draw: (ctx): DrawResult => {
      if (hasStaff(ctx.p, "maintenance")) {
        rep(ctx.p, 2);
        return {
          flavor: "Your maintenance coordinator spends a week clearing every niggle on the list. Dripping taps, wobbly handles, that one cupboard. All gone.",
          effects: ["Backlog cleared · Rep +2"],
          choices: [],
          memo: {},
        };
      }
      const live = liveAssets(ctx.p);
      const cost = Math.min(2_500, live.reduce((s, a) => s + a.units, 0) * 300);
      ctx.p.cash -= cost;
      live.forEach((a) => rating(a, -0.1));
      return {
        flavor: "The little jobs you kept postponing have unionised. Guests are noticing the dripping taps and the reviews mention 'tired'.",
        effects: [`−${money(cost)} catch-up repairs`, "All ratings −0.1"],
        choices: [],
        memo: {},
      };
    },
  },
];

// --- registry & draw ----------------------------------------------------------

export const ALL_EVENTS: GameEvent[] = [
  ...guestEvents,
  ...ownerEvents,
  ...regulationEvents,
  ...marketEvents,
];

export const eventById = (id: string): GameEvent => {
  const e = ALL_EVENTS.find((e) => e.id === id);
  if (!e) throw new Error(`unknown event ${id}`);
  return e;
};

const FALLBACKS: Record<EventCategory, { flavor: string; apply: (ctx: EventCtx) => string[] }> = {
  guest: {
    flavor: "A quiet week. Guests check in, guests check out, nobody mentions the wifi. Suspicious, frankly.",
    apply: (ctx) => {
      ctx.p.cash += 500;
      return ["+£500 of small upsells"];
    },
  },
  owner: {
    flavor: "You call an old landlord contact to stay warm. Pleasant chat, no business. Yet.",
    apply: (ctx) => {
      ctx.p.trust = clamp(ctx.p.trust + 2, 1, 100);
      return ["Owner trust +2"];
    },
  },
  regulation: {
    flavor: "A new consultation paper on short lets is published. 84 pages. You skim the executive summary like everyone else.",
    apply: (ctx) => {
      rep(ctx.p, 1);
      return ["Rep +1"];
    },
  },
  market: {
    flavor: "The market does nothing dramatic for once. Operators everywhere feel briefly, unnervingly calm.",
    apply: () => [],
  },
};

export function drawEvent(ctx: EventCtx, category: EventCategory): PendingAction {
  const pool = ALL_EVENTS.filter(
    (e) =>
      e.category === category &&
      e.id !== ctx.p.lastEventId &&
      (!e.canApply || e.canApply(ctx.p, ctx.state)),
  );
  if (!pool.length) {
    const fb = FALLBACKS[category];
    const effects = fb.apply(ctx);
    return {
      kind: "event",
      eventId: `fallback_${category}`,
      category,
      title: "Quiet week",
      emoji: "🍵",
      flavor: fb.flavor,
      effects,
      choices: [],
      memo: {},
    };
  }
  const ev = pick(ctx.rng, pool);
  ctx.p.lastEventId = ev.id;
  const result = ev.draw(ctx);
  return {
    kind: "event",
    eventId: ev.id,
    category: ev.category,
    title: ev.title,
    emoji: ev.emoji,
    flavor: result.flavor,
    effects: result.effects,
    choices: result.choices,
    memo: result.memo,
  };
}
