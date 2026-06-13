import type { StaffDef, StaffId, PlayerState } from "../types";

export const STAFF: StaffDef[] = [
  {
    id: "guestOps",
    name: "Guest ops assistant",
    emoji: "🎧",
    salary: 5000,
    blurb: "Answers the 2am 'how does the oven work' messages so you don't have to.",
    effect: "+8 ops capacity",
  },
  {
    id: "cleaners",
    name: "Cleaner network",
    emoji: "🧽",
    salary: 4000,
    blurb: "A bench of vetted cleaners. No-shows stop being your problem.",
    effect: "Fewer cleaning incidents, cheaper turnovers",
  },
  {
    id: "maintenance",
    name: "Maintenance coordinator",
    emoji: "🔧",
    salary: 5000,
    blurb: "Knows a boiler engineer who answers the phone on Sundays.",
    effect: "−40% repair costs, no delay penalties",
  },
  {
    id: "revenue",
    name: "Revenue manager",
    emoji: "📈",
    salary: 7000,
    blurb: "Lives in a spreadsheet, prices every night like it's the last seat on a flight.",
    effect: "+8% ADR, +4pts occupancy",
  },
  {
    id: "ownerSuccess",
    name: "Owner success manager",
    emoji: "🤝",
    salary: 5000,
    blurb: "Sends owners beautiful monthly reports before they even ask.",
    effect: "+3 owner trust per month, handles owner calls",
  },
  {
    id: "aiOps",
    name: "AI ops system",
    emoji: "🤖",
    salary: 3000,
    blurb: "Drafts replies, triages issues, never sleeps, never unionises.",
    effect: "+8 ops capacity, −60% missed-message incidents",
  },
];

export const staffById = (id: StaffId): StaffDef => STAFF.find((s) => s.id === id)!;

export const hasStaff = (p: PlayerState, id: StaffId): boolean => p.staff.includes(id);

export const staffCost = (p: PlayerState): number =>
  p.staff.reduce((sum, id) => sum + staffById(id).salary, 0);

export const opsCapacity = (p: PlayerState): number =>
  8 + (hasStaff(p, "guestOps") ? 8 : 0) + (hasStaff(p, "aiOps") ? 8 : 0);
