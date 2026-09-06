import { computeTech, sparkline } from "./tech";
import type { LiveQuote, QuoteBundle } from "./types";

export type TradeSide = "buy" | "sell";

export type Trade = {
  id: string;
  symbol: string;
  side: TradeSide;
  qty: number;
  price: number;
  fee: number;
  at: number;
  note: string;
};

export type OpenPosition = {
  symbol: string;
  qty: number;
  avgCost: number;
  cost: number;
  realized: number;
};

export type MarkedPosition = OpenPosition & {
  price: number;
  currency: string;
  value: number;
  pnl: number;
  pnlPct: number;
  dayPnl: number;
  weight: number;
};

export type CurrencyBucket = {
  currency: string;
  value: number;
  cost: number;
  pnl: number;
  dayPnl: number;
  realized: number;
};

export type BookMark = {
  rows: MarkedPosition[];
  groups: CurrencyBucket[];
  usd: CurrencyBucket | null;
};

export const MAX_TRADES = 200;

export function newTradeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function guessCurrency(symbol: string): string {
  if (symbol.endsWith(".HK")) return "HKD";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CNY";
  return "USD";
}

export function reducePositions(trades: Trade[]): Map<string, OpenPosition> {
  const sorted = [...trades].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const acc = new Map<string, { qty: number; cost: number; realized: number }>();
  for (const t of sorted) {
    if (!(t.qty > 0) || !(t.price >= 0)) continue;
    const fee = t.fee > 0 ? t.fee : 0;
    const cur = acc.get(t.symbol) ?? { qty: 0, cost: 0, realized: 0 };
    if (t.side === "buy") {
      cur.qty += t.qty;
      cur.cost += t.qty * t.price + fee;
    } else {
      if (cur.qty <= 0) continue;
      const qty = Math.min(t.qty, cur.qty);
      const avg = cur.cost / cur.qty;
      cur.realized += qty * t.price - fee - avg * qty;
      cur.qty -= qty;
      cur.cost -= avg * qty;
      if (cur.qty < 1e-8) {
        cur.qty = 0;
        cur.cost = 0;
      }
    }
    acc.set(t.symbol, cur);
  }
  const out = new Map<string, OpenPosition>();
  for (const [symbol, cur] of acc) {
    if (cur.qty <= 1e-8 && Math.abs(cur.realized) < 1e-8) continue;
    out.set(symbol, {
      symbol,
      qty: cur.qty,
      avgCost: cur.qty > 0 ? cur.cost / cur.qty : 0,
      cost: cur.cost,
      realized: cur.realized,
    });
  }
  return out;
}

function toUsd(
  amount: number,
  currency: string,
  fx: { cny: number | null; hkd: number | null },
): number | null {
  if (!Number.isFinite(amount)) return null;
  if (!currency || currency === "USD") return amount;
  if (currency === "CNY" || currency === "CNH") {
    return fx.cny && fx.cny > 0 ? amount / fx.cny : null;
  }
  if (currency === "HKD") {
    return fx.hkd && fx.hkd > 0 ? amount / fx.hkd : null;
  }
  return null;
}

export function readFx(bySymbol: Map<string, QuoteBundle>): {
  cny: number | null;
  hkd: number | null;
} {
  const cny = bySymbol.get("USDCNY=X")?.quote.price ?? null;
  const hkd = bySymbol.get("USDHKD=X")?.quote.price ?? null;
  return {
    cny: cny && cny > 0 ? cny : null,
    hkd: hkd && hkd > 0 ? hkd : null,
  };
}

export function neededFxSymbols(symbols: string[]): string[] {
  const out: string[] = [];
  if (symbols.some((s) => s.endsWith(".SS") || s.endsWith(".SZ"))) out.push("USDCNY=X");
  if (symbols.some((s) => s.endsWith(".HK"))) out.push("USDHKD=X");
  return out;
}

export function positionPnl(
  pos: OpenPosition,
  price: number,
  previousClose: number | null,
  changePct: number,
) {
  const value = pos.qty > 0 && price > 0 ? price * pos.qty : 0;
  const pnl = pos.qty > 0 && price > 0 ? value - pos.cost : 0;
  const pnlPct = pos.qty > 0 && pos.cost > 0 && price > 0 ? value / pos.cost - 1 : 0;
  let dayPnl = 0;
  if (pos.qty > 0 && price > 0) {
    if (previousClose && previousClose > 0) dayPnl = pos.qty * (price - previousClose);
    else if (changePct !== -1) dayPnl = (pos.qty * price * changePct) / (1 + changePct);
  }
  return { value, pnl, pnlPct, dayPnl };
}

