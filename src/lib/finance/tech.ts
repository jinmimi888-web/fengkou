import type { Bar, TechSnapshot } from "./types";

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  return mean(closes.slice(-n));
}

function rsi(closes: number[], n = 14): number | null {
  if (closes.length < n + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const ag = gains / n;
  const al = losses / n;
  if (al === 0) return 100;
  const rs = ag / al;
  return 100 - 100 / (1 + rs);
}

export function closesOf(bars: Bar[]): number[] {
  return bars.map((b) => b.c).filter((c) => Number.isFinite(c));
}

export function sparkline(closes: number[], points = 28): number[] {
  if (closes.length <= points) return closes;
  const step = (closes.length - 1) / (points - 1);
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    out.push(closes[Math.round(i * step)]!);
  }
  return out;
}

export function computeTech(bars: Bar[], quote?: { fiftyTwoWeekHigh: number | null }): TechSnapshot {
  const closes = closesOf(bars);
  const vols = bars.map((b) => b.v).filter((v) => Number.isFinite(v) && v > 0);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const last = closes.at(-1) ?? null;
  const prev5 = closes.at(-6) ?? null;
  const prev20 = closes.at(-21) ?? null;

  let vol20: number | null = null;
  if (closes.length >= 21) {
    const rets: number[] = [];
    const window = closes.slice(-21);
    for (let i = 1; i < window.length; i++) {
      const a = window[i - 1]!;
      const b = window[i]!;
      if (a > 0) rets.push(Math.log(b / a));
    }
    const m = mean(rets) ?? 0;
    const varr = mean(rets.map((r) => (r - m) ** 2)) ?? 0;
    vol20 = Math.sqrt(varr) * Math.sqrt(252);
  }

  const high52 =
    quote?.fiftyTwoWeekHigh ??
    (closes.length ? Math.max(...closes) : null);

  return {
    sma20,
    sma50,
    sma120: sma(closes, 120),
    rsi14: rsi(closes, 14),
    vol20,
    ret5d: last != null && prev5 ? last / prev5 - 1 : null,
    ret20d: last != null && prev20 ? last / prev20 - 1 : null,
    dist52wHigh: last != null && high52 ? last / high52 - 1 : null,
    volumeRatio:
      vols.length >= 21 && vols.at(-1)
        ? vols.at(-1)! / (mean(vols.slice(-21, -1)) ?? vols.at(-1)!)
        : null,
    vsSma20: last != null && sma20 ? last / sma20 - 1 : null,
    vsSma50: last != null && sma50 ? last / sma50 - 1 : null,
  };
}

export function formatPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

export function formatPrice(n: number | null | undefined, currency?: string): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs === 0 ? 2 : abs < 0.0001 ? 8 : abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
  const body = abs.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = n < 0 ? "-" : "";
  if (currency === "USD") return `${sign}$${body}`;
  if (currency === "HKD") return `${sign}HK$${body}`;
  if (currency === "CNY" || currency === "CNH") return `${sign}¥${body}`;
  if (currency) return `${sign}${body} ${currency}`;
  return `${sign}${body}`;
}

export function formatVolume(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e6 ? 2 : 0)} 万`;
  return n.toFixed(0);
}

export function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}
