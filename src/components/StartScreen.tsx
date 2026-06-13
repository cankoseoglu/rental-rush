"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useGame } from "@/lib/store";
import { dailyNumber } from "@/lib/game/leaderboard";
import Leaderboard from "./Leaderboard";
import { Sheet } from "./ui";

const GITHUB = "https://github.com/cankoseoglu/rental-rush";
const SITE = "https://cankoseoglu.com";

const STEPS = [
  { emoji: "🎲", title: "Claim areas, charge fees", body: "16 neighbourhoods. Control the turf and rivals pay you every time they land. Those fees only grow." },
  { emoji: "🔨", title: "Fight at auction", body: "Units, buildings, owner mandates, permits, and the carcasses of bankrupt rivals." },
  { emoji: "📉", title: "Outlast the market", body: "A market-cycle deck tightens every month: rates, crackdowns, funding winters, consolidation." },
  { emoji: "💀", title: "Bankrupt them all", body: "No points, no final score. The last solvent operator standing takes everything." },
];

const VENTURES: Array<{ year: string; name: string; emoji: string; blurb: string }> = [
  { year: "2010", name: "First Airbnb, Istanbul", emoji: "🏠", blurb: "I listed my first flat and got hooked on the operating side of property." },
  { year: "2015", name: "Erasmusinn", emoji: "🎓", blurb: "A student-housing marketplace that grew to around ten thousand rooms. Backed by 500 Startups." },
  { year: "2019", name: "Oval Experiences", emoji: "🏙️", blurb: "Bootstrapped, running about sixty short-let apartments. Where I learned how quickly an operation falls over." },
  { year: "", name: "Fullog", emoji: "📦", blurb: "The same playbook in fulfilment: arbitraging space and running the logistics on top of it." },
  { year: "2024", name: "Cendra", emoji: "🤖", blurb: "What I'm building now: AI for the messy, human side of running rentals." },
];

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);
  const hasSave = useGame((s) => s.hasSave);
  const [boards, setBoards] = useState(false);

  return (
    <div className="min-h-dvh">
      {/* ---------- sticky header ---------- */}
      <header className="sticky top-0 z-40 border-b border-line/40 bg-ink-950/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="font-display text-base font-extrabold tracking-tight">
            RENTAL<span className="text-lime-400">RUSH</span>
          </button>
          <nav className="hidden items-center gap-6 text-[0.8rem] font-semibold text-cream-50/70 sm:flex">
            <a href="#how" className="transition hover:text-cream-50">How it works</a>
            <a href="#story" className="transition hover:text-cream-50">The story</a>
            <a href="#contribute" className="transition hover:text-cream-50">Contribute</a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={GITHUB}
              target="_blank"
              rel="noreferrer noopener"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-ink-800/70 text-cream-50/80 transition hover:text-cream-50"
              aria-label="View Rental Rush on GitHub"
            >
              <GitHubMark className="h-4 w-4" />
            </a>
            <button onClick={() => newGame("quick")} className="btn-primary h-9 px-4 text-sm">
              Play
            </button>
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:pt-20">
        <div
          className="pointer-events-none absolute left-1/2 top-2 -z-0 h-[440px] w-[440px] -translate-x-1/2 rounded-full border border-dashed border-line/50 opacity-60"
          style={{ animation: "glowSpin 80s linear infinite" }}
        />
        <div className="pointer-events-none absolute left-1/2 top-20 -z-0 h-[300px] w-[300px] -translate-x-1/2 rounded-full border border-line/30" />

        <div className="relative mx-auto max-w-xl">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-ink-800/70 px-3 py-1 text-[0.64rem] font-bold uppercase tracking-[0.18em] text-cream-50/60">
              A 10-minute property operator game
            </div>
            <h1 className="font-display text-[3.2rem] font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
              RENTAL
              <br />
              <span className="text-lime-400 drop-shadow-[0_0_24px_rgba(185,243,62,0.35)]">RUSH</span>
            </h1>
            <div className="mt-1 font-ledger text-[0.78rem] uppercase tracking-[0.3em] text-cream-50/55">
              · Operator Mode ·
            </div>
            <p className="text-balance mx-auto mt-4 max-w-sm text-[0.92rem] leading-relaxed text-cream-50/75">
              Claim neighbourhoods, stack units, lease buildings, flip them to Hotel Mode, then squeeze
              your rivals with stay fees and auctions until they fold. Last solvent operator wins.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="mt-7 space-y-2.5"
          >
            <button onClick={() => newGame("quick")} className="btn-primary h-14 w-full text-lg" data-testid="start-quick">
              Start your empire →
            </button>
            <button onClick={() => newGame("daily")} className="btn-dark h-12 w-full text-sm">
              📅 Daily Challenge #{dailyNumber()}
              <span className="ml-2 text-[0.66rem] text-cream-50/50">same market for everyone today</span>
            </button>
            {hasSave && (
              <button onClick={resume} className="btn-dark h-12 w-full text-sm text-lime-300">
                ▶ Resume your year
              </button>
            )}
            <div className="flex items-center justify-center gap-4 pt-1 text-[0.74rem] font-semibold text-cream-50/50">
              <button onClick={() => setBoards(true)} className="underline-offset-4 hover:text-cream-50 hover:underline">
                🏆 Leaderboards
              </button>
              <a href={GITHUB} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-cream-50 hover:underline">
                <GitHubMark className="h-3.5 w-3.5" /> Open source
              </a>
            </div>
          </motion.div>

          {/* rivals */}
          <div className="mt-9 grid grid-cols-2 gap-2.5">
            <div className="panel p-3">
              <div className="text-lg">🦩</div>
              <div className="text-sm font-bold text-pink-400">Maya</div>
              <div className="text-[0.7rem] leading-snug text-cream-50/55">
                Leases everything, prices hot, hires late. Beat her before she scales.
              </div>
            </div>
            <div className="panel p-3">
              <div className="text-lg">🦉</div>
              <div className="text-sm font-bold text-blue-400">Sam</div>
              <div className="text-[0.7rem] leading-snug text-cream-50/55">
                Buys careful, manages kindly, compounds quietly. Hard to shake.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="scroll-mt-20 px-5 py-12">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>How it plays</SectionLabel>
          <h2 className="font-display mb-6 text-2xl font-extrabold sm:text-3xl">
            A simple board with a real rental business underneath
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.title} className="panel flex items-start gap-3 p-4">
                <span className="text-xl">{s.emoji}</span>
                <div>
                  <div className="text-[0.86rem] font-bold">{s.title}</div>
                  <div className="text-[0.74rem] leading-snug text-cream-50/55">{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- the story / creator ---------- */}
      <section id="story" className="scroll-mt-20 px-5 py-12">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>The creator</SectionLabel>
          <h2 className="font-display mb-6 text-2xl font-extrabold sm:text-3xl">Why I built this</h2>

          <div className="card-cream p-6 sm:p-8">
            <div className="space-y-4 text-[0.92rem] leading-relaxed text-creamink/90">
              <p>
                I have been obsessed with property since I was a child, and it started with a board game.
                The little houses, the rent you collected when someone landed on your square, the gamble of
                when to buy and when to hold. It taught me, years before I understood it, that property is
                really a game of cash flow, timing and nerve.
              </p>
              <p>
                I have spent most of the last fifteen years living that out for real. I listed my first flat
                in Istanbul in 2010. I built Erasmusinn, a student-housing marketplace that grew to around ten
                thousand rooms. I bootstrapped Oval Experiences and ran about sixty short-let apartments, where
                I learned the hard way how quickly an operation falls over when it depends on people remembering
                everything. With Fullog I took the same playbook into fulfilment, arbitraging space and running
                the logistics on top of it. Today I am building Cendra, putting AI to work on the messy, human
                side of running rentals.
              </p>
              <p>
                Rental Rush is all of that, squeezed into ten minutes. Every mechanic comes from something I
                have actually felt: the void period in low season, the owner who wants paying on time, the
                licence that drags on for months, the building lease that bleeds you before it earns a penny.
                It is a small love letter to the operators who keep the lights on, and an experiment in how
                much real operating intuition a simple game can carry.
              </p>
            </div>
            <div className="mt-5 border-t border-creamink/15 pt-4">
              <div className="font-display text-base font-extrabold text-creamink">Can Köseoglu</div>
              <div className="text-[0.78rem] text-creamink/60">Operator for 15 years · Founder of Cendra</div>
            </div>
          </div>

          {/* venture timeline */}
          <div className="panel mt-4 p-5 sm:p-6">
            <div className="mb-4 text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
              The road here
            </div>
            <ol className="relative ml-2 space-y-5 border-l border-line/60">
              {VENTURES.map((v) => (
                <li key={v.name} className="relative pl-6">
                  <span className="absolute -left-[0.7rem] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-ink-800 text-[0.66rem]">
                    {v.emoji}
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-[0.92rem] font-bold">{v.name}</span>
                    {v.year && (
                      <span className="font-ledger text-[0.66rem] font-bold text-cream-50/45">{v.year}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[0.78rem] leading-snug text-cream-50/65">{v.blurb}</p>
                </li>
              ))}
            </ol>
          </div>

          <a
            href={SITE}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-dark mt-4 flex h-12 w-full items-center justify-center gap-2 text-sm"
          >
            More about me at cankoseoglu.com →
          </a>
        </div>
      </section>

      {/* ---------- open source / contribute ---------- */}
      <section id="contribute" className="scroll-mt-20 px-5 py-12">
        <div className="mx-auto max-w-3xl">
          <div
            className="relative overflow-hidden rounded-3xl border border-lime-400/30 p-6 sm:p-8"
            style={{ background: "radial-gradient(140% 130% at 50% 0%, rgba(185,243,62,0.12), transparent 70%)" }}
          >
            <SectionLabel>Open source</SectionLabel>
            <h2 className="font-display mb-3 text-2xl font-extrabold sm:text-3xl">
              It&apos;s open source. Make it better.
            </h2>
            <p className="max-w-xl text-[0.9rem] leading-relaxed text-cream-50/75">
              I built this in the open and put the whole thing on GitHub under an MIT licence. The game engine
              is pure TypeScript with its own test harness, so you can change the economy, add event cards or
              build a smarter rival and prove it still holds up. Pull requests, ideas and bug reports are all
              welcome.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["New event cards", "Balance tuning", "Smarter AI", "Accessibility", "A real leaderboard"].map((t) => (
                <span key={t} className="chip text-cream-50/70">
                  {t}
                </span>
              ))}
            </div>
            <a
              href={GITHUB}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-primary mt-5 inline-flex h-12 items-center gap-2 px-6 text-sm"
            >
              <GitHubMark className="h-4 w-4" /> View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-line/40 px-5 py-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="font-display text-base font-extrabold tracking-tight">
              RENTAL<span className="text-lime-400">RUSH</span>
            </div>
            <p className="mt-1 text-[0.74rem] text-cream-50/50">
              Built by{" "}
              <a href={SITE} target="_blank" rel="noreferrer noopener" className="font-semibold text-cream-50/75 underline-offset-2 hover:underline">
                Can Köseoglu
              </a>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.78rem] font-semibold text-cream-50/65">
            <button onClick={() => newGame("quick")} className="hover:text-cream-50">Play</button>
            <a href="#story" className="hover:text-cream-50">The story</a>
            <a href={SITE} target="_blank" rel="noreferrer noopener" className="hover:text-cream-50">cankoseoglu.com</a>
            <a href={GITHUB} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 hover:text-cream-50">
              <GitHubMark className="h-3.5 w-3.5" /> GitHub
            </a>
          </div>
        </div>
        <div className="mx-auto mt-6 max-w-3xl text-[0.66rem] leading-snug text-cream-50/30">
          An original game, inspired by the property-trading genre and years of operating short-term rentals.
          Not affiliated with, endorsed by or connected to any existing board-game brand. All code, text, art
          and music are original. © 2026 Can Köseoglu · MIT licensed.
        </div>
      </footer>

      <Sheet open={boards} onClose={() => setBoards(false)} maxW="max-w-md">
        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Leaderboards</h3>
            <button onClick={() => setBoards(false)} className="btn-dark h-8 px-3 text-xs">
              Close
            </button>
          </div>
          <Leaderboard />
        </div>
      </Sheet>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-lime-400/80">
      {children}
    </div>
  );
}