export function symbolFlow(trades: Trade[], symbol: string) {
  let buySpend = 0;
  let sellProceeds = 0;
  let buyCount = 0;
  let sellCount = 0;
  for (const t of trades) {
    if (t.symbol !== symbol) continue;
    if (!(t.qty > 0) || !(t.price >= 0)) continue;
    const fee = t.fee > 0 ? t.fee : 0;
    const notional = t.qty * t.price;
    if (t.side === "buy") {
      buyCount += 1;
      buySpend += notional + fee;
    } else {
      sellCount += 1;
      sellProceeds += notional - fee;
    }
  }
  return { buySpend, sellProceeds, buyCount, sellCount };
}

export function summarizeSymbols(
  trades: Trade[],
  book: BookMark,
  bySymbol: Map<string, QuoteBundle>,
): SymbolPnl[] {
  const marked = new Map(book.rows.map((r) => [r.symbol, r]));
  const positions = reducePositions(trades);
  const symbols = new Set<string>();
  for (const t of trades) symbols.add(t.symbol);
  for (const s of positions.keys()) symbols.add(s);
  const rows: SymbolPnl[] = [];
  for (const symbol of symbols) {
    const pos = positions.get(symbol);
    const m = marked.get(symbol);
    const currency =
      m?.currency || bySymbol.get(symbol)?.quote.currency || guessCurrency(symbol);
    const flow = symbolFlow(trades, symbol);
    const qty = pos?.qty ?? 0;
    const open = qty > 1e-8;
    const realized = pos?.realized ?? 0;
    const unrealized = m?.pnl ?? 0;
    const total = unrealized + realized;
    const invested = flow.buySpend > 0 ? flow.buySpend : (pos?.cost ?? 0);
    const netInvested = flow.buySpend - flow.sellProceeds;
    if (!open && Math.abs(realized) < 1e-8 && flow.buyCount === 0 && flow.sellCount === 0) {
      continue;
    }
    rows.push({
      symbol,
      open,
      qty,
      avgCost: pos?.avgCost ?? 0,
      price: m?.price ?? 0,
      currency,
      value: m?.value ?? 0,
      cost: pos?.cost ?? 0,
      buySpend: flow.buySpend,
      sellProceeds: flow.sellProceeds,
      netInvested,
      unrealized,
      realized,
      total,
      totalPct: invested > 0 ? total / invested : 0,
      netInvestedPct: netInvested > 0 ? total / netInvested : 0,
      dayPnl: m?.dayPnl ?? 0,
      buyCount: flow.buyCount,
      sellCount: flow.sellCount,
      share: 0,
    });
  }
  rows.sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || b.total - a.total);
  const absSum = rows.reduce((s, r) => s + Math.abs(r.total), 0);
  if (absSum > 0) {
    for (const r of rows) r.share = Math.abs(r.total) / absSum;
  }
  return rows;
}

export function markBook(
  positions: Map<string, OpenPosition>,
  bySymbol: Map<string, QuoteBundle>,
): BookMark {
  const fx = readFx(bySymbol);
  const rows: MarkedPosition[] = [];
  const groupMap = new Map<string, CurrencyBucket>();
  const usdAcc: CurrencyBucket = {
    currency: "USD",
    value: 0,
    cost: 0,
    pnl: 0,
    dayPnl: 0,
    realized: 0,
  };
  let usdOk = true;

  for (const pos of positions.values()) {
    const q = bySymbol.get(pos.symbol)?.quote;
    const price = q && q.price > 0 ? q.price : 0;
    const currency = q?.currency || guessCurrency(pos.symbol);
    const marked = positionPnl(pos, price, q?.previousClose ?? null, q?.changePct ?? 0);
    const { value, pnl, pnlPct, dayPnl } = marked;

    const g = groupMap.get(currency) ?? {
      currency,
      value: 0,
      cost: 0,
      pnl: 0,
      dayPnl: 0,
      realized: 0,
    };
    g.value += value;
    g.cost += pos.cost;
    g.pnl += pnl;
    g.dayPnl += dayPnl;
    g.realized += pos.realized;
    groupMap.set(currency, g);

    const vUsd = toUsd(value, currency, fx);
    const cUsd = toUsd(pos.cost, currency, fx);
    const rUsd = toUsd(pos.realized, currency, fx);
    const dUsd = toUsd(dayPnl, currency, fx);
    if (vUsd == null || cUsd == null || rUsd == null || dUsd == null) usdOk = false;
    else {
      usdAcc.value += vUsd;
      usdAcc.cost += cUsd;
      usdAcc.realized += rUsd;
      usdAcc.dayPnl += dUsd;
    }

    if (pos.qty <= 1e-8) continue;
    rows.push({
      ...pos,
      price,
      currency,
      value,
      pnl,
      pnlPct,
      dayPnl,
      weight: 0,
    });
  }

  usdAcc.pnl = usdAcc.value - usdAcc.cost;
  const weightBase = usdOk && usdAcc.value > 0 ? usdAcc.value : null;
  if (weightBase) {
    for (const row of rows) {
      const vUsd = toUsd(row.value, row.currency, fx);
      row.weight = vUsd != null ? vUsd / weightBase : 0;
    }
  } else if (rows.length && rows.every((r) => r.currency === rows[0]!.currency)) {
    const total = rows.reduce((s, r) => s + r.value, 0);
    if (total > 0) {
      for (const row of rows) row.weight = row.value / total;
    }
  }

  rows.sort((a, b) => b.weight - a.weight || b.value - a.value);
  return {
    rows,
    groups: [...groupMap.values()].sort((a, b) => b.value - a.value),
    usd: usdOk && (rows.length > 0 || usdAcc.realized !== 0) ? usdAcc : null,
  };
}

