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
  /** Original headline before Chinese localization (when translated). */
  titleOriginal?: string;
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

export type DimensionScore = {
  score: number;
  note: string;
};

export type RiskItem = {
  title: string;
  severity: Severity;
  detail: string;
};

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
  /** 1–3 related prediction markets considered in the prompt (optional). */
  predictionHints?: PredictionHint[];
};

export type QuoteBundle = {
  quote: Quote;
  bars: Bar[];
  spark: number[];
  tech: TechSnapshot;
};

export const DIMENSION_META: Record<
  DimensionKey,
  { label: string; hint: string }
> = {
  sentiment: { label: "舆情", hint: "新闻与市场情绪" },
  catalyst: { label: "催化", hint: "近期事件与预期差" },
  momentum: { label: "动量", hint: "趋势与超买超卖" },
  valuation: { label: "估值", hint: "贵贱与赔率" },
  liquidity: { label: "流动性", hint: "成交与进出难易" },
  macro: { label: "宏观", hint: "利率、板块、汇率" },
};

export const VERDICT_META: Record<
  Verdict,
  { label: string; brief: string }
> = {
  enter: { label: "可以入场", brief: "赔率与时机同向" },
  probe: { label: "谨慎试探", brief: "小仓位验证" },
  wait: { label: "继续观望", brief: "等待更干净的点" },
  avoid: { label: "不宜入场", brief: "风险大于收益" },
};

export type BookVerdict = "hold" | "add" | "trim" | "rebalance" | "wait";

export const BOOK_VERDICT_META: Record<
  BookVerdict,
  { label: string; brief: string }
