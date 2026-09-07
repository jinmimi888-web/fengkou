/**
 * Read-only prediction-market odds (Polymarket / Kalshi / Manifold).
 * Public endpoints only — no trading, no API keys required for reads.
 */
import { CATALOG, isCrypto, shortSymbol } from "./catalog";
import type {
  PredictionCategory,
  PredictionHint,
  PredictionMarketItem,
  PredictionMarketsBundle,
  PredictionVenueResult,
} from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type CacheEntry<T> = { exp: number; val: T };
const mem = new Map<string, CacheEntry<unknown>>();

const BUNDLE_TTL = 15 * 60_000;
const TRANSLATE_TTL = 6 * 60 * 60_000;

async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  fresh = false,
): Promise<T> {
  const hit = mem.get(key) as CacheEntry<T> | undefined;
  if (!fresh && hit && hit.exp > Date.now()) return hit.val;
  try {
    const val = await fn();
    mem.set(key, { exp: Date.now() + ttlMs, val });
    return val;
  } catch (err) {
    if (hit) return hit.val;
    throw err;
  }
}

async function fetchText(
  url: string,
  timeoutMs = 10_000,
): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/html, */*",
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function yesProbFromOutcomes(
  outcomes: string[],
  prices: string[],
): number | null {
  const idx = outcomes.findIndex((o) => /^yes$/i.test(o.trim()));
  const pick = idx >= 0 ? prices[idx] : prices[0];
  const p = num(pick);
  if (p == null || p < 0 || p > 1) return null;
  return Math.round(p * 1000) / 10; // one decimal
}

function titleHash(title: string): string {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `pmtr:${(h >>> 0).toString(36)}:${title.length}`;
}

function cjkRatio(title: string): number {
  const chars = [...title].filter((c) => !/\s/.test(c));
  if (!chars.length) return 0;
  let cjk = 0;
  for (const c of chars) {
    const code = c.codePointAt(0)!;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3000 && code <= 0x303f)
    ) {
      cjk += 1;
    }
  }
  return cjk / chars.length;
}

function isMostlyChinese(title: string): boolean {
  return cjkRatio(title) >= 0.3;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function translateViaXai(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || !titles.length) return out;
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是预测市场标题翻译器。把英文标题译成简体中文，保留专有名词/数字/代码。只输出 JSON：{\"translations\":[{\"i\":0,\"t\":\"译文\"}]}，与输入顺序一致。",
          },
          {
            role: "user",
            content: JSON.stringify(titles.map((t, i) => ({ i, t }))),
          },
        ],
      }),
    });
    if (!res.ok) return out;
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      translations?: Array<{ i?: number; t?: string }>;
    };
    for (const row of parsed.translations ?? []) {
      const i = row.i;
      const t = row.t?.trim();
      if (typeof i !== "number" || !t || !titles[i]) continue;
      out.set(titles[i]!, t);
    }
  } catch {
    /* fail soft */
  }
  return out;
}

async function translateViaGoogleM(title: string): Promise<string | null> {
  try {
    const url = `https://translate.google.com/m?sl=en&tl=zh-CN&q=${encodeURIComponent(title)}`;
    const { ok, text } = await fetchText(url, 7000);
    if (!ok) return null;
    const m = text.match(/class="result-container">([^<]+)/);
    const tr = m?.[1] ? decodeXml(m[1]) : "";
    return tr && isMostlyChinese(tr) ? tr : null;
  } catch {
    return null;
  }
}

