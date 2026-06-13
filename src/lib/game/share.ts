// ---------------------------------------------------------------------------
// Share card: draws a 1080x1080 result card on a canvas.
// ---------------------------------------------------------------------------

import type { FinalResult } from "./types";
import { ARCHETYPES } from "./engine/score";
import { gbpFull } from "./format";

export interface ShareData {
  result: FinalResult;
  won: boolean;
  rank: number | null;
  nickname: string;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function drawShareCard(data: ShareData): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* draw with fallbacks */
    }
  }
  const S = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const arch = ARCHETYPES[data.result.archetype];

  const display = `"Bricolage Grotesque", "Arial Black", sans-serif`;
  const mono = `"Spline Sans Mono", "Courier New", monospace`;
  const body = `"Instrument Sans", "Helvetica Neue", sans-serif`;

  // backdrop
  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, "#0B1322");
  bg.addColorStop(1, "#060A13");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // dot grid
  ctx.fillStyle = "rgba(140,170,210,0.08)";
  for (let x = 40; x < S; x += 50) {
    for (let y = 40; y < S; y += 50) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // glow blob behind headline
  const glow = ctx.createRadialGradient(S / 2, 300, 40, S / 2, 300, 460);
  glow.addColorStop(0, `hsla(${arch.hue}, 80%, 60%, 0.22)`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  // wordmark pill
  ctx.fillStyle = "#B9F33E";
  roundRect(ctx, 60, 56, 312, 60, 30);
  ctx.fill();
  ctx.fillStyle = "#0A101C";
  ctx.font = `700 30px ${display}`;
  ctx.textBaseline = "middle";
  ctx.fillText("RENTAL RUSH", 86, 88);

  ctx.fillStyle = "rgba(240,245,255,0.55)";
  ctx.font = `500 26px ${body}`;
  ctx.textAlign = "right";
  ctx.fillText("Operator Mode", S - 60, 88);
  ctx.textAlign = "left";

  // headline
  const scoreTxt = gbpFull(Math.max(0, data.result.score.total));
  ctx.fillStyle = "#F4F0E4";
  ctx.font = `700 78px ${display}`;
  const headline = `I built a ${scoreTxt} rental empire in 10 minutes.`;
  const lines = wrapText(ctx, headline, S - 140);
  let y = 230;
  for (const line of lines) {
    // tint the £ figure
    if (line.includes(scoreTxt)) {
      const [pre, post] = line.split(scoreTxt);
      let x = 70;
      ctx.fillStyle = "#F4F0E4";
      ctx.fillText(pre, x, y);
      x += ctx.measureText(pre).width;
      ctx.fillStyle = "#B9F33E";
      ctx.fillText(scoreTxt, x, y);
      x += ctx.measureText(scoreTxt).width;
      ctx.fillStyle = "#F4F0E4";
      ctx.fillText(post, x, y);
    } else {
      ctx.fillStyle = "#F4F0E4";
      ctx.fillText(line, 70, y);
    }
    y += 92;
  }
  y += 8;

  // archetype chip
  ctx.font = `700 40px ${display}`;
  const archText = `${arch.emoji}  ${arch.name}`;
  const chipW = ctx.measureText(archText).width + 76;
  roundRect(ctx, 60, y - 6, chipW, 84, 42);
  ctx.fillStyle = `hsla(${arch.hue}, 75%, 62%, 0.16)`;
  ctx.fill();
  ctx.strokeStyle = `hsla(${arch.hue}, 75%, 62%, 0.8)`;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = `hsl(${arch.hue}, 85%, 72%)`;
  ctx.fillText(archText, 98, y + 38);
  if (data.rank) {
    ctx.font = `600 30px ${body}`;
    ctx.fillStyle = "rgba(240,245,255,0.6)";
    ctx.fillText(`#${data.rank} on the leaderboard`, 98 + chipW, y + 36);
  }
  y += 140;

  // stat grid (ledger)
  const stats: Array<[string, string]> = [
    ["Empire score", gbpFull(data.result.score.total)],
    ["Monthly NOI", `${gbpFull(data.result.score.noi)}/mo`],
    ["Strategy", data.result.strategyLabel],
    ["Live units / areas", `${data.result.unitsLive} / ${data.result.areasControlled}`],
  ];
  const cellW = (S - 120 - 24) / 2;
  const cellH = 118;
  stats.forEach(([label, value], i) => {
    const cx = 60 + (i % 2) * (cellW + 24);
    const cy = y + Math.floor(i / 2) * (cellH + 20);
    ctx.fillStyle = "rgba(244,240,228,0.05)";
    roundRect(ctx, cx, cy, cellW, cellH, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(244,240,228,0.12)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(240,245,255,0.5)";
    ctx.font = `600 24px ${body}`;
    ctx.fillText(label.toUpperCase(), cx + 28, cy + 38);
    ctx.fillStyle = "#F4F0E4";
    ctx.font = `700 40px ${mono}`;
    ctx.fillText(value, cx + 28, cy + 84);
  });
  y += 2 * cellH + 20 + 56;

  // win / mistake
  ctx.font = `600 28px ${body}`;
  ctx.fillStyle = "#B9F33E";
  ctx.fillText("🏆 Biggest win", 60, y);
  ctx.fillStyle = "rgba(240,245,255,0.85)";
  ctx.font = `500 28px ${body}`;
  const winLines = wrapText(ctx, data.result.biggestWin, S - 420);
  ctx.fillText(winLines[0] ?? "", 290, y);
  y += 52;
  ctx.font = `600 28px ${body}`;
  ctx.fillStyle = "#FF6F61";
  ctx.fillText("💥 Biggest mistake", 60, y);
  ctx.fillStyle = "rgba(240,245,255,0.85)";
  ctx.font = `500 28px ${body}`;
  const misLines = wrapText(ctx, data.result.biggestMistake, S - 420);
  ctx.fillText(misLines[0] ?? "", 332, y);

  // footer
  ctx.fillStyle = "rgba(240,245,255,0.45)";
  ctx.font = `500 26px ${body}`;
  ctx.fillText("Can you build a bigger empire? Play Rental Rush.", 60, S - 56);

  return canvas;
}

export async function downloadShareCard(data: ShareData) {
  const canvas = await drawShareCard(data);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "rental-rush-result.png";
  a.click();
}

export function shareText(data: ShareData): string {
  const arch = ARCHETYPES[data.result.archetype];
  return [
    `I built a ${gbpFull(Math.max(0, data.result.score.total))} rental empire in 10 minutes. ${arch.emoji}`,
    `Archetype: ${arch.name} · Strategy: ${data.result.strategyLabel}`,
    `Biggest win: ${data.result.biggestWin}`,
    `Biggest mistake: ${data.result.biggestMistake}`,
    data.rank ? `Leaderboard rank: #${data.rank}` : "",
    `Play Rental Rush: Operator Mode`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function nativeShare(data: ShareData): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  try {
    const canvas = await drawShareCard(data);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (blob && navigator.canShare?.({ files: [new File([blob], "rental-rush.png", { type: "image/png" })] })) {
      await navigator.share({
        text: shareText(data),
        files: [new File([blob], "rental-rush.png", { type: "image/png" })],
      });
    } else {
      await navigator.share({ text: shareText(data) });
    }
    return true;
  } catch {
    return false;
  }
}
