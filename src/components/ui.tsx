"use client";

// Shared atoms: Sheet (modal/bottom-sheet), AreaArt, meters, model metadata.

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import clsx from "clsx";
import type { OpModel } from "@/lib/game/types";

// --- 3D building icons -------------------------------------------------------
// Original (non-trademarked) little 3D buildings, tinted to the owner's colour:
// a pitched-roof house for units, a taller window-grid tower for hotels/blocks.

/** Lighten (pct>0) or darken (pct<0) a #rrggbb colour. */
function shade(hex: string, pct: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const adj = (c: number) =>
    Math.max(0, Math.min(255, Math.round(pct < 0 ? c * (1 + pct) : c + (255 - c) * pct)));
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function BuildingIcon({
  kind,
  color,
  className,
}: {
  kind: "house" | "hotel";
  color: string;
  className?: string;
}) {
  const light = shade(color, 0.32);
  const dark = shade(color, -0.3);
  const darker = shade(color, -0.5);
  const win = shade(color, 0.6);
  if (kind === "hotel") {
    return (
      <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
        <ellipse cx="13.5" cy="25.2" rx="10" ry="1.7" fill="#000" opacity="0.18" />
        <polygon points="16,7 21,4 21,21 16,24" fill={dark} />
        <polygon points="6,7 11,4 21,4 16,7" fill={light} />
        <rect x="6" y="7" width="10" height="17" rx="0.6" fill={color} />
        {[9.6, 13.1, 16.6].map((y) => (
          <g key={y}>
            <rect x="8" y={y} width="2.2" height="2.6" rx="0.3" fill={win} />
            <rect x="11.6" y={y} width="2.2" height="2.6" rx="0.3" fill={win} />
          </g>
        ))}
        <rect x="9.4" y="20.2" width="3.2" height="3.8" rx="0.3" fill={darker} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <ellipse cx="13.5" cy="25.2" rx="9.5" ry="1.6" fill="#000" opacity="0.18" />
      <polygon points="17,13 22,9.5 22,19.5 17,23" fill={dark} />
      <polygon points="11,6.5 16,3.5 22,9.5 17,13" fill={darker} />
      <rect x="5" y="13" width="12" height="10" rx="0.6" fill={color} />
      <polygon points="5,13 11,6.5 17,13" fill={light} />
      <rect x="9" y="17.4" width="3.4" height="5.6" rx="0.4" fill={darker} />
    </svg>
  );
}

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

export function AreaArt({
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
      <span className="relative text-2xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">{emoji}</span>
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

export const MODEL_META: Record<
  OpModel,
  { label: string; full: string; color: string; emoji: string; blurb: string }
> = {
  STR: {
    label: "STR",
    full: "Short-term lets",
    color: "#FF8A5C",
    emoji: "🔥",
    blurb: "Highest revenue, heaviest ops, reviews & regulation bite.",
  },
  MTR: {
    label: "MTR",
    full: "Mid-term stays",
    color: "#59C8DC",
    emoji: "💼",
    blurb: "Monthly tenants, light vacancies, calm ops.",
  },
  LTR: {
    label: "LTR",
    full: "Long-term let",
    color: "#9FD98A",
    emoji: "🌱",
    blurb: "Fixed rent, near-zero drama, lowest upside.",
  },
  HOTEL: {
    label: "HOTEL",
    full: "Hotel Mode",
    color: "#C9A0FF",
    emoji: "🛎️",
    blurb: "Buildings only. Licence + staff required. Prints when it works.",
  },
};

export function ModelTag({ m }: { m: OpModel }) {
  const meta = MODEL_META[m];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.66rem] font-bold"
      style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55` }}
    >
      {meta.emoji} {meta.label}
    </span>
  );
}

export function StatusTag({
  status,
  monthsToLive,
  licenceMonths,
}: {
  status: string;
  monthsToLive?: number;
  licenceMonths?: number;
}) {
  const map: Record<string, [string, string]> = {
    live: ["LIVE", "#B9F33E"],
    prep: [`BUILD ${monthsToLive ?? "?"}M`, "#FFB454"],
    furnishing: [`FURN ${monthsToLive ?? "?"}M`, "#FFB454"],
    awaitingLicence: [`LIC ${licenceMonths && licenceMonths > 0 ? `${licenceMonths}M` : "WAIT"}`, "#C9A0FF"],
    suspended: ["SUSPENDED", "#FF6F61"],
  };
  const [label, color] = map[status] ?? [status.toUpperCase(), "#8aa"];
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[0.6rem] font-extrabold tracking-wide"
      style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }}
    >
      {label}
    </span>
  );
}