async function localizeTitles(
  items: PredictionMarketItem[],
): Promise<PredictionMarketItem[]> {
  if (!items.length) return items;
  const need: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (isMostlyChinese(item.title)) continue;
    const key = titleHash(item.title);
    const hit = mem.get(key) as CacheEntry<string> | undefined;
    if (hit && hit.exp > Date.now()) continue;
    if (seen.has(item.title)) continue;
    seen.add(item.title);
    need.push(item.title);
  }

  let translated = new Map<string, string>();
  if (need.length) {
    translated = await translateViaXai(need.slice(0, 24));
    const missing = need.filter((t) => !translated.has(t)).slice(0, 18);
    const CONC = 3;
    for (let i = 0; i < missing.length; i += CONC) {
      const chunk = missing.slice(i, i + CONC);
      const parts = await Promise.all(chunk.map((t) => translateViaGoogleM(t)));
      chunk.forEach((t, idx) => {
        const tr = parts[idx];
        if (tr) translated.set(t, tr);
      });
    }
    for (const [src, dst] of translated) {
      mem.set(titleHash(src), { exp: Date.now() + TRANSLATE_TTL, val: dst });
    }
  }

  return items.map((item) => {
    if (isMostlyChinese(item.title)) return item;
    const key = titleHash(item.title);
    const cachedTr = mem.get(key) as CacheEntry<string> | undefined;
    const tr =
      (cachedTr && cachedTr.exp > Date.now() ? cachedTr.val : undefined) ??
      translated.get(item.title);
    if (!tr || tr === item.title) return item;
    return {
      ...item,
      titleOriginal: item.titleOriginal ?? item.title,
      title: tr,
    };
  });
}

function classifyBlob(blob: string): PredictionCategory | null {
  const t = blob.toLowerCase();
  const cryptoHit =
    /\b(btc|bitcoin|eth|ethereum|crypto|solana|\bsol\b|xrp|defi|token|altcoin|mempool|stablecoin)\b/.test(
      t,
    ) || /比特币|以太坊|加密|数字货币|稳定币/.test(blob);
  const macroHit =
    /\b(fed|fomc|cpi|pce|inflation|recession|unemployment|nasdaq|s&p|spx|spy|equity|stock|treasury|rate cut|rate hike|gdp|payroll|dow\b|interest rate|powell|ecb|boe)\b/.test(
      t,
    ) || /美联储|降息|加息|通胀|衰退|失业|纳指|标普|国债|股市|宏观|利率/.test(blob);
  if (cryptoHit && !macroHit) return "crypto";
  if (macroHit && !cryptoHit) return "macro";
  if (cryptoHit) return "crypto";
  if (macroHit) return "macro";
  return null;
}

function volumeSort(a: PredictionMarketItem, b: PredictionMarketItem): number {
  const av = a.volume ?? -1;
  const bv = b.volume ?? -1;
  return bv - av;
}

function dedupeKeepBest(items: PredictionMarketItem[]): PredictionMarketItem[] {
  const byKey = new Map<string, PredictionMarketItem>();
  for (const it of items) {
    const key = `${it.platform}:${it.titleOriginal ?? it.title}`.toLowerCase();
    const prev = byKey.get(key);
    if (!prev || (it.volume ?? 0) > (prev.volume ?? 0)) byKey.set(key, it);
  }
  return [...byKey.values()];
}

/* ─── Polymarket (Gamma) ─── */

type PolyMarket = {
  id?: string;
  question?: string;
  groupItemTitle?: string;
  slug?: string;
  outcomes?: unknown;
  outcomePrices?: unknown;
  volume?: unknown;
  volume24hr?: unknown;
  liquidity?: unknown;
  liquidityNum?: unknown;
  bestBid?: unknown;
  bestAsk?: unknown;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  endDateIso?: string;
};

type PolyEvent = {
  id?: string;
  title?: string;
  slug?: string;
  volume?: unknown;
  volume24hr?: unknown;
  liquidity?: unknown;
  markets?: PolyMarket[];
  tags?: Array<{ slug?: string; label?: string }>;
};

async function fetchPolyEvents(url: string): Promise<PolyEvent[]> {
  const res = await fetchText(url, 12_000);
  if (!res.ok) throw new Error(`polymarket http ${res.status}`);
  const json = JSON.parse(res.text) as unknown;
  if (Array.isArray(json)) return json as PolyEvent[];
  if (json && typeof json === "object" && Array.isArray((json as { events?: unknown }).events)) {
    return (json as { events: PolyEvent[] }).events;
  }
  return [];
}