> = {
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

/** Crypto Fear & Greed (single 0–100 score; fear = 100 − value). */
export type FearGreedIndex = {
  value: number;
  classification: string;
  classificationZh: string;
  timestamp: number;
  source: string;
  sourceUrl: string;
  market: "crypto";
};

export type FearGreedResult =
  | { ok: true; data: FearGreedIndex }
  | { ok: false; error: string };

/** BTC perpetual 合约指数 (composite from OKX public funding + long/short). */
export type ContractIndex = {
  /** 0–100 composite; higher = more long crowding / overheated longs. */
  value: number;
  classificationZh: string;
  /** Current predicted funding rate as decimal (e.g. 0.0001 = 0.01%). */
  fundingRate: number;
  /** Last settled funding rate as decimal. */
  lastFundingRate: number | null;
  /** Global long/short account ratio (longs/shorts); >1 = more long accounts. */
  longShortRatio: number;
  /** Open interest in USD if available. */
  oiUsd: number | null;
  /** OI USD change over ~24h, as fraction (0.05 = +5%). */
  oiChangePct24h: number | null;
  instrument: string;
  timestamp: number;
  source: string;
  sourceUrl: string;
  /** Human-readable formula for UI footnote. */
  formulaZh: string;
};

export type ContractIndexResult =
  | { ok: true; data: ContractIndex }
  | { ok: false; error: string };


/** Bundle of desk market-index tiles (partial failures allowed per tile). */
export type MarketIndicesBundle = {
  updatedAt: number;
  liquidations: Liquidations24hResult;
  btcDominance: BtcDominanceResult;
  altcoinSeason: AltcoinSeasonResult;
  vix: VixResult;
  fundingBoard: FundingBoardResult;
  basis: BtcBasisResult;
};

export type Liquidations24h = {
  longUsd: number;
  shortUsd: number;
  totalUsd: number;
  topSymbol: string | null;
  topSide: "long" | "short" | null;
  topUsd: number | null;
  /** Approx lookback hours covered by the sample. */
  windowHours: number;
  sampleCount: number;
  timestamp: number;
  source: string;
  sourceUrl: string;
  noteZh: string;
};

export type Liquidations24hResult =
  | { ok: true; data: Liquidations24h }
  | { ok: false; error: string };

export type BtcDominance = {
  dominancePct: number;
  totalMcapUsd: number | null;
  timestamp: number;
  source: string;
  sourceUrl: string;
};

export type BtcDominanceResult =
  | { ok: true; data: BtcDominance }
  | { ok: false; error: string };

export type AltcoinSeason = {
  /** 0–100; higher = more alts beating BTC. */
  value: number;
  classificationZh: string;
  /** "official" = BlockchainCenter scrape; "proxy" = CoinGecko top-alts proxy. */
  mode: "official" | "proxy";
  periodLabelZh: string;
  altsBeating: number | null;
  altsSampled: number | null;
  timestamp: number;
  source: string;
  sourceUrl: string;
  noteZh: string;
};

export type AltcoinSeasonResult =
  | { ok: true; data: AltcoinSeason }
  | { ok: false; error: string };

export type VixQuote = {
  value: number;
  changePct: number | null;
  timestamp: number;
  source: string;
  sourceUrl: string;
};

export type VixResult =
  | { ok: true; data: VixQuote }
  | { ok: false; error: string };

export type FundingBoardRow = {
  symbol: string;
  instId: string;
  fundingRate: number;
  lastFundingRate: number | null;
};

export type FundingBoard = {
  topPositive: FundingBoardRow[];
  topNegative: FundingBoardRow[];
  all: FundingBoardRow[];
  timestamp: number;
  source: string;
  sourceUrl: string;
};

export type FundingBoardResult =
  | { ok: true; data: FundingBoard }
  | { ok: false; error: string };

export type BtcBasis = {
  markPx: number;
  indexPx: number;
  /** (mark - index) / index as fraction. */
  basisPct: number;
  instrument: string;
  timestamp: number;
  source: string;
  sourceUrl: string;
};

export type BtcBasisResult =
  | { ok: true; data: BtcBasis }
  | { ok: false; error: string };

/** Per-symbol market-cap snapshot (stocks priority; crypto when Yahoo provides). */
export type MarketCapAnalysis = {
  symbol: string;
  name: string;
  quoteType: string | null;
  currency: string;
  price: number | null;
  marketCap: number | null;
  /** floatShares × price when both known. */
  floatMarketCap: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  /** Rough bucket from USD-equivalent mcap; null if unknown. */
  sizeClass: "mega" | "large" | "mid" | "small" | "micro" | null;
  sizeClassZh: string | null;
  timestamp: number;
  source: string;
  sourceUrl: string;
  noteZh: string | null;
};

export type MarketCapResult =
  | { ok: true; data: MarketCapAnalysis }
  | { ok: false; error: string };

/** Prediction-market venue (read-only public odds). */
export type PredictionPlatform = "polymarket" | "kalshi" | "manifold";

/** Desk filter bucket for prediction markets. */
export type PredictionCategory = "macro" | "crypto";

export type PredictionMarketItem = {
  id: string;
  platform: PredictionPlatform;
  platformLabel: string;
  title: string;
  titleOriginal?: string;
  category: PredictionCategory;
  /** Implied Yes probability 0–100. */
  yesProb: number;
  volume: number | null;
  liquidity: number | null;
  url: string;
  endDate: string | null;
};

/** Compact hint stored on Analysis for UI (subset of PredictionMarketItem). */
export type PredictionHint = {
  platform: PredictionPlatform;
  platformLabel: string;
  title: string;
  yesProb: number;
  volume: number | null;
  url: string;
  category: PredictionCategory;
};

export type PredictionVenueResult =
  | { ok: true; items: PredictionMarketItem[]; noteZh?: string }
  | { ok: false; error: string };

export type PredictionMarketsBundle = {
  updatedAt: number;
  polymarket: PredictionVenueResult;
  kalshi: PredictionVenueResult;
  manifold: PredictionVenueResult;
  /** Merged, sorted by volume desc (nulls last). */
  items: PredictionMarketItem[];
  disclaimerZh: string;
};
