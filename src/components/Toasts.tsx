"use client";

import { useGame } from "@/lib/store";

const toneColor: Record<string, string> = {
  good: "text-lime-300",
  bad: "text-coral-400",
  money: "text-cream-50",
  neutral: "text-cream-50/80",
};

export default function Toasts() {
  const toasts = useGame((s) => s.ui.toasts);
  const screen = useGame((s) => s.ui.screen);
  if (screen === "menu") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[80] flex flex-col items-center gap-1.5 px-4">
      {toasts.slice(-3).map((t) => (
        <div
          key={t.id}
          className="panel pop-in flex max-w-[min(92vw,420px)] items-center gap-2 rounded-full px-3.5 py-1.5"
        >
          {t.color && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
          )}
          <span className={`truncate text-xs font-medium ${toneColor[t.tone]}`}>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