function polyItemFromMarket(
  event: PolyEvent,
  market: PolyMarket,
  category: PredictionCategory,
): PredictionMarketItem | null {
  if (market.closed === true || market.active === false) return null;
  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices);
  const yesProb = yesProbFromOutcomes(outcomes, prices);
  if (yesProb == null) return null;

  const group = (market.groupItemTitle || "").trim();
  const q = (market.question || "").trim();
  const et = (event.title || "").trim();
  let title = q || et;
  if (group && et && !q.includes(group) && group.length < 40) {
    title = `${et} — ${group}`;
  } else if (!title && group) {
    title = group;
  }
  if (!title) return null;

  const vol24 = num(market.volume24hr);
  const vol = vol24 ?? num(market.volume) ?? num(event.volume24hr) ?? num(event.volume);
  const liq = num(market.liquidityNum) ?? num(market.liquidity) ?? num(event.liquidity);
  const slug = market.slug || event.slug;
  if (!slug) return null;
  const id = `poly:${market.id || slug}`;

  return {
    id,
    platform: "polymarket",
    platformLabel: "Polymarket",
    title,
    category,
    yesProb,
    volume: vol,
    liquidity: liq,
    url: `https://polymarket.com/event/${event.slug || slug}`,
    endDate: market.endDate || market.endDateIso || null,
  };
}

function flattenPoly(
  events: PolyEvent[],
  category: PredictionCategory,
  limit: number,
): PredictionMarketItem[] {
  const out: PredictionMarketItem[] = [];
  for (const ev of events) {
    const markets = ev.markets ?? [];
    // Prefer competitive / liquid child markets; fall back to event-level single market.
    const scored = markets
      .map((m) => {
        const item = polyItemFromMarket(ev, m, category);
        if (!item) return null;
        const competitive =
          item.yesProb >= 3 && item.yesProb <= 97 ? 1 : 0;
        return { item, competitive, vol: item.volume ?? 0 };
      })
      .filter((x): x is { item: PredictionMarketItem; competitive: number; vol: number } => !!x)
      .sort((a, b) => b.competitive - a.competitive || b.vol - a.vol);

    // Cap per event so ladder markets don't dominate.
    for (const row of scored.slice(0, 3)) out.push(row.item);
  }
  return out.sort(volumeSort).slice(0, limit);
}

async function fetchPolymarket(): Promise<PredictionVenueResult> {
  try {
    const [cryptoEvents, fedSearch, stockSearch, inflationSearch] = await Promise.all([
      fetchPolyEvents(
        "https://gamma-api.polymarket.com/events?limit=12&active=true&closed=false&tag_slug=crypto&order=volume24hr&ascending=false",
      ),
      fetchPolyEvents(
        "https://gamma-api.polymarket.com/public-search?q=fed&limit_per_type=8&search_tags=false&search_profiles=false",
      ),
      fetchPolyEvents(
        "https://gamma-api.polymarket.com/public-search?q=stock%20OR%20nasdaq%20OR%20S%26P&limit_per_type=6&search_tags=false&search_profiles=false",
      ),
      fetchPolyEvents(
        "https://gamma-api.polymarket.com/public-search?q=inflation%20OR%20recession%20OR%20CPI&limit_per_type=6&search_tags=false&search_profiles=false",
      ),
    ]);

    const crypto = flattenPoly(cryptoEvents, "crypto", 14);
    const macro = flattenPoly(
      [...fedSearch, ...stockSearch, ...inflationSearch],
      "macro",
      16,
    );

    // Re-classify any crypto false-positives in macro searches (e.g. "Bitcoin ETF").
    const macroAdj = macro.map((m) => {
      const cat = classifyBlob(`${m.title} ${m.titleOriginal ?? ""}`);
      return cat ? { ...m, category: cat } : m;
    });

    const items = dedupeKeepBest([...crypto, ...macroAdj]).sort(volumeSort).slice(0, 28);
    if (!items.length) {
      return { ok: false, error: "Polymarket 暂无匹配的股市/加密预测盘" };
    }
    return { ok: true, items };
  } catch {
    return { ok: false, error: "Polymarket 暂时无法获取，请稍后重试" };
  }
}

/* ─── Kalshi (trade-api public) ─── */

type KalshiMarket = {
  ticker?: string;
  title?: string;
  subtitle?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  yes_bid?: number;
  yes_ask?: number;
  last_price?: number;
  volume?: number;
  volume_fp?: string;
  open_interest_fp?: string;
  liquidity_dollars?: string;
  status?: string;
  close_time?: string;
  expected_expiration_time?: string;
};

