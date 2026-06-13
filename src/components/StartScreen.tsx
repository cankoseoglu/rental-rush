"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useGame } from "@/lib/store";
import { dailyNumber } from "@/lib/game/leaderboard";
import Leaderboard from "./Leaderboard";
import { Sheet } from "./ui";

const STEPS = [
  { emoji: "🎲", title: "Roll & claim areas", body: "16 neighbourhoods. Stack units, take control, charge rivals stay fees on your turf." },
  { emoji: "🤝", title: "Pick your angle", body: "Rent, buy, manage — or lease whole buildings. Run each as STR, MTR, LTR or Hotel Mode." },
  { emoji: "🏗️", title: "Race the pipelines", body: "Furnishing fast or slow, licences that get rejected, buildings burning cash before they open." },
  { emoji: "🧾", title: "Survive month end", body: "Every month the books close for everyone: revenue, payroll, projects, fines. Winter bites first." },
];

export default function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);
  const hasSave = useGame((s) => s.hasSave);
  const [boards, setBoards] = useState(false);

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-10 pt-14 sm:pt-20">
      {/* spinning ring decoration */}
      <div
        className="pointer-events-none absolute left-1/2 top-6 -z-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full border border-dashed border-line/50 opacity-60"
        style={{ animation: "glowSpin 80s linear infinite" }}
      />
      <div className="pointer-events-none absolute left-1/2 top-24 -z-0 h-[280px] w-[280px] -translate-x-1/2 rounded-full border border-line/30" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative text-center"
      >
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
          Claim neighbourhoods, stack units, lease whole buildings and flip them to Hotel Mode.
          Hire before the chaos, survive winter and the council — and out-build two rival operators.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="relative mt-7 space-y-2.5"
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
        <button onClick={() => setBoards(true)} className="mx-auto block pt-1 text-[0.74rem] font-semibold text-cream-50/50 underline-offset-4 hover:underline">
          Peek at the leaderboards 🏆
        </button>
      </motion.div>

      {/* rivals */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.22 }}
        className="relative mt-8 grid grid-cols-2 gap-2.5"
      >
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
      </motion.div>

      {/* how it works */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="relative mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {STEPS.map((s) => (
          <div key={s.title} className="panel flex items-start gap-3 p-3">
            <span className="text-xl">{s.emoji}</span>
            <div>
              <div className="text-[0.8rem] font-bold">{s.title}</div>
              <div className="text-[0.7rem] leading-snug text-cream-50/55">{s.body}</div>
            </div>
          </div>
        ))}
      </motion.div>

      <p className="relative mt-8 text-center text-[0.66rem] text-cream-50/35">
        No signup. No download. Save your score with a nickname after the game — only if you want.
      </p>

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
