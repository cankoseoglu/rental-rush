// £ formatting helpers — compact, ledger-friendly.

export function gbp(n: number, opts: { sign?: boolean } = {}): string {
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  const abs = Math.abs(Math.round(n));
  let body: string;
  if (abs >= 1_000_000) {
    body = `£${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  } else if (abs >= 100_000) {
    body = `£${Math.round(abs / 1000)}k`;
  } else if (abs >= 10_000) {
    body = `£${(abs / 1000).toFixed(1)}k`;
  } else {
    body = `£${abs.toLocaleString("en-GB")}`;
  }
  return sign + body;
}

export function gbpFull(n: number, opts: { sign?: boolean } = {}): string {
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;
}

export const pct = (n: number): string => `${Math.round(n * 100)}%`;

export const stars = (n: number): string => n.toFixed(1);

export function expectationLabel(n: number): string {
  if (n >= 75) return "Very demanding";
  if (n >= 60) return "Demanding";
  if (n >= 45) return "Reasonable";
  return "Relaxed";
}

export function riskLabel(n: number): string {
  if (n >= 70) return "High";
  if (n >= 45) return "Medium";
  return "Low";
}