type KalshiEvent = {
  event_ticker?: string;
  title?: string;
  category?: string;
  markets?: KalshiMarket[];
  series_ticker?: string;
};

const KALSHI_MACRO_SERIES = [
  "KXFEDDECISION",
  "KXFED",
  "FED",
  "CPI",
  "KXQRECESS",
  "RATECUTS",
  "KXPCECORE",
] as const;

const KALSHI_CRYPTO_SERIES = [
  "KXBTCPRICE",
  "KXETHY",
  "KXETHMAXY",
  "KXBTCD",
  "KXETHD",
  "KXMSTRSELL",
] as const;

function kalshiYesProb(m: KalshiMarket): number | null {
  const mid = (bid: number | null, ask: number | null, last: number | null) => {
    if (bid != null && ask != null && ask >= bid) return (bid + ask) / 2;
    if (last != null) return last;
    if (bid != null) return bid;
    if (ask != null) return ask;
    return null;
  };
  // Dollar fields are 0–1; legacy cent fields are 0–100.
  const bidD = num(m.yes_bid_dollars);
  const askD = num(m.yes_ask_dollars);
  const lastD = num(m.last_price_dollars);
  let p = mid(bidD, askD, lastD);
  if (p != null && p >= 0 && p <= 1) return Math.round(p * 1000) / 10;

  const bidC = num(m.yes_bid);
  const askC = num(m.yes_ask);
  const lastC = num(m.last_price);
  p = mid(bidC, askC, lastC);
  if (p == null) return null;
  if (p > 1 && p <= 100) return Math.round(p * 10) / 10;
  if (p >= 0 && p <= 1) return Math.round(p * 1000) / 10;
  return null;
}

function kalshiVolume(m: KalshiMarket): number | null {
  const fp = num(m.volume_fp);
  if (fp != null) return fp;
  return num(m.volume);
}

function kalshiItemsFromEvent(
  ev: KalshiEvent,
  category: PredictionCategory,
): PredictionMarketItem[] {
  const out: PredictionMarketItem[] = [];
  const eventTitle = (ev.title || "").trim();
  for (const m of ev.markets ?? []) {
    if (m.status && !/^active$/i.test(m.status) && !/^open$/i.test(m.status)) {
      // Kalshi uses "active" commonly; skip settled/closed.
      if (/closed|determined|finalized|settled/i.test(m.status)) continue;
    }
    const yesProb = kalshiYesProb(m);
    if (yesProb == null) continue;
    const sub = (m.subtitle || "").trim();
    const mt = (m.title || "").trim();
    const title =
      mt && eventTitle && mt !== eventTitle
        ? `${eventTitle} — ${mt}`
        : mt || (sub ? `${eventTitle} — ${sub}` : eventTitle);
    if (!title || !m.ticker) continue;
    const series = (ev.series_ticker || m.ticker.split("-")[0] || "").toLowerCase();
    const eventSlug = (ev.event_ticker || "").toLowerCase();
    const url = eventSlug
      ? `https://kalshi.com/markets/${series}/${eventSlug}`
      : `https://kalshi.com/markets/${m.ticker.toLowerCase()}`;
    out.push({
      id: `kalshi:${m.ticker}`,
      platform: "kalshi",
      platformLabel: "Kalshi",
      title,
      category,
      yesProb,
      volume: kalshiVolume(m),
      liquidity: num(m.liquidity_dollars),
      url,
      endDate: m.close_time || m.expected_expiration_time || null,
    });
  }
  return out;
}

async function fetchKalshiEventsForSeries(
  seriesTicker: string,
): Promise<KalshiEvent[]> {
  const url =
    `https://api.elections.kalshi.com/trade-api/v2/events` +
    `?limit=2&status=open&with_nested_markets=true` +
    `&series_ticker=${encodeURIComponent(seriesTicker)}`;
  const res = await fetchText(url, 10_000);
  if (res.status === 429) throw new Error("kalshi_rate_limited");
  if (!res.ok) throw new Error(`kalshi http ${res.status}`);
  const json = JSON.parse(res.text) as {
    events?: KalshiEvent[];
    error?: { message?: string };
  };
  if (json.error) throw new Error(json.error.message || "kalshi error");
  return (json.events ?? []).map((e) => ({
    ...e,
    series_ticker: seriesTicker,
  }));
}

