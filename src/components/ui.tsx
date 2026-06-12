"use client";

// Small shared atoms: Sheet (modal/bottom-sheet), PropertyArt, meters.

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import clsx from "clsx";

export function Sheet({
  open,
  onClose,
  locked = false,
  children,
  maxW = "max-w-md",
  tone = "panel",
}: {
  open: boolean;
  onClose?: () => void;
  locked?: boolean;
  children: ReactNode;
  maxW?: string;
  tone?: "panel" | "danger";
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-950/70 backdrop-blur-[3px] sm:items-center sm:p-4"
          onClick={() => !locked && onClose?.()}
        >
          <motion.div
            initial={{ y: 80, opacity: 0.5, scale: 0.99 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              "w-full overflow-y-auto rounded-t-3xl sm:rounded-3xl",
              "max-h-[90dvh] sm:max-h-[86dvh]",
              maxW,
              tone === "danger"
                ? "border border-coral-500/40 bg-gradient-to-b from-[#241218] to-[#160c12] shadow-[0_0_60px_-12px_rgba(255,111,97,0.45)]"
                : "panel rounded-t-3xl",
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PropertyArt({
  hue,
  emoji,
  className,
}: {
  hue: number;
  emoji: string;
  className?: string;
}) {
  return (
    <div
      className={clsx("relative flex items-center justify-center overflow-hidden", className)}
      style={{
        background: `radial-gradient(120% 120% at 20% 0%, hsl(${hue} 60% 38% / 0.9), transparent 60%),
                     linear-gradient(145deg, hsl(${hue} 55% 26%), hsl(${(hue + 45) % 360} 60% 14%))`,
      }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.25) 1px, transparent 1.4px)",
          backgroundSize: "14px 14px",
        }}
      />
      <span className="relative text-4xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">{emoji}</span>
    </div>
  );
}

export function Bar({
  value,
  max,
  color,
  danger,
}: {
  value: number;
  max: number;
  color: string;
  danger?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-600/60">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: danger ? "#FF6F61" : color }}
      />
    </div>
  );
}

export const STRATEGY_META = {
  STR: { label: "STR", full: "Short-term lets", color: "#FF8A5C", emoji: "🔥" },
  MTR: { label: "MTR", full: "Mid-term stays", color: "#59C8DC", emoji: "💼" },
  LTR: { label: "LTR", full: "Long-term let", color: "#9FD98A", emoji: "🌱" },
} as const;

export const DEAL_META = {
  buy: { label: "Buy", emoji: "🏦", blurb: "Big cash down, mortgage, full upside + equity." },
  lease: { label: "Lease", emoji: "📝", blurb: "Rent it, run it, keep the spread. Fixed monthly bill." },
  manage: { label: "Manage", emoji: "🤝", blurb: "Run it for the owner. Low cost, fee income, trust matters." },
} as const;

export function StrategyTag({ s }: { s: keyof typeof STRATEGY_META }) {
  const m = STRATEGY_META[s];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold"
      style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}55` }}
    >
      {m.emoji} {m.label}
    </span>
  );
}
