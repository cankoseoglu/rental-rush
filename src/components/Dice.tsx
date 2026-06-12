"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling) {
      setFace(value);
      return;
    }
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(t);
  }, [rolling, value]);

  return (
    <div
      className={clsx(
        "grid h-11 w-11 grid-cols-3 grid-rows-3 place-items-center rounded-xl border border-white/40 bg-gradient-to-b from-cream-50 to-cream-300 p-1.5 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.6)]",
        rolling && "dice-rolling",
      )}
      aria-label={rolling ? "rolling die" : `die showing ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={clsx(
            "h-[7px] w-[7px] rounded-full",
            PIPS[face]?.includes(i) ? "bg-creamink" : "bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

export default function Dice({
  a,
  b,
  rolling,
}: {
  a: number;
  b: number;
  rolling: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Die value={a} rolling={rolling} />
      <Die value={b} rolling={rolling} />
    </div>
  );
}