async function fetchKalshi(): Promise<PredictionVenueResult> {
  try {
    const items: PredictionMarketItem[] = [];
    let rateLimited = false;
    let fetched = 0;

    const jobs: Array<{ ticker: string; category: PredictionCategory }> = [
      ...KALSHI_MACRO_SERIES.map((ticker) => ({
        ticker,
        category: "macro" as const,
      })),
      ...KALSHI_CRYPTO_SERIES.map((ticker) => ({
        ticker,
        category: "crypto" as const,
      })),
    ];

    for (const job of jobs) {
      if (rateLimited) break;
      try {
        const events = await fetchKalshiEventsForSeries(job.ticker);
        fetched += 1;
        for (const ev of events) {
          const cat =
            classifyBlob(`${ev.title} ${ev.category} ${job.ticker}`) ?? job.category;
          items.push(...kalshiItemsFromEvent(ev, cat));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "kalshi_rate_limited") {
          rateLimited = true;
          break;
        }
        // skip series soft-fail
      }
      await sleep(350);
    }

    const cleaned = dedupeKeepBest(items)
      .sort(volumeSort)
      .slice(0, 24);

    if (!cleaned.length) {
      if (rateLimited && fetched === 0) {
        return {
          ok: false,
          error: "Kalshi 接口限流，暂时无法拉取（稍后再试）",
        };
      }
      return { ok: false, error: "Kalshi 暂无匹配的经济/加密盘口" };
    }

    return {
      ok: true,
      items: cleaned,
      noteZh: rateLimited ? "部分 Kalshi 系列因限流未拉全" : undefined,
    };
  } catch {
    return { ok: false, error: "Kalshi 暂时无法获取，请稍后重试" };
  }
}

/* ─── Manifold (optional) ─── */

type ManifoldMarket = {
  id?: string;
  question?: string;
  url?: string;
  slug?: string;
  probability?: number;
  volume?: number;
  volume24Hours?: number;
  totalLiquidity?: number;
  isResolved?: boolean;
  closeTime?: number;
  outcomeType?: string;
};

async function fetchManifoldSearch(term: string): Promise<ManifoldMarket[]> {
  const url =
    `https://api.manifold.markets/v0/search-markets` +
    `?term=${encodeURIComponent(term)}&limit=8&filter=open&contractType=BINARY`;
  const res = await fetchText(url, 10_000);
  if (!res.ok) throw new Error(`manifold http ${res.status}`);
  const json = JSON.parse(res.text) as unknown;
  return Array.isArray(json) ? (json as ManifoldMarket[]) : [];
}

async function fetchManifold(): Promise<PredictionVenueResult> {
  try {
    const [btc, eth, fed, stocks] = await Promise.all([
      fetchManifoldSearch("bitcoin"),
      fetchManifoldSearch("ethereum crypto"),
      fetchManifoldSearch("Federal Reserve"),
      fetchManifoldSearch("S&P 500 OR Nasdaq OR recession"),
    ]);

    const items: PredictionMarketItem[] = [];
    for (const [bucket, rows] of [
      ["crypto", [...btc, ...eth]] as const,
      ["macro", [...fed, ...stocks]] as const,
    ]) {
      for (const m of rows) {
        if (m.isResolved || m.outcomeType !== "BINARY") continue;
        const p = num(m.probability);
        if (p == null || p < 0 || p > 1) continue;
        const q = (m.question || "").trim();
        if (!q || !m.id) continue;
        const cat = classifyBlob(q) ?? bucket;
        items.push({
          id: `manifold:${m.id}`,
          platform: "manifold",
          platformLabel: "Manifold",
          title: q,
          category: cat,
          yesProb: Math.round(p * 1000) / 10,
          volume: num(m.volume24Hours) ?? num(m.volume),
          liquidity: num(m.totalLiquidity),
          url: m.url || `https://manifold.markets/${m.slug || m.id}`,
          endDate: m.closeTime ? new Date(m.closeTime).toISOString() : null,
        });
      }
    }

    const cleaned = dedupeKeepBest(items).sort(volumeSort).slice(0, 16);
    if (!cleaned.length) {
      return { ok: false, error: "Manifold 暂无匹配的预测盘" };
    }
    return { ok: true, items: cleaned };
  } catch {
    return { ok: false, error: "Manifold 暂时无法获取，请稍后重试" };
  }
}

