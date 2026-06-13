"use client";

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
import { drawShareCard, downloadShareCard, nativeShare, shareText, type ShareData } from "@/lib/game/share";
import Leaderboard from "./Leaderboard";

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
  const won = game?.winnerId === 0;

  const standings = useMemo(
    () => [...results].sort((a, b) => b.score.total - a.score.total),
    [results],
  );

  const shareData: ShareData | null = useMemo(() => {
    if (!humanResult) return null;
    const rank = savedRun
      ? rankOnBoard(game!.mode === "daily" ? "daily" : "overall", savedRun)
      : null;
    return { result: humanResult, won, rank, nickname: nickname || "You" };
  }, [humanResult, savedRun, won, nickname, game]);

  // confetti for winners
  useEffect(() => {
    if (!won || confettiFired.current) return;
    confettiFired.current = true;
    void (async () => {
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.25 }, colors: ["#B9F33E", "#FF7AC3", "#6FA8FF", "#FAF6EA"] });
      setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.4 } }), 450);
    })();
  }, [won]);

  // pre-render share card
  useEffect(() => {
    if (!shareData) return;
    let alive = true;
    void drawShareCard(shareData).then((c) => alive && setCardUrl(c.toDataURL("image/png")));
    return () => {
      alive = false;
    };
  }, [shareData]);

  if (!game || !human || !humanResult) return null;
  const arch = ARCHETYPES[humanResult.archetype];
  const s = humanResult.score;

  const save = () => {
    if (!nickname.trim() || savedRun) return;
    const run = buildRun(game, human, humanResult, nickname.trim().slice(0, 16));
    scoreStore.add(run);
    setSavedRun(run);
  };

  const breakdown: Array<[string, number]> = [
    ["Cash", s.cash],
    ["Property equity", s.equity],
    ["12 × monthly NOI", s.noiValue],
    ["Owner contract value", s.ownerContractValue],
    ["Reputation value", s.reputationValue],
    ["Loan debt", -s.debt],
    ["Risk penalties", -s.riskPenalty],
    ["Bankruptcy penalty", -s.bankruptcyPenalty],
    ["Investor's 12%", -s.investorCut],
  ];

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-10" data-testid="gameover-screen">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-cream-50/50">
          The year is over
        </div>
        <h1 className="font-display mt-1 text-3xl font-extrabold leading-tight">
          {won ? (
            <>
              You built the strongest <span className="text-lime-400">empire</span> 👑
            </>
          ) : human.bankrupt ? (
            <>
              The bank took the <span className="text-coral-400">keys</span> 💀
            </>
          ) : (
            <>
              {game.players[game.winnerId!].name} takes the crown
              {game.players[game.winnerId!].emoji}
            </>
          )}
        </h1>
      </motion.div>

      {/* standings */}
      <div className="mt-6 space-y-1.5">
        {standings.map((r, i) => {
          const p = game.players[r.playerId];
          return (
            <motion.div
              key={r.playerId}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 * i }}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ${p.isHuman ? "border border-lime-400/50 bg-lime-400/8" : "panel"}`}
            >
              <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
              <span className="text-lg">{p.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: p.color }}>
                {p.name}
                {p.bankrupt && <span className="ml-1.5 text-[0.62rem] text-coral-400">BANKRUPT</span>}
              </span>
              <span className="font-ledger text-base font-bold">{gbp(r.score.total)}</span>
            </motion.div>
          );
        })}
      </div>

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
          <span className="chip">🏠 {humanResult.unitsLive} live units</span>
          <span className="chip">🚩 {humanResult.areasControlled} areas</span>
          <span className="chip">🤝 {humanResult.managedUnits} managed</span>
          <span className="chip">⚙️ ops {humanResult.opsUsed.toFixed(1)}/{humanResult.opsCap}</span>
        </div>
      </motion.div>

      {/* the books */}
      <div className="card-cream mt-5 p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-display text-lg font-bold">Rental Empire Score</span>
          <span className="font-ledger text-2xl font-extrabold text-lime-900">{gbpFull(s.total)}</span>
        </div>
        <div className="space-y-1 border-t border-dashed border-creamink/25 pt-2">
          {breakdown.map(([label, v], i) =>
            v === 0 ? null : (
              <motion.div
                key={label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.07 }}
                className="flex justify-between text-[0.8rem]"
              >
                <span className="text-creamink/70">{label}</span>
                <span className={`font-ledger font-semibold ${v < 0 ? "text-coral-500" : ""}`}>
                  {v < 0 ? "−" : "+"}£{Math.abs(v).toLocaleString("en-GB")}
                </span>
              </motion.div>
            ),
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t-2 border-creamink/20 pt-2.5 text-[0.74rem]">
          <div className="flex justify-between"><span className="text-creamink/60">Monthly NOI</span><span className="font-ledger font-bold">{gbpFull(s.noi)}/mo</span></div>
          <div className="flex justify-between"><span className="text-creamink/60">Cash</span><span className="font-ledger font-bold">{gbp(s.cash)}</span></div>
          <div className="flex justify-between"><span className="text-creamink/60">Reputation</span><span className="font-ledger font-bold">{human.rep}/100</span></div>
          <div className="flex justify-between"><span className="text-creamink/60">Owner trust</span><span className="font-ledger font-bold">{human.trust}/100</span></div>
        </div>
        <div className="mt-3 space-y-1 border-t border-dashed border-creamink/25 pt-2 text-[0.78rem]">
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
          Brag responsibly
        </div>
        {cardUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cardUrl} alt="Your shareable result card" className="w-full rounded-2xl border border-line" />
        )}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button onClick={() => shareData && void downloadShareCard(shareData)} className="btn-dark h-10 text-[0.74rem] font-bold">
            ⬇ Download
          </button>
          <button
            onClick={() => shareData && void nativeShare(shareData)}
            className="btn-dark h-10 text-[0.74rem] font-bold"
          >
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
            <div className="text-sm font-bold">Save your score to the leaderboard?</div>
            <p className="mt-0.5 text-[0.7rem] text-cream-50/55">
              Nickname only. No account, no email, no nonsense.
            </p>
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
            {(["overall", "daily", "strKing", "cashflow", "ownerTrust"] as const).map((b) => {
              const r = rankOnBoard(b, savedRun);
              return r && r <= 15 ? (
                <span key={b} className="chip text-lime-300">
                  #{r} {b === "overall" ? "Overall" : b === "daily" ? "Daily" : b === "strKing" ? "STR King" : b === "cashflow" ? "Cashflow" : "Trust"}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="mt-4">
        <Leaderboard
          highlightRunId={savedRun?.id}
          initialBoard={game.mode === "daily" ? "daily" : "overall"}
        />
      </div>

      {/* actions */}
      <div className="mt-6 space-y-2">
        <button onClick={() => newGame(game.mode)} className="btn-primary h-12 w-full text-base">
          Run it back →
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