export type MarketSlice = {
  key: "US" | "HK" | "CN";
  label: string;
  value: number;
  pnl: number;
  weight: number;
};

export type PnlContribution = {
  symbol: string;
  open: boolean;
  unrealized: number;
  realized: number;
  total: number;
  share: number;
};

export type SymbolPnl = {
  symbol: string;
  open: boolean;
  qty: number;
  avgCost: number;
  price: number;
  currency: string;
  value: number;
  cost: number;
  buySpend: number;
  sellProceeds: number;
  netInvested: number;
  unrealized: number;
  realized: number;
  total: number;
  totalPct: number;
  netInvestedPct: number;
  dayPnl: number;
  buyCount: number;
  sellCount: number;
  share: number;
};

export type BookReport = {
  currency: string;
  value: number;
  cost: number;
  buySpend: number;
  sellProceeds: number;
  netInvested: number;
  unrealized: number;
  realized: number;
  totalPnl: number;
  totalPnlPct: number;
  netInvestedPct: number;
  unrealizedPct: number;
  dayPnl: number;
  dayPnlPct: number;
  openCount: number;
  closedCount: number;
  winCount: number;
  loseCount: number;
  flatCount: number;
  winRate: number;
  maxWeight: number;
  top3Weight: number;
  buyCount: number;
  sellCount: number;
  best: MarkedPosition | null;
  worst: MarkedPosition | null;
  markets: MarketSlice[];
  contributions: PnlContribution[];
};