function mergeVenues(
  venues: PredictionVenueResult[],
): PredictionMarketItem[] {
  const all: PredictionMarketItem[] = [];
  for (const v of venues) {
    if (v.ok) all.push(...v.items);
  }
  return dedupeKeepBest(all).sort(volumeSort);
}

export async function getPredictionMarkets(
  fresh = false,
): Promise<PredictionMarketsBundle> {
  const disclaimerZh = "预测市场赔率≠投资建议；数据来自公开盘口，可能延迟或不全。";

  return cached(
    "prediction-markets:v1",
    BUNDLE_TTL,
    async () => {
      // Polymarket + Manifold in parallel; Kalshi sequential (rate limits).
      const [polymarket, manifold] = await Promise.all([
        fetchPolymarket(),
        fetchManifold(),
      ]);
      const kalshi = await fetchKalshi();

      let items = mergeVenues([polymarket, kalshi, manifold]);
      try {
        items = await localizeTitles(items);
      } catch {
        /* keep English titles */
      }

      // Re-attach localized titles into venue payloads for UI consistency.
      const byId = new Map(items.map((i) => [i.id, i]));
      const remap = (v: PredictionVenueResult): PredictionVenueResult => {
        if (!v.ok) return v;
        return {
          ...v,
          items: v.items.map((it) => byId.get(it.id) ?? it),
        };
      };

      return {
        updatedAt: Date.now(),
        polymarket: remap(polymarket),
        kalshi: remap(kalshi),
        manifold: remap(manifold),
        items,
        disclaimerZh,
      };
    },
    fresh,
  );
}

/* ─── Symbol-targeted filtering (for 研判 prompts) ─── */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function marketBlob(m: PredictionMarketItem): string {
  return `${m.title} ${m.titleOriginal ?? ""}`.toLowerCase();
}

