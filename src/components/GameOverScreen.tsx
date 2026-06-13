"use client";

// The finale. There is no score: the last solvent operator wins, the fallen
// get tombstones, and everything else is post-game bragging material.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useGame } from "@/lib/store";
import { gbp, gbpFull } from "@/lib/game/format";
import { ARCHETYPES } from "@/lib/game/engine/score";
import {
  buildRun,
  rankOnBoard,
  scoreStore,
  type SavedRun,
} from "@/lib/game/leaderboard";
import { downloadShareCard, nativeShare, shareText, type ShareData, drawShareCard } from "@/lib/game/share";
import Leaderboard from "./Leaderboard";
import clsx from "clsx";

export default function GameOverScreen() {
  const game = useGame((s) => s.game);
  const newGame = useGame((s) => s.newGame);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const [nickname, setNickname] = useState("");
  const [savedRun, setSavedRun] = useState<SavedRun | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const confettiFired = useRef(false);

  const human = game?.players[0];
  const results = game?.results ?? [];
  const humanResult = results.find((r) => r.playerId === 0);
  const winner = game ? game.players[game.winnerId ?? 0] : null;
  const won = game?.winnerId === 0;

  const fallen = useMemo(
    () =>
      results
        .filter((r) => r.bankrupt)
        .sort((a, b) => a.survivalMonth - b.survivalMonth),
    [results],
  );

  const shareData: ShareData | null = useMemo(() => {
    if (!humanResult) return null;
    const rank = savedRun
      ? rankOnBoard(game!.mode === "daily" ? "daily" : "overall", savedRun)
      : null;
    return { result: humanResult, won, rank, nickname: nickname || "You" };
  }, [humanResult, savedRun, won, nickname, game]);

  useEffect(() => {
    if (!won || confettiFired.current) return;
    confettiFired.current = true;
    void (async () => {
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 140, spread: 75, origin: { y: 0.25 }, colors: ["#B9F33E", "#FF7AC3", "#6FA8FF", "#FAF6EA"] });
      setTimeout(() => confetti({ particleCount: 70, spread: 100, origin: { y: 0.4 } }), 450);
    })();
  }, [won]);

  useEffect(() => {
    if (!shareData) return;
    let alive = true;
    void drawShareCard(shareData).then((c) => alive && setCardUrl(c.toDataURL("image/png")));
    return () => {
      alive = false;
    };
  }, [shareData]);

  if (!game || !human || !humanResult || !winner) return null;
  const arch = ARCHETYPES[humanResult.archetype];

  const save = () => {
    if (!nickname.trim() || savedRun) return;
    const run = buildRun(game, human, humanResult, nickname.trim().slice(0, 16));
    scoreStore.add(run);
    setSavedRun(run);
  };

  const statRows: Array<[string, string]> = [
    ["Survived to", `Month ${humanResult.survivalMonth}`],
    ["Final cash", gbpFull(humanResult.cash)],
    ["Live units", `${humanResult.unitsLive} (${(["STR", "MTR", "LTR", "HOTEL"] as const).filter((m) => humanResult.unitsByModel[m] > 0).map((m) => `${humanResult.unitsByModel[m]} ${m}`).join(" · ") || "none"})`],
    ["Areas controlled", `${humanResult.areasControlled}${humanResult.citySets > 0 ? ` · ${humanResult.citySets} city set${humanResult.citySets > 1 ? "s" : ""}` : ""}`],
    ["Monthly net cash flow", `${humanResult.noi >= 0 ? "+" : ""}${gbp(humanResult.noi)}/mo`],
    ["Total rent collected", gbp(humanResult.rentCollected)],
    ["Debt", gbp(humanResult.debt)],
    ["Bankruptcies caused", `${humanResult.bankruptciesCaused}`],
  ];

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-10" data-testid="gameover-screen">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-cream-50/50">
          {won ? "The market is yours" : "The market has spoken"}
        </div>
        <h1 className="font-display mt-1 text-3xl font-extrabold leading-tight">
          {won ? (
            <>
              Winner: <span className="text-lime-400">You</span> 👑
            </>
          ) : (
            <>
              Winner: <span style={{ color: winner.color }}>{winner.name}</span> {winner.emoji}
            </>
          )}
        </h1>
        <div className="mt-1 text-[0.86rem] font-semibold text-cream-50/70">
          Last solvent operator standing{won && fallen.length ? ` — you bankrupted ${fallen.map((f) => game.players[f.playerId].name).join(" and ")}` : ""}.
        </div>
      </motion.div>

      {/* tombstones */}
      {fallen.length > 0 && (
        <div className="mt-6 space-y-2">
          {fallen.map((r, i) => {
            const p = game.players[r.playerId];
            return (
              <motion.div
                key={r.playerId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + 0.12 * i }}
                className="rounded-2xl border border-line bg-ink-850/80 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: p.color }}>
                  🪦 {p.emoji} {p.name}
                  <span className="text-[0.62rem] font-semibold text-cream-50/45">
                    out in month {r.survivalMonth}
                  </span>
                </div>
                <div className="mt-0.5 text-[0.74rem] leading-snug text-cream-50/65">
                  {r.tombstone ?? "Ran out of road."}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* archetype */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 250, damping: 22 }}
        className="mt-5 rounded-3xl border p-4 text-center"
        style={{
          borderColor: `hsl(${arch.hue} 70% 60% / 0.5)`,
          background: `radial-gradient(140% 140% at 50% 0%, hsl(${arch.hue} 70% 55% / 0.14), transparent 70%)`,
        }}
      >
        <div className="text-4xl">{arch.emoji}</div>
        <div className="font-display mt-1 text-2xl font-extrabold" style={{ color: `hsl(${arch.hue} 85% 70%)` }}>
          {arch.name}
        </div>
        <div className="mx-auto mt-1 max-w-sm text-[0.8rem] leading-snug text-cream-50/70">{arch.blurb}</div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <span className="chip">{humanResult.strategyLabel}</span>
          {humanResult.strongestArea && <span className="chip">💪 {humanResult.strongestArea}</span>}
          <span className="chip">⚙️ ops {humanResult.opsUsed.toFixed(1)}/{humanResult.opsCap}</span>
        </div>
      </motion.div>

      {/* post-game stats (NOT a score — just the story) */}
      <div className="card-cream mt-5 p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-display text-lg font-bold">Your run, on paper</span>
          <span className="rounded-full bg-creamink/8 px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wider text-creamink/55">
            post-game stats
          </span>
        </div>
        <div className="space-y-1.5">
          {statRows.map(([k, v], i) => (
            <motion.div
              key={k}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.06 }}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="text-[0.8rem] text-creamink/70">{k}</span>
              <span className="font-ledger text-right text-[0.84rem] font-semibold">{v}</span>
            </motion.div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-dashed border-creamink/25 pt-2 text-[0.78rem]">
          {humanResult.biggestAuctionWin && (
            <div>
              🔨 <span className="font-semibold">Auction coup:</span> {humanResult.biggestAuctionWin}
            </div>
          )}
          <div>
            🏆 <span className="font-semibold">Biggest win:</span> {humanResult.biggestWin}
          </div>
          <div>
            💥 <span className="font-semibold">Biggest mistake:</span> {humanResult.biggestMistake}
          </div>
        </div>
      </div>

      {/* share */}
      <div className="mt-5">
        <div className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-wider text-cream-50/45">
          {won ? "Brag responsibly" : "Misery loves company"}
        </div>
        {cardUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cardUrl} alt="Your shareable result card" className="w-full rounded-2xl border border-line" />
        )}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button onClick={() => shareData && void downloadShareCard(shareData)} className="btn-dark h-10 text-[0.74rem] font-bold">
            ⬇ Download
          </button>
          <button onClick={() => shareData && void nativeShare(shareData)} className="btn-dark h-10 text-[0.74rem] font-bold">
            📤 Share
          </button>
          <button
            onClick={() => {
              if (!shareData) return;
              void navigator.clipboard.writeText(shareText(shareData));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn-dark h-10 text-[0.74rem] font-bold"
          >
            {copied ? "✓ Copied" : "📋 Copy text"}
          </button>
        </div>
      </div>

      {/* leaderboard save */}
      <div className="panel mt-5 p-4">
        {!savedRun ? (
          <>
            <div className="text-sm font-bold">Save your run to the leaderboard?</div>
            <p className="mt-0.5 text-[0.7rem] text-cream-50/55">Nickname only. No account, no email, no nonsense.</p>
            <div className="mt-2 flex gap-1.5">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={16}
                placeholder="e.g. TurnoverTerry"
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink-900 px-4 text-sm font-semibold outline-none placeholder:text-cream-50/30 focus:border-lime-400/60"
              />
              <button onClick={save} disabled={!nickname.trim()} className="btn-primary h-11 px-5 text-sm">
                Save
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
            <span>Saved as {savedRun.nickname} ✓</span>
            {(["overall", "daily", "strKing", "cashflow", "ownerTrust", "fastBankrupt"] as const).map((b) => {
              const r = rankOnBoard(b, savedRun);
              return r && r <= 15 ? (
                <span key={b} className={clsx("chip", b === "fastBankrupt" ? "text-coral-400" : "text-lime-300")}>
                  #{r}{" "}
                  {b === "overall" ? "Overall" : b === "daily" ? "Daily" : b === "strKing" ? "STR King" : b === "cashflow" ? "Cashflow" : b === "ownerTrust" ? "Trust" : "💀 Fastest out"}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="mt-4">
        <Leaderboard highlightRunId={savedRun?.id} initialBoard={game.mode === "daily" ? "daily" : "overall"} />
      </div>

      <div className="mt-6 space-y-2">
        <button onClick={() => newGame(game.mode)} className="btn-primary h-12 w-full text-base">
          {won ? "Defend the crown →" : "Run it back →"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => newGame(game.mode === "daily" ? "quick" : "daily")} className="btn-dark h-11 text-sm">
            {game.mode === "daily" ? "Quick game" : "📅 Daily challenge"}
          </button>
          <button onClick={quitToMenu} className="btn-dark h-11 text-sm">
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
