export type Verdict = "enter" | "probe" | "wait" | "avoid";
export type Horizon = "intraday" | "swing" | "position";
export type Severity = "high" | "mid" | "low";
export type DimensionKey =
  | "sentiment"
  | "catalyst"
  | "momentum"
  | "valuation"
  | "liquidity"
  | "macro";

export type Quote = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  changePct: number;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: string | null;
  previousClose: number | null;
};

export type LiveQuote = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  previousClose: number | null;
  closes: number[];
};

export type Bar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type TechSnapshot = {
  sma20: number | null;
  sma50: number | null;
  sma120: number | null;
  rsi14: number | null;
  vol20: number | null;
  ret5d: number | null;
  ret20d: number | null;
  dist52wHigh: number | null;
  volumeRatio: number | null;
  vsSma20: number | null;
  vsSma50: number | null;
};

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number | null;
  symbol: string;
};

export type SearchHit = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

export type DimensionScore = { score: number; note: string };
export type RiskItem = { title: string; severity: Severity; detail: string };

export type Analysis = {
  symbol: string;
  generatedAt: number;
  verdict: Verdict;
  headline: string;
  summary: string;
  conviction: number;
  horizon: Horizon;
  sizeMinPct: number;
  sizeMaxPct: number;
  invalidation: string;
  entryPlan: string;
  dimensions: Record<DimensionKey, DimensionScore>;
  risks: RiskItem[];
  watch: string[];
  riskScore: number;
};

export type QuoteBundle = {
  quote: Quote;
  bars: Bar[];
  spark: number[];
  tech: TechSnapshot;
};

export const DIMENSION_META: Record<DimensionKey, { label: string; hint: string }> = {
  sentiment: { label: "舆情", hint: "新闻与市场情绪" },
  catalyst: { label: "催化", hint: "近期事件与预期差" },
  momentum: { label: "动量", hint: "趋势与超买超卖" },
  valuation: { label: "估值", hint: "贵贱与赔率" },
  liquidity: { label: "流动性", hint: "成交与进出难易" },
  macro: { label: "宏观", hint: "利率、板块、汇率" },
};

export const VERDICT_META: Record<Verdict, { label: string; brief: string }> = {
  enter: { label: "可以入场", brief: "赔率与时机同向" },
  probe: { label: "谨慎试探", brief: "小仓位验证" },
  wait: { label: "继续观望", brief: "等待更干净的点" },
  avoid: { label: "不宜入场", brief: "风险大于收益" },
};

export type BookVerdict = "hold" | "add" | "trim" | "rebalance" | "wait";

export const BOOK_VERDICT_META: Record<BookVerdict, { label: string; brief: string }> = {
  hold: { label: "继续持有", brief: "组合无需大动" },
  add: { label: "可加仓", brief: "赔率仍在，仓位偏轻" },
  trim: { label: "建议减仓", brief: "风险或仓位过重" },
  rebalance: { label: "需要再平衡", brief: "集中度或结构失衡" },
  wait: { label: "先按兵不动", brief: "等待更干净的点" },
};

export type BookAnalysis = {
  generatedAt: number;
  verdict: BookVerdict;
  headline: string;
  summary: string;
  conviction: number;
  riskScore: number;
  concentration: string;
  action: string;
  suggestions: { symbol: string; move: string; detail: string }[];
  risks: RiskItem[];
  watch: string[];
};