export function marketOf(symbol: string): MarketSlice["key"] {
  if (symbol.endsWith(".HK")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CN";
  return "US";
}

const MARKET_LABEL: Record<MarketSlice["key"], string> = {
  US: "美股",
  HK: "港股",
  CN: "A股",
};

function convert(
  amount: number,
  currency: string,
  base: string,
  fx: { cny: number | null; hkd: number | null },
): number {
  if (base === "USD") return toUsd(amount, currency, fx) ?? amount;
  return amount;
}

export function summarizeBook(
  trades: Trade[],
  book: BookMark,
  bySymbol: Map<string, QuoteBundle>,
): BookReport | null {
  const fx = readFx(bySymbol);
  const base = book.usd
    ? book.usd
    : book.groups.length === 1
      ? book.groups[0]!
      : null;
  if (!base) return null;

  let buySpend = 0;
  let sellProceeds = 0;
  let buyCount = 0;
  let sellCount = 0;
  let flowOk = true;
  for (const t of trades) {
    const ccy = bySymbol.get(t.symbol)?.quote.currency || guessCurrency(t.symbol);
    const notional = t.qty * t.price;
    const gross = t.side === "buy" ? notional + (t.fee || 0) : notional - (t.fee || 0);
    const usd = toUsd(gross, ccy, fx);
    if (t.side === "buy") buyCount += 1;
    else sellCount += 1;
    if (usd == null) {
      if (base.currency === "USD" && ccy !== "USD") {
        flowOk = false;
        break;
      }
      if (t.side === "buy") buySpend += gross;
      else sellProceeds += gross;
    } else if (base.currency === "USD") {
      if (t.side === "buy") buySpend += usd;
      else sellProceeds += usd;
    } else {
      if (t.side === "buy") buySpend += gross;
      else sellProceeds += gross;
    }
  }
  if (!flowOk) {
    buySpend = base.cost + Math.max(0, -base.realized);
    sellProceeds = 0;
  }

  const unrealized = base.pnl;
  const realized = base.realized;
  const totalPnl = unrealized + realized;
  const invested = buySpend > 0 ? buySpend : base.cost;
  const netInvested = buySpend - sellProceeds;
  const open = book.rows.filter((r) => r.qty > 0);
  const winCount = open.filter((r) => r.pnl > 1e-8).length;
  const loseCount = open.filter((r) => r.pnl < -1e-8).length;
  const flatCount = open.length - winCount - loseCount;
  const sortedByPnl = [...open].sort((a, b) => b.pnl - a.pnl);
  const weights = [...open].sort((a, b) => b.weight - a.weight);
  const top3Weight = weights.slice(0, 3).reduce((s, r) => s + r.weight, 0);

  const marketMap = new Map<MarketSlice["key"], { value: number; pnl: number }>();
  for (const row of open) {
    const key = marketOf(row.symbol);
    const cur = marketMap.get(key) ?? { value: 0, pnl: 0 };
    cur.value += convert(row.value, row.currency, base.currency, fx);
    cur.pnl += convert(row.pnl, row.currency, base.currency, fx);
    marketMap.set(key, cur);
  }
  const markets: MarketSlice[] = (["US", "HK", "CN"] as const)
    .map((key) => {
      const cur = marketMap.get(key) ?? { value: 0, pnl: 0 };
      return {
        key,
        label: MARKET_LABEL[key],
        value: cur.value,
        pnl: cur.pnl,
        weight: base.value > 0 ? cur.value / base.value : 0,
      };
    })
    .filter((m) => m.value > 0 || m.pnl !== 0);

  const lots = new Map<string, PnlContribution>();
  for (const row of book.rows) {
    const u = convert(row.pnl, row.currency, base.currency, fx);
    const r = convert(row.realized, row.currency, base.currency, fx);
    lots.set(row.symbol, {
      symbol: row.symbol,
      open: true,
      unrealized: u,
      realized: r,
      total: u + r,
      share: 0,
    });
  }
  const positions = reducePositions(trades);
  for (const pos of positions.values()) {
    if (lots.has(pos.symbol)) continue;
    if (Math.abs(pos.realized) < 1e-8) continue;
    const ccy = bySymbol.get(pos.symbol)?.quote.currency || guessCurrency(pos.symbol);
    const r = convert(pos.realized, ccy, base.currency, fx);
    lots.set(pos.symbol, {
      symbol: pos.symbol,
      open: false,
      unrealized: 0,
      realized: r,
      total: r,
      share: 0,
    });
  }
  const contributions = [...lots.values()].sort(
    (a, b) => Math.abs(b.total) - Math.abs(a.total) || b.total - a.total,
  );
  const absSum = contributions.reduce((s, c) => s + Math.abs(c.total), 0);
  if (absSum > 0) {
    for (const c of contributions) c.share = Math.abs(c.total) / absSum;
  }

  return {
    currency: base.currency,
    value: base.value,
    cost: base.cost,
    buySpend,
    sellProceeds,
    netInvested,
    unrealized,
    realized,
    totalPnl,
    totalPnlPct: invested > 0 ? totalPnl / invested : 0,
    netInvestedPct: netInvested > 0 ? totalPnl / netInvested : 0,
    unrealizedPct: base.cost > 0 ? unrealized / base.cost : 0,
    dayPnl: base.dayPnl,
    dayPnlPct: base.value > 0 ? base.dayPnl / base.value : 0,
    openCount: open.length,
    closedCount: contributions.filter((c) => !c.open).length,
    winCount,
    loseCount,
    flatCount,
    winRate: open.length > 0 ? winCount / open.length : 0,
    maxWeight: weights[0]?.weight ?? 0,
    top3Weight,
    buyCount,
    sellCount,
    best: sortedByPnl[0] ?? null,
    worst:
      sortedByPnl.length > 1
        ? (sortedByPnl.at(-1) ?? null)
        : (sortedByPnl[0] ?? null),
    markets,
    contributions,
  };
}


export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const digits = Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-8 ? 0 : 4;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function todayInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDateInput(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return Date.now();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 15, 0, 0).getTime();
}

export function formatTradeDay(ts: number): string {
  return new Date(ts).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function overlayLive(
  bundles: QuoteBundle[] | undefined,
  live: LiveQuote[] | undefined,
): Map<string, QuoteBundle> {
  const map = new Map<string, QuoteBundle>();
  for (const b of bundles ?? []) map.set(b.quote.symbol, b);
  for (const l of live ?? []) {
    const cur = map.get(l.symbol);
    if (cur) {
      map.set(l.symbol, {
        ...cur,
        quote: {
          ...cur.quote,
          price: l.price > 0 ? l.price : cur.quote.price,
          changePct: l.price > 0 ? l.changePct : cur.quote.changePct,
          previousClose: l.previousClose ?? cur.quote.previousClose,
        },
        spark: l.closes.length > 2 ? sparkline(l.closes, 28) : cur.spark,
      });
    } else if (l.price > 0) {
      map.set(l.symbol, {
        quote: {
          symbol: l.symbol,
          name: l.name,
          exchange: "",
          currency: guessCurrency(l.symbol),
          price: l.price,
          changePct: l.changePct,
          dayHigh: null,
          dayLow: null,
          volume: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          marketState: null,
          previousClose: l.previousClose,
        },
        bars: [],
        spark: sparkline(l.closes, 28),
        tech: computeTech([]),
      });
    }
  }
  return map;
}
