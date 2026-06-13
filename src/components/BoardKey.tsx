"use client";

// A plain-language key for everything the board shows, reachable from the
// "Key" chip. Works on touch where hover tooltips don't.

import { Sheet, BuildingIcon } from "./ui";

function Row({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">{icon}</div>
      <div className="min-w-0">
        <div className="text-[0.82rem] font-bold leading-tight">{title}</div>
        <div className="text-[0.72rem] leading-snug text-cream-50/60">{body}</div>
      </div>
    </div>
  );
}

export default function BoardKey({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} maxW="max-w-md">
      <div className="p-4 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Board key</h3>
          <button onClick={onClose} className="btn-dark h-8 px-3 text-xs">
            Close
          </button>
        </div>

        <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-wider text-cream-50/45">
          What's on a tile
        </div>
        <div className="space-y-2.5">
          <Row
            icon={<BuildingIcon kind="house" color="#9fb0c8" className="h-7 w-7" />}
            title="House = live rental units"
            body="A live property earning money. It's tinted to the owner's colour, and the number beside it is how many units they run there."
          />
          <Row
            icon={<BuildingIcon kind="hotel" color="#9fb0c8" className="h-7 w-7" />}
            title="Tower = a hotel or a whole building"
            body="A bigger, live operation: Hotel Mode or a leased building. Also in the owner's colour with a unit count."
          />
          <Row
            icon={<span className="h-6 w-6 rounded-[5px] border-[3px]" style={{ borderColor: "#B9F33E" }} />}
            title="Coloured tile border = who controls it"
            body="The player with the most live value in an area controls it. Land on someone else's area and you pay them a stay fee — these climb as the game ages."
          />
          <Row
            icon={<span className="text-[0.55rem] font-bold uppercase text-cream-50/40">open</span>}
            title="OPEN = nobody has built here yet"
            body="The area is up for grabs. Land on it to rent, buy, manage or lease."
          />
        </div>

        <div className="mb-1.5 mt-5 text-[0.62rem] font-bold uppercase tracking-wider text-cream-50/45">
          Pipeline badges (not earning yet)
        </div>
        <p className="mb-2 text-[0.7rem] leading-snug text-cream-50/55">
          A property in progress shows a badge with the months remaining. The little
          stripe on its left is the owner&apos;s colour.
        </p>
        <div className="space-y-2.5">
          <Row
            icon={<span className="text-xl">🏗️</span>}
            title="Building setup"
            body="A freshly leased building in its first month, before fit-out begins."
          />
          <Row
            icon={<span className="text-xl">🛋️</span>}
            title="Furnishing"
            body="Being furnished. It goes live (and starts earning) when the countdown hits zero — until then it only costs money."
          />
          <Row
            icon={<span className="text-xl">📋</span>}
            title="Licence pending"
            body="A short-let / hotel licence application is in. The council decides in the months shown; it can be approved or rejected."
          />
        </div>

        <div className="mt-5 rounded-xl bg-ink-800/60 px-3 py-2 text-[0.72rem] leading-snug text-cream-50/60">
          💡 The goal: outlast your rivals. Squeeze them with stay fees and survive the
          tightening market until you&apos;re the last solvent operator standing.
        </div>
      </div>
    </Sheet>
  );
}