/** Match term in blob; short tickers use word-ish boundaries to avoid false hits. */
function blobIncludesTerm(blob: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  if (/[\u4e00-\u9fff]/.test(t)) return blob.includes(t);
  if (/^[a-z0-9.+-]{1,5}$/i.test(t)) {
    const re = new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(t)}(?:$|[^a-z0-9])`,
      "i",
    );
    return re.test(blob);
  }
  return blob.includes(t);
}

const MACRO_EQUITY_RE =
  /\b(fed|fomc|cpi|pce|inflation|recession|unemployment|nasdaq|s&p|spx|spy|rate cut|rate hike|powell|interest rate|gdp|payroll)\b|美联储|降息|加息|通胀|衰退|失业|纳指|标普|利率/;

function symbolSearchTerms(symbol: string): string[] {
  const cat = CATALOG.find((c) => c.symbol === symbol);
  const short = shortSymbol(symbol);
  const terms = new Set<string>();
  terms.add(symbol.toLowerCase());
  terms.add(short.toLowerCase());
  if (cat) {
    terms.add(cat.name.toLowerCase());
    for (const a of cat.aliases) terms.add(a.toLowerCase());
  }
  // Drop ultra-generic 1-char noise
  return [...terms].filter((t) => t.length >= 2);
}

/**
 * Pick prediction markets relevant to a symbol for 研判 context.
 * Crypto: coin-specific (+ nearby crypto if scarce). Equity: ticker/company, else top macro.
 */
export function filterMarketsForSymbol(
  items: PredictionMarketItem[],
  symbol: string,
  limit = 8,
): PredictionMarketItem[] {
  if (!items.length || limit <= 0) return [];
  const crypto = isCrypto(symbol);
  const terms = symbolSearchTerms(symbol);
  const short = shortSymbol(symbol).toLowerCase();

  const scored: Array<{ item: PredictionMarketItem; score: number; macro: boolean }> =
    [];
  for (const item of items) {
    const blob = marketBlob(item);
    let score = 0;
    const macro = MACRO_EQUITY_RE.test(blob);

    for (const term of terms) {
      if (!blobIncludesTerm(blob, term)) continue;
      // Strong hit for company/coin name or ticker
      score += term.length <= 4 ? 55 : 90;
    }

    if (crypto) {
      if (item.category === "crypto") score += 8;
      // BTC/ETH still relevant for alts when specific matches are thin
      if (
        short !== "btc" &&
        (blobIncludesTerm(blob, "btc") ||
          blobIncludesTerm(blob, "bitcoin") ||
          blob.includes("比特币"))
      ) {
        score += 12;
      }
      if (
        short !== "eth" &&
        (blobIncludesTerm(blob, "eth") ||
          blobIncludesTerm(blob, "ethereum") ||
          blob.includes("以太"))
      ) {
        score += 8;
      }
    } else if (macro) {
      // Only Fed/CPI/recession-style macros as equity soft matches — not unrelated tickers
      score += 22;
    }

    if (score > 0) scored.push({ item, score, macro });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score || (b.item.volume ?? -1) - (a.item.volume ?? -1),
  );

  const SPECIFIC = 50;
  const specific = scored.filter((s) => s.score >= SPECIFIC).map((s) => s.item);
  const softMacro = scored
    .filter((s) => s.score < SPECIFIC && (crypto || s.macro))
    .map((s) => s.item);
  const softCrypto = crypto
    ? scored.filter((s) => s.score < SPECIFIC && s.item.category === "crypto").map((s) => s.item)
    : [];

  const out: PredictionMarketItem[] = [];
  const seen = new Set<string>();
  const push = (m: PredictionMarketItem) => {
    if (seen.has(m.id) || out.length >= limit) return;
    seen.add(m.id);
    out.push(m);
  };

  for (const m of specific) push(m);

  // Prefer company/coin-specific; fall back to a few top macro (or crypto neighbors)
  const minFill = Math.min(3, limit);
  const softPool = crypto ? softCrypto : softMacro;
  if (out.length < minFill) {
    for (const m of softPool) {
      push(m);
      if (out.length >= minFill) break;
    }
    // If still short on equity, allow more macros up to limit
    if (!crypto && out.length < limit) {
      for (const m of softMacro) {
        push(m);
        if (out.length >= Math.min(limit, 5)) break;
      }
    }
  } else if (crypto && out.length < limit) {
    for (const m of softCrypto) {
      push(m);
      if (out.length >= Math.min(limit, specific.length + 2)) break;
    }
  } else if (!crypto && specific.length > 0 && out.length < Math.min(limit, specific.length + 2)) {
    // Already have company hits — add at most 2 macro overlays
    let added = 0;
    for (const m of softMacro) {
      push(m);
      added += 1;
      if (added >= 2 || out.length >= limit) break;
    }
  }

  return out.slice(0, limit);
}

/** Top macro markets for book / portfolio 研判. */
export function filterMacroMarkets(
  items: PredictionMarketItem[],
  limit = 5,
): PredictionMarketItem[] {
  return items
    .filter((m) => m.category === "macro")
    .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1))
    .slice(0, limit);
}

function formatVolZh(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `成交量 ${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `成交量 ${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `成交量 ${(abs / 1e3).toFixed(0)}K`;
  return `成交量 ${Math.round(abs)}`;
}

/** Chinese prompt lines for model context (max ~8). */
export function formatPredictionPromptLines(
  items: PredictionMarketItem[],
  max = 8,
): string {
  return items
    .slice(0, max)
    .map((m) => {
      const vol = formatVolZh(m.volume);
      const prob =
        m.yesProb % 1 === 0 ? String(m.yesProb) : m.yesProb.toFixed(1);
      const title = m.title.replace(/\s+/g, " ").trim().slice(0, 72);
      return `- [${m.platformLabel}] ${title} — Yes隐含概率 ${prob}%${vol ? ` — ${vol}` : ""}`;
    })
    .join("\n");
}

export function toPredictionHints(
  items: PredictionMarketItem[],
  max = 3,
): PredictionHint[] {
  return items.slice(0, max).map((m) => ({
    platform: m.platform,
    platformLabel: m.platformLabel,
    title: m.title.slice(0, 120),
    yesProb: m.yesProb,
    volume: m.volume,
    url: m.url,
    category: m.category,
  }));
}
