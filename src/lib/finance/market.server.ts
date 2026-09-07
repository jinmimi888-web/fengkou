import { CATALOG, isCrypto, searchCatalog } from "./catalog";
import { computeTech, sparkline } from "./tech";
import type {
  AltcoinSeason,
  AltcoinSeasonResult,
  Bar,
  BtcBasis,
  BtcBasisResult,
  BtcDominance,
  BtcDominanceResult,
  ContractIndex,
  ContractIndexResult,
  FearGreedResult,
  FundingBoard,
  FundingBoardResult,
  FundingBoardRow,
  Liquidations24h,
  Liquidations24hResult,
  LiveQuote,
  MarketCapAnalysis,
  MarketCapResult,
  MarketIndicesBundle,
  NewsItem,
  Quote,
  QuoteBundle,
  SearchHit,
  VixQuote,
  VixResult,
} from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type CacheEntry<T> = { exp: number; val: T };
const mem = new Map<string, CacheEntry<unknown>>();

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const NEWS_CONCURRENCY = 3;
let newsActive = 0;
const newsWait: Array<() => void> = [];
async function newsJob<T>(fn: () => Promise<T>): Promise<T> {
  if (newsActive >= NEWS_CONCURRENCY) {
    await new Promise<void>((r) => newsWait.push(r));
  }
  newsActive += 1;
  try {
    return await fn();
  } finally {
    newsActive -= 1;
    newsWait.shift()?.();
  }
}

async function fetchText(
  url: string,
  timeoutMs = 9000,
): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json, application/rss+xml, text/xml, */*",
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahoo(pathAndQuery: string): Promise<string> {
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  let lastErr = "yahoo failed";
  for (let attempt = 0; attempt < 5; attempt++) {
    const host = hosts[attempt % hosts.length];
    const { ok, status, text } = await fetchText(`${host}${pathAndQuery}`);
    if (status === 429 || status === 503) {
      lastErr = `yahoo ${status}`;
      await sleep(1200 * (attempt + 1));
      continue;
    }
    if (!ok) {
      lastErr = `yahoo ${status}`;
      continue;
    }
    return text;
  }
  throw new Error(lastErr);
}

type ChartResult = {
  meta: Record<string, unknown>;
  timestamp?: number[];
  indicators?: {
    quote?: Array<Partial<Record<"open" | "high" | "low" | "close" | "volume", (number | null)[]>>>;
  };
};

function parseChart(json: string, symbol: string): { quote: Quote; bars: Bar[] } {
  const body = JSON.parse(json) as {
    chart?: { result?: ChartResult[]; error?: { description?: string } | null };
  };
  const result = body.chart?.result?.[0];
  if (!result) {
    throw new Error(body.chart?.error?.description || `无法读取 ${symbol}`);
  }
  const m = result.meta;
  const price = num(m.regularMarketPrice);
  const changePct = num(m.regularMarketChangePercent);
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null || !Number.isFinite(c)) continue;
    bars.push({
      t: (ts[i] ?? 0) * 1000,
      o: num(q.open?.[i]) ?? c,
      h: num(q.high?.[i]) ?? c,
      l: num(q.low?.[i]) ?? c,
      c,
      v: num(q.volume?.[i]) ?? 0,
    });
  }
  const lastClose = bars.at(-1)?.c;
  const px = price ?? lastClose ?? 0;
  const prev = bars.length >= 2 ? bars[bars.length - 2]!.c : null;
  const derivedPct = prev && prev > 0 ? px / prev - 1 : 0;
  return {
    quote: {
      symbol: String(m.symbol ?? symbol),
      name: String(m.longName || m.shortName || symbol),
      exchange: String(m.fullExchangeName || m.exchangeName || ""),
      currency: String(m.currency || "USD"),
      price: px,
      changePct: changePct != null ? changePct / 100 : derivedPct,
      dayHigh: num(m.regularMarketDayHigh),
      dayLow: num(m.regularMarketDayLow),
      volume: num(m.regularMarketVolume),
      fiftyTwoWeekHigh: num(m.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: num(m.fiftyTwoWeekLow),
      marketState: typeof m.currentTradingPeriod === "object" ? "regular" : null,
      previousClose:
        num(m.chartPreviousClose) ??
        num(m.previousClose) ??
        num(m.regularMarketPreviousClose),
    },
    bars,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function getChart(symbol: string, range = "6mo"): Promise<{ quote: Quote; bars: Bar[] }> {
  const encoded = encodeURIComponent(symbol);
  return cached(`chart:${symbol}:${range}`, 3 * 60_000, () =>
    enqueue(async () => {
      const text = await fetchYahoo(
        `/v8/finance/chart/${encoded}?interval=1d&range=${range}&includePrePost=false`,
      );
      return parseChart(text, symbol);
    }),
  );
}

function toBundle(symbol: string, quote: Quote, bars: Bar[]): QuoteBundle {
  return {
    quote: {
      ...quote,
      symbol,
      name: quote.name || CATALOG.find((c) => c.symbol === symbol)?.name || symbol,
    },
    bars,
    spark: sparkline(
      bars.map((b) => b.c),
      28,
    ),
    tech: computeTech(bars, quote),
  };
}

export async function getBundle(symbol: string): Promise<QuoteBundle> {
  const { quote, bars } = await getChart(symbol, "6mo");
  return toBundle(symbol, quote, bars);
}

export async function getQuotes(symbols: string[]): Promise<QuoteBundle[]> {
  const uniq = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))].slice(0, 32);
  const out: QuoteBundle[] = [];
  for (const sym of uniq) {
    try {
      const { quote, bars } = await getChart(sym, "6mo");
      out.push(toBundle(sym, quote, bars));
    } catch {
      out.push({
        quote: {
          symbol: sym,
          name: CATALOG.find((c) => c.symbol === sym)?.name ?? sym,
          exchange: "",
          currency: "",
          price: 0,
          changePct: 0,
          dayHigh: null,
          dayLow: null,
          volume: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          marketState: "error",
          previousClose: null,
        },
        bars: [],
        spark: [],
        tech: computeTech([]),
      });
    }
  }
  return out;
}

type SparkRow = {
  symbol?: string;
  close?: (number | null)[];
  previousClose?: number;
  fulldayChangePercent?: number;
  fulldayPrice?: number;
};

function lastNum(xs: (number | null)[] | undefined): number | null {
  if (!xs?.length) return null;
  for (let i = xs.length - 1; i >= 0; i--) {
    const v = xs[i];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function parseSpark(json: string, requested: string[]): LiveQuote[] {
  const body = JSON.parse(json) as Record<string, unknown>;
  const rows = new Map<string, SparkRow>();
  const spark = body.spark as { result?: Array<{ symbol?: string; response?: SparkRow[] }> } | undefined;
  if (Array.isArray(spark?.result)) {
    for (const item of spark.result) {
      const row = item.response?.[0] ?? item;
      const sym = String(item.symbol || (row as SparkRow).symbol || "");
      if (sym) rows.set(sym, row as SparkRow);
    }
  } else {
    for (const [k, v] of Object.entries(body)) {
      if (v && typeof v === "object") rows.set(k, v as SparkRow);
    }
  }
  return requested.map((symbol) => {
    const row =
      rows.get(symbol) ??
      [...rows.entries()].find(([k]) => k.toUpperCase() === symbol.toUpperCase())?.[1];
    const closes = (row?.close ?? []).filter((c): c is number => typeof c === "number" && Number.isFinite(c));
    const price = lastNum(row?.close) ?? num(row?.fulldayPrice) ?? 0;
    const prev = num(row?.previousClose);
    const chgPct = num(row?.fulldayChangePercent);
    const derived = prev && prev > 0 && price > 0 ? price / prev - 1 : 0;
    return {
      symbol,
      name: CATALOG.find((c) => c.symbol === symbol)?.name || symbol,
      price,
      changePct: chgPct != null ? chgPct / 100 : derived,
      previousClose: prev,
      closes,
    };
  });
}

export async function getLiveQuotes(symbols: string[]): Promise<LiveQuote[]> {
  const uniq = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))].slice(0, 32);
  if (!uniq.length) return [];
  const key = `live:${uniq.join(",")}`;
  return cached(key, 12_000, async () => {
    const q = uniq.map(encodeURIComponent).join(",");
    let lastErr = "spark failed";
    for (let attempt = 0; attempt < 4; attempt++) {
      const host = attempt % 2 === 0 ? "https://query2.finance.yahoo.com" : "https://query1.finance.yahoo.com";
      const { ok, status, text } = await fetchText(
        `${host}/v8/finance/spark?symbols=${q}&range=1d&interval=5m`,
      );
      if (status === 429 || status === 503) {
        lastErr = `spark ${status}`;
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (!ok) {
        lastErr = `spark ${status}`;
        continue;
      }
      return parseSpark(text, uniq);
    }
    throw new Error(lastErr);
  });
}

export async function searchSymbols(q: string): Promise<SearchHit[]> {
  const query = q.trim();
  if (!query) return CATALOG.slice(0, 8).map(toHit);
  const local = searchCatalog(query, 8).map(toHit);
  try {
    const remote = await cached(`search:${query.toLowerCase()}`, 10 * 60_000, () =>
      enqueue(async () => {
        const text = await fetchYahoo(
          `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true`,
        );
        const body = JSON.parse(text) as {
          quotes?: Array<{
            symbol?: string;
            shortname?: string;
            longname?: string;
            exchDisp?: string;
            exchange?: string;
            quoteType?: string;
            typeDisp?: string;
          }>;
        };
        return (body.quotes ?? [])
          .filter(
            (x) =>
              x.symbol &&
              (x.quoteType === "EQUITY" ||
                x.quoteType === "ETF" ||
                x.quoteType === "INDEX" ||
                x.quoteType === "CRYPTOCURRENCY"),
          )
          .map((x) => ({
            symbol: x.symbol!,
            name: x.longname || x.shortname || x.symbol!,
            exchange: x.exchDisp || x.exchange || "",
            type: x.typeDisp || x.quoteType || "",
          }));
      }),
    );
    const seen = new Set(local.map((x) => x.symbol));
    const merged = [...local];
    for (const hit of remote) {
      if (seen.has(hit.symbol)) continue;
      seen.add(hit.symbol);
      merged.push(hit);
    }
    return merged.slice(0, 10);
  } catch {
    return local;
  }
}

function toHit(c: (typeof CATALOG)[number]): SearchHit {
  return {
    symbol: c.symbol,
    name: c.name,
    exchange: c.exchange,
    type: c.kind === "crypto" ? "Crypto" : "Equity",
  };
}

function decodeXml(s: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, ent: string) => {
      if (ent[0] === "#") {
        const hex = ent[1] === "x" || ent[1] === "X";
        const code = hex ? parseInt(ent.slice(2), 16) : Number(ent.slice(1));
        return Number.isFinite(code) ? String.fromCharCode(code) : full;
      }
      return named[ent.toLowerCase()] ?? full;
    })
    .trim();
}

function parseRss(xml: string, symbol: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.matchAll(/<item\b[\s\S]*?<\/item>/gi);
  for (const block of blocks) {
    const raw = block[0];
    const title = decodeXml((raw.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "");
    const link = decodeXml((raw.match(/<link>([\s\S]*?)<\/link>/i) ?? [])[1] ?? "");
    const sourceTag = decodeXml((raw.match(/<source[^>]*>([\s\S]*?)<\/source>/i) ?? [])[1] ?? "");
    const pub = decodeXml((raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) ?? [])[1] ?? "");
    if (!title) continue;
    let source = sourceTag;
    let headline = title;
    const dash = title.lastIndexOf(" - ");
    if (!source && dash > 8) {
      source = title.slice(dash + 3).trim();
      headline = title.slice(0, dash).trim();
    }
    const publishedAt = pub ? Date.parse(pub) || null : null;
    items.push({
      id: `${symbol}:${link || headline}`,
      title: headline,
      url: link,
      source: source || "新闻",
      publishedAt: publishedAt && Number.isFinite(publishedAt) ? publishedAt : null,
      symbol,
    });
  }
  return items;
}

function newsQuery(symbol: string, name: string): string {
  const cat = CATALOG.find((c) => c.symbol === symbol);
  const code = isCrypto(symbol)
    ? symbol.replace(/-USD$/i, "")
    : symbol.replace(/\.(HK|SS|SZ|TO)$/i, "");
  const extras = (cat?.aliases ?? []).filter((a) => a.length >= 2).slice(0, 2);
  const parts = isCrypto(symbol)
    ? [`"${name}"`, `"${code}"`, ...extras.map((a) => `"${a}"`)]
    : [`"${name}"`, `"${symbol}"`, `"${code}"`, ...extras.map((a) => `"${a}"`)];
  return [...new Set(parts)].slice(0, 4).join(" OR ");
}

function googleNewsUrls(symbol: string, query: string): string[] {
  const q = encodeURIComponent(query);
  // Prefer zh-CN / CN|HK feeds — US:zh-Hans still returns English headlines for US tickers.
  if (isCrypto(symbol)) {
    const code = symbol.replace(/-USD$/i, "");
    return [
      `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
      `https://news.google.com/rss/search?q=${encodeURIComponent(`${code} 加密货币 OR crypto`)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
    ];
  }
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) {
    return [`https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`];
  }
  if (symbol.endsWith(".HK")) {
    return [
      `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=HK&ceid=HK:zh-Hans`,
      `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
    ];
  }
  return [
    `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
    `https://news.google.com/rss/search?q=${encodeURIComponent(`${symbol} 股票`)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
  ];
}

async function rssFeed(url: string, symbol: string): Promise<NewsItem[]> {
  return newsJob(async () => {
    const { ok, text } = await fetchText(url, 8000);
    if (!ok || !text.includes("<item")) return [];
    return parseRss(text, symbol);
  });
}

function parseYahooSearchNews(json: string, symbol: string): NewsItem[] {
  const body = JSON.parse(json) as {
    news?: Array<{
      uuid?: string;
      title?: string;
      publisher?: string;
      link?: string;
      providerPublishTime?: number;
    }>;
  };
  return (body.news ?? [])
    .filter((n) => n.title)
    .map((n) => {
      const t = n.providerPublishTime;
      const publishedAt = t
        ? t > 1e12
          ? t
          : t * 1000
        : null;
      return {
        id: `${symbol}:${n.uuid || n.link || n.title}`,
        title: n.title!,
        url: n.link || "",
        source: n.publisher || "Yahoo",
        publishedAt: publishedAt && Number.isFinite(publishedAt) ? publishedAt : null,
        symbol,
      };
    });
}

async function yahooSearchNews(symbol: string): Promise<NewsItem[]> {
  return newsJob(async () => {
    // lang=zh-Hant-HK yields Chinese headlines; plain search defaults to English.
    const { ok, text } = await fetchText(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=8&lang=zh-Hant-HK&region=HK`,
      8000,
    );
    if (!ok) return [];
    try {
      return parseYahooSearchNews(text, symbol);
    } catch {
      return [];
    }
  });
}

function mergeNews(groups: NewsItem[][]): NewsItem[] {
  const merged: NewsItem[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const item of group) {
      const key = item.title.replace(/\s+/g, "").slice(0, 48);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  merged.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  return merged;
}

function focusNews(symbol: string, label: string, items: NewsItem[]): NewsItem[] {
  const cat = CATALOG.find((c) => c.symbol === symbol);
  const raw = [symbol, symbol.split(".")[0] ?? "", label, ...(cat?.aliases ?? [])];
  const tokens = raw
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((w) => {
      if (w.length <= 1) return false;
      if (["inc", "ltd", "co", "corp", "the", "stock", "group", "limited", "holdings", "corporation", "company"].includes(w)) {
        return false;
      }
      if (/[\u4e00-\u9fff]/.test(w)) return w.length >= 2;
      const ticker = symbol.toLowerCase();
      const code = (symbol.split(".")[0] ?? "").toLowerCase();
      if (w === ticker || w === code) {
        if (/^[a-z]+$/.test(w) && w.length <= 4) return false;
        return w.length >= 2;
      }
      return w.length >= 5;
    });
  const focused = items.filter((item) => {
    const t = item.title.toLowerCase();
    return tokens.some((tok) => {
      if (/[\u4e00-\u9fff]/.test(tok)) return t.includes(tok);
      return new RegExp(
        `(?:^|[^a-z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`,
        "i",
      ).test(item.title);
    });
  });
  return focused.length ? focused : items;
}

const NEWS_TTL = 3 * 60_000;
const TRANSLATE_TTL = 6 * 60 * 60_000;

function titleHash(title: string): string {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `tr:${(h >>> 0).toString(36)}:${title.length}`;
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

/** Skip translation when the headline is already mostly Chinese (incl. Traditional). */
function isMostlyChinese(title: string): boolean {
  return cjkRatio(title) >= 0.3;
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
              "你是财经新闻标题翻译器。把英文标题译成简体中文，保留公司名/股票代码/数字。只输出 JSON：{\"translations\":[{\"i\":0,\"t\":\"译文\"}]}，数组与输入顺序一致，条数相同。",
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
    const url =
      `https://translate.google.com/m?sl=en&tl=zh-CN&q=${encodeURIComponent(title)}`;
    const { ok, text } = await fetchText(url, 7000);
    if (!ok) return null;
    const m = text.match(/class="result-container">([^<]+)/);
    const tr = m?.[1] ? decodeXml(m[1]) : "";
    return tr && isMostlyChinese(tr) ? tr : null;
  } catch {
    return null;
  }
}

async function localizeNewsTitles(items: NewsItem[]): Promise<NewsItem[]> {
  if (!items.length) return items;
  const need: string[] = [];
  const seenNeed = new Set<string>();
  for (const item of items) {
    if (isMostlyChinese(item.title)) continue;
    const key = titleHash(item.title);
    const hit = mem.get(key) as CacheEntry<string> | undefined;
    if (hit && hit.exp > Date.now()) continue;
    if (seenNeed.has(item.title)) continue;
    seenNeed.add(item.title);
    need.push(item.title);
  }

  let translated = new Map<string, string>();
  if (need.length) {
    translated = await translateViaXai(need);
    const missing = need.filter((t) => !translated.has(t));
    // Free fallback for leftovers (or when XAI_API_KEY absent).
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

export async function getNews(
  symbol: string,
  name?: string,
  fresh = false,
): Promise<NewsItem[]> {
  return cached(
    `news:${symbol}`,
    NEWS_TTL,
    async () => {
      const label = name || CATALOG.find((c) => c.symbol === symbol)?.name || symbol;
      const q = newsQuery(symbol, label);
      const yahooSym = encodeURIComponent(symbol);
      const urls = [
        ...googleNewsUrls(symbol, q),
        // HK/zh-HK returns Chinese headlines; US/en kept as coverage fallback (then localized).
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSym}&region=HK&lang=zh-HK`,
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSym}&region=US&lang=en-US`,
      ];
      const feeds = await Promise.allSettled([
        ...urls.map((url) => rssFeed(url, symbol)),
        yahooSearchNews(symbol).then((items) => focusNews(symbol, label, items)),
      ]);
      const groups = feeds
        .filter((f): f is PromiseFulfilledResult<NewsItem[]> => f.status === "fulfilled")
        .map((f) => f.value);
      const merged = focusNews(symbol, label, mergeNews(groups)).slice(0, 18);
      return localizeNewsTitles(merged);
    },
    fresh,
  );
}

export async function getWatchlistNews(
  symbols: string[],
  fresh = false,
): Promise<NewsItem[]> {
  const uniq = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))].slice(0, 16);
  const chunks = await Promise.all(
    uniq.map(async (sym) => {
      try {
        return (await getNews(sym, undefined, fresh)).slice(0, 6);
      } catch {
        return [];
      }
    }),
  );
  return mergeNews(chunks).slice(0, 40);
}

const FNG_TTL = 30 * 60_000;

const FNG_CLASS_ZH: Record<string, string> = {
  "Extreme Fear": "极度恐慌",
  Fear: "恐慌",
  Neutral: "中性",
  Greed: "贪婪",
  "Extreme Greed": "极度贪婪",
};

function classifyZh(raw: string): string {
  return FNG_CLASS_ZH[raw] ?? raw;
}

/** Public Alternative.me Crypto Fear & Greed Index (no API key). */
export async function getFearGreed(fresh = false): Promise<FearGreedResult> {
  try {
    const data = await cached(
      "fng:crypto",
      FNG_TTL,
      async () => {
        const res = await fetchText("https://api.alternative.me/fng/?limit=1", 9000);
        if (!res.ok) throw new Error(`fng http ${res.status}`);
        const json = JSON.parse(res.text) as {
          data?: Array<{
            value?: string;
            value_classification?: string;
            timestamp?: string;
          }>;
          metadata?: { error?: string | null };
        };
        if (json.metadata?.error) throw new Error(String(json.metadata.error));
        const row = json.data?.[0];
        const value = Number(row?.value);
        if (!row || !Number.isFinite(value) || value < 0 || value > 100) {
          throw new Error("invalid fng payload");
        }
        const tsSec = Number(row.timestamp);
        const classification = row.value_classification?.trim() || "Neutral";
        return {
          value: Math.round(value),
          classification,
          classificationZh: classifyZh(classification),
          timestamp: Number.isFinite(tsSec) ? tsSec * 1000 : Date.now(),
          source: "Alternative.me",
          sourceUrl: "https://alternative.me/crypto/fear-and-greed-index/",
          market: "crypto" as const,
        };
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "情绪指数暂时无法获取，请稍后重试" };
  }
}


const CONTRACT_TTL = 20 * 60_000;
const OKX_BTC_SWAP = "BTC-USDT-SWAP";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Map perpetual funding rate (decimal) to 0–100. ±0.1% → poles; 0 → 50. */
function fundingToScore(rate: number): number {
  const x = clamp(rate, -0.001, 0.001);
  return Math.round(((x + 0.001) / 0.002) * 100);
}

/** Map long/short account ratio to 0–100 via log2 (0.25→0, 1→50, 4→100). */
function longShortToScore(ratio: number): number {
  const x = Math.log2(clamp(ratio, 0.25, 4));
  return Math.round(clamp(((x + 2) / 4) * 100, 0, 100));
}

function classifyContractZh(value: number): string {
  if (value <= 20) return "空头极度拥挤";
  if (value <= 40) return "偏空";
  if (value <= 60) return "中性";
  if (value <= 80) return "偏多";
  return "多头过热";
}

async function fetchOkxJson<T>(pathAndQuery: string): Promise<T> {
  const res = await fetchText(`https://www.okx.com${pathAndQuery}`, 9000);
  if (!res.ok) throw new Error(`okx http ${res.status}`);
  const json = JSON.parse(res.text) as { code?: string; msg?: string; data?: T };
  if (json.code !== "0" || json.data == null) {
    throw new Error(json.msg || "okx payload error");
  }
  return json.data;
}

/**
 * BTCUSDT-perp style 合约指数 from OKX public market data (no API key).
 * Composite: 65% funding-rate score + 35% long/short-account-ratio score.
 */
export async function getContractIndex(fresh = false): Promise<ContractIndexResult> {
  try {
    const data = await cached(
      "contract-index:btc",
      CONTRACT_TTL,
      async () => {
        const [fundingRows, lsRows, oiSettled, oiHistSettled] = await Promise.all([
          fetchOkxJson<
            Array<{
              fundingRate?: string;
              settFundingRate?: string;
              fundingTime?: string;
              ts?: string;
            }>
          >(`/api/v5/public/funding-rate?instId=${OKX_BTC_SWAP}`),
          fetchOkxJson<Array<[string, string]>>(
            `/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=1H`,
          ),
          fetchOkxJson<Array<{ oiUsd?: string; ts?: string }>>(
            `/api/v5/public/open-interest?instType=SWAP&instId=${OKX_BTC_SWAP}`,
          ).then(
            (v) => ({ ok: true as const, v }),
            () => ({ ok: false as const, v: null }),
          ),
          fetchOkxJson<Array<[string, string, string]>>(
            `/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=1H`,
          ).then(
            (v) => ({ ok: true as const, v }),
            () => ({ ok: false as const, v: null }),
          ),
        ]);

        const fr = fundingRows[0];
        const fundingRate = Number(fr?.fundingRate);
        if (!Number.isFinite(fundingRate)) throw new Error("invalid funding rate");
        const lastFundingRaw = Number(fr?.settFundingRate);
        const lastFundingRate = Number.isFinite(lastFundingRaw) ? lastFundingRaw : null;

        const lsPair = lsRows[0];
        const longShortRatio = Number(lsPair?.[1]);
        if (!Number.isFinite(longShortRatio) || longShortRatio <= 0) {
          throw new Error("invalid long/short ratio");
        }

        const oiRows = oiSettled.ok ? oiSettled.v : [];
        const oiUsdRaw = Number(oiRows[0]?.oiUsd);
        const oiUsd = Number.isFinite(oiUsdRaw) ? oiUsdRaw : null;

        let oiChangePct24h: number | null = null;
        const oiHist = oiHistSettled.ok ? oiHistSettled.v : [];
        if (oiHist.length >= 2) {
          const latest = Number(oiHist[0]?.[1]);
          const older = Number(oiHist[Math.min(23, oiHist.length - 1)]?.[1]);
          if (Number.isFinite(latest) && Number.isFinite(older) && older > 0) {
            oiChangePct24h = latest / older - 1;
          }
        }

        const fundingScore = fundingToScore(fundingRate);
        const lsScore = longShortToScore(longShortRatio);
        const value = Math.round(0.65 * fundingScore + 0.35 * lsScore);

        const tsCand = Number(fr?.ts ?? fr?.fundingTime ?? lsPair?.[0]);
        const timestamp = Number.isFinite(tsCand) ? tsCand : Date.now();

        const out: ContractIndex = {
          value: clamp(value, 0, 100),
          classificationZh: classifyContractZh(value),
          fundingRate,
          lastFundingRate,
          longShortRatio,
          oiUsd,
          oiChangePct24h,
          instrument: OKX_BTC_SWAP,
          timestamp,
          source: "OKX",
          sourceUrl: "https://www.okx.com/zh-hans/trade-swap/btc-usdt-swap",
          formulaZh:
            "合约指数 = 0.65×资金费率分 + 0.35×多空比分（均映射到 0–100）。资金费率：±0.1% 对应两端、0 为 50；多空账户比：0.25→0、1→50、4→100（log2）。基于 BTC-USDT 永续，越高表示多头越拥挤。",
        };
        return out;
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "合约指数暂时无法获取，请稍后重试" };
  }
}

/* ─── Market indices + per-symbol market cap ─────────────────────────────── */

const INDICES_TTL = 20 * 60_000;
const MCAP_TTL = 20 * 60_000;

type YahooSession = { crumb: string; cookie: string; exp: number };
let yahooSession: YahooSession | null = null;

function pickSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function mergeCookieJar(existing: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf("=");
    if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const raw of setCookies) {
    const first = raw.split(";")[0] ?? "";
    const i = first.indexOf("=");
    if (i > 0) jar.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function ensureYahooSession(fresh = false): Promise<YahooSession> {
  if (!fresh && yahooSession && yahooSession.exp > Date.now()) return yahooSession;
  let cookie = "";
  try {
    const warm = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "manual",
    });
    cookie = mergeCookieJar(cookie, pickSetCookies(warm));
  } catch {
    /* continue; crumb endpoint may still set cookies */
  }
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: {
      "User-Agent": UA,
      Accept: "text/plain,*/*",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  cookie = mergeCookieJar(cookie, pickSetCookies(crumbRes));
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.length > 80 || crumb.includes("<")) {
    throw new Error("yahoo crumb unavailable");
  }
  yahooSession = { crumb, cookie, exp: Date.now() + 45 * 60_000 };
  return yahooSession;
}

async function fetchYahooQuoteJson(symbols: string[]): Promise<
  Array<Record<string, unknown>>
> {
  const uniq = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))].slice(0, 24);
  if (!uniq.length) return [];
  const run = async (fresh: boolean) => {
    const sess = await ensureYahooSession(fresh);
    const q = uniq.map(encodeURIComponent).join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${q}&crumb=${encodeURIComponent(sess.crumb)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Cookie: sess.cookie,
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`yahoo quote ${res.status}`);
    const body = JSON.parse(text) as {
      quoteResponse?: { result?: Array<Record<string, unknown>>; error?: unknown };
      finance?: { error?: { description?: string } };
    };
    if (body.finance?.error) throw new Error(body.finance.error.description || "yahoo quote error");
    return body.quoteResponse?.result ?? [];
  };
  try {
    return await run(false);
  } catch {
    yahooSession = null;
    return await run(true);
  }
}

async function fetchYahooFloatShares(symbol: string): Promise<number | null> {
  try {
    const sess = await ensureYahooSession(false);
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics&crumb=${encodeURIComponent(sess.crumb)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Cookie: sess.cookie,
      },
    });
    if (!res.ok) return null;
    const body = JSON.parse(await res.text()) as {
      quoteSummary?: {
        result?: Array<{
          defaultKeyStatistics?: { floatShares?: { raw?: number } };
        }>;
      };
    };
    const raw = body.quoteSummary?.result?.[0]?.defaultKeyStatistics?.floatShares?.raw;
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

const LIQ_ULYS = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "DOGE-USDT",
  "XRP-USDT",
  "BNB-USDT",
] as const;

async function fetchOkxCtVal(instId: string): Promise<number> {
  const rows = await fetchOkxJson<Array<{ ctVal?: string }>>(
    `/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(instId)}`,
  );
  const ct = Number(rows[0]?.ctVal);
  if (!Number.isFinite(ct) || ct <= 0) throw new Error(`ctVal ${instId}`);
  return ct;
}

export async function getLiquidations24h(fresh = false): Promise<Liquidations24hResult> {
  try {
    const data = await cached(
      "idx:liq24h",
      INDICES_TTL,
      async () => {
        let longUsd = 0;
        let shortUsd = 0;
        let sampleCount = 0;
        let oldest = Number.POSITIVE_INFINITY;
        let newest = 0;
        let topSymbol: string | null = null;
        let topSide: "long" | "short" | null = null;
        let topUsd: number | null = null;

        for (const uly of LIQ_ULYS) {
          const instId = `${uly}-SWAP`;
          let ctVal: number;
          try {
            ctVal = await fetchOkxCtVal(instId);
          } catch {
            continue;
          }
          let details: Array<{
            bkPx?: string;
            sz?: string;
            posSide?: string;
            ts?: string;
          }> = [];
          try {
            const rows = await fetchOkxJson<
              Array<{ details?: typeof details }>
            >(
              `/api/v5/public/liquidation-orders?instType=SWAP&uly=${encodeURIComponent(uly)}&state=filled&limit=100`,
            );
            details = rows[0]?.details ?? [];
          } catch {
            continue;
          }
          for (const row of details) {
            const px = Number(row.bkPx);
            const sz = Number(row.sz);
            if (!Number.isFinite(px) || !Number.isFinite(sz) || px <= 0 || sz <= 0) continue;
            const usd = px * sz * ctVal;
            const side = row.posSide === "long" || row.posSide === "short" ? row.posSide : null;
            if (side === "long") longUsd += usd;
            else if (side === "short") shortUsd += usd;
            else continue;
            sampleCount += 1;
            const ts = Number(row.ts);
            if (Number.isFinite(ts)) {
              oldest = Math.min(oldest, ts);
              newest = Math.max(newest, ts);
            }
            if (topUsd == null || usd > topUsd) {
              topUsd = usd;
              topSymbol = uly.replace("-USDT", "");
              topSide = side;
            }
          }
        }

        if (sampleCount === 0) throw new Error("no liquidation samples");
        const windowHours =
          Number.isFinite(oldest) && newest > oldest
            ? (newest - oldest) / 3_600_000
            : 0;

        const out: Liquidations24h = {
          longUsd,
          shortUsd,
          totalUsd: longUsd + shortUsd,
          topSymbol,
          topSide,
          topUsd,
          windowHours: Math.round(windowHours * 10) / 10,
          sampleCount,
          timestamp: newest || Date.now(),
          source: "OKX",
          sourceUrl: "https://www.okx.com/zh-hans/trade-swap/btc-usdt-swap",
          noteZh:
            "合计 OKX 永续各大币种最近成交爆仓记录（每币种最多 100 条），约覆盖近 24 小时窗口；非全市场全量，勿当作精确 24h 全网爆仓。",
        };
        return out;
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "24h 爆仓暂时无法获取" };
  }
}

export async function getBtcDominance(fresh = false): Promise<BtcDominanceResult> {
  try {
    const data = await cached(
      "idx:btc-dom",
      INDICES_TTL,
      async () => {
        const res = await fetchText("https://api.coingecko.com/api/v3/global", 10000);
        if (!res.ok) throw new Error(`coingecko ${res.status}`);
        const json = JSON.parse(res.text) as {
          data?: {
            market_cap_percentage?: { btc?: number };
            total_market_cap?: { usd?: number };
            updated_at?: number;
          };
        };
        const pct = Number(json.data?.market_cap_percentage?.btc);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new Error("invalid dominance");
        const mcap = Number(json.data?.total_market_cap?.usd);
        const tsSec = Number(json.data?.updated_at);
        const out: BtcDominance = {
          dominancePct: Math.round(pct * 100) / 100,
          totalMcapUsd: Number.isFinite(mcap) ? mcap : null,
          timestamp: Number.isFinite(tsSec) ? tsSec * 1000 : Date.now(),
          source: "CoinGecko",
          sourceUrl: "https://www.coingecko.com/en/global-charts",
        };
        return out;
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "BTC 市值占比暂时无法获取" };
  }
}

function classifyAltSeasonZh(value: number): string {
  if (value >= 75) return "山寨季";
  if (value <= 25) return "比特币季";
  return "过渡期";
}

async function scrapeBlockchainCenterAltSeason(): Promise<AltcoinSeason> {
  const res = await fetchText("https://www.blockchaincenter.net/altcoin-season-index/", 12000);
  if (!res.ok) throw new Error(`bcc ${res.status}`);
  const html = res.text;
  const btn = html.match(/Altcoin Season\s*\(<!-- -->(\d{1,3})<!-- -->\)/);
  const calc = html.match(/left:calc\((\d{1,3})%\)/);
  // Prefer 90-day series last point from embedded RSC payload when present.
  let fromSeries: number | null = null;
  const series90 = html.match(/\\"90\\":\{((?:\\"\d{4}-\d{2}-\d{2}\\":\\"\d+\\",?){10,})/);
  if (series90?.[1]) {
    const pairs = [...series90[1].matchAll(/\\"(\d{4}-\d{2}-\d{2})\\":\\"(\d+)\\"/g)];
    const last = pairs.at(-1);
    if (last) {
      const v = Number(last[2]);
      if (Number.isFinite(v) && v >= 0 && v <= 100) fromSeries = v;
    }
  }
  const raw = fromSeries ?? (btn ? Number(btn[1]) : calc ? Number(calc[1]) : NaN);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) throw new Error("bcc parse failed");
  const value = Math.round(raw);
  return {
    value,
    classificationZh: classifyAltSeasonZh(value),
    mode: "official",
    periodLabelZh: "近 90 日（BlockchainCenter）",
    altsBeating: null,
    altsSampled: null,
    timestamp: Date.now(),
    source: "BlockchainCenter",
    sourceUrl: "https://www.blockchaincenter.net/altcoin-season-index/",
    noteZh:
      "官方定义：Top 50 中排除稳定币与资产锚定代币后，近 90 日涨幅超过 BTC 的比例；≥75 视为山寨季。",
  };
}

const STABLE_OR_WRAPPED = new Set([
  "bitcoin",
  "tether",
  "usd-coin",
  "usds",
  "ethena-usde",
  "first-digital-usd",
  "binance-bridged-usdt-bnb-smart-chain",
  "wrapped-bitcoin",
  "wrapped-steth",
  "staked-ether",
  "wbeth",
  "dai",
  "true-usd",
  "paypal-usd",
]);

async function proxyAltSeasonFromCoinGecko(): Promise<AltcoinSeason> {
  const res = await fetchText(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1&sparkline=false&price_change_percentage=30d",
    12000,
  );
  if (!res.ok) throw new Error(`cg markets ${res.status}`);
  const rows = JSON.parse(res.text) as Array<{
    id?: string;
    symbol?: string;
    price_change_percentage_30d_in_currency?: number | null;
  }>;
  const btc = rows.find((r) => r.id === "bitcoin");
  const btc30 = Number(btc?.price_change_percentage_30d_in_currency);
  if (!Number.isFinite(btc30)) throw new Error("btc 30d missing");
  const alts = rows.filter((r) => r.id && !STABLE_OR_WRAPPED.has(r.id));
  let sampled = 0;
  let beating = 0;
  for (const a of alts.slice(0, 50)) {
    const p = Number(a.price_change_percentage_30d_in_currency);
    if (!Number.isFinite(p)) continue;
    sampled += 1;
    if (p > btc30) beating += 1;
    if (sampled >= 50) break;
  }
  if (sampled < 10) throw new Error("alt sample too small");
  const value = Math.round((beating / sampled) * 100);
  return {
    value,
    classificationZh: classifyAltSeasonZh(value),
    mode: "proxy",
    periodLabelZh: "近 30 日代理（CoinGecko Top）",
    altsBeating: beating,
    altsSampled: sampled,
    timestamp: Date.now(),
    source: "CoinGecko（代理）",
    sourceUrl: "https://www.coingecko.com/",
    noteZh:
      "非 BlockchainCenter 官方指数。代理算法：市值前列山寨（已排除稳定币/包装资产）中，近 30 日涨幅超过 BTC 的占比 ×100。",
  };
}

export async function getAltcoinSeason(fresh = false): Promise<AltcoinSeasonResult> {
  try {
    const data = await cached(
      "idx:altseason",
      INDICES_TTL,
      async () => {
        try {
          return await scrapeBlockchainCenterAltSeason();
        } catch {
          return await proxyAltSeasonFromCoinGecko();
        }
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "山寨季指数暂时无法获取" };
  }
}

export async function getVix(fresh = false): Promise<VixResult> {
  try {
    const data = await cached(
      "idx:vix",
      INDICES_TTL,
      async () => {
        const text = await fetchYahoo(
          "/v8/finance/chart/%5EVIX?interval=1d&range=5d&includePrePost=false",
        );
        const body = JSON.parse(text) as {
          chart?: { result?: ChartResult[]; error?: { description?: string } | null };
        };
        const result = body.chart?.result?.[0];
        if (!result) throw new Error(body.chart?.error?.description || "vix missing");
        const m = result.meta;
        const value = num(m.regularMarketPrice) ?? num(m.fulldayPrice);
        if (value == null) throw new Error("vix price missing");
        const changePctRaw = num(m.regularMarketChangePercent) ?? num(m.fulldayChangePercent);
        const out: VixQuote = {
          value: Math.round(value * 100) / 100,
          changePct: changePctRaw != null ? changePctRaw / 100 : null,
          timestamp: Date.now(),
          source: "Yahoo Finance",
          sourceUrl: "https://finance.yahoo.com/quote/%5EVIX",
        };
        return out;
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "VIX 暂时无法获取" };
  }
}

const FUNDING_BASKET = [
  { symbol: "BTC", instId: "BTC-USDT-SWAP" },
  { symbol: "ETH", instId: "ETH-USDT-SWAP" },
  { symbol: "SOL", instId: "SOL-USDT-SWAP" },
  { symbol: "DOGE", instId: "DOGE-USDT-SWAP" },
  { symbol: "XRP", instId: "XRP-USDT-SWAP" },
  { symbol: "BNB", instId: "BNB-USDT-SWAP" },
  { symbol: "ADA", instId: "ADA-USDT-SWAP" },
  { symbol: "AVAX", instId: "AVAX-USDT-SWAP" },
] as const;

export async function getFundingBoard(fresh = false): Promise<FundingBoardResult> {
  try {
    const data = await cached(
      "idx:funding-board",
      INDICES_TTL,
      async () => {
        const rows: FundingBoardRow[] = [];
        await Promise.all(
          FUNDING_BASKET.map(async (item) => {
            try {
              const fr = await fetchOkxJson<
                Array<{ fundingRate?: string; settFundingRate?: string }>
              >(`/api/v5/public/funding-rate?instId=${item.instId}`);
              const rate = Number(fr[0]?.fundingRate);
              if (!Number.isFinite(rate)) return;
              const last = Number(fr[0]?.settFundingRate);
              rows.push({
                symbol: item.symbol,
                instId: item.instId,
                fundingRate: rate,
                lastFundingRate: Number.isFinite(last) ? last : null,
              });
            } catch {
              /* skip one */
            }
          }),
        );
        if (rows.length < 3) throw new Error("funding board sparse");
        const sorted = [...rows].sort((a, b) => b.fundingRate - a.fundingRate);
        const out: FundingBoard = {
          topPositive: sorted.filter((r) => r.fundingRate > 0).slice(0, 3),
          topNegative: [...sorted].reverse().filter((r) => r.fundingRate < 0).slice(0, 3),
          all: sorted,
          timestamp: Date.now(),
          source: "OKX",
          sourceUrl: "https://www.okx.com/zh-hans/trade-swap/btc-usdt-swap",
        };
        return out;
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "资金费率榜暂时无法获取" };
  }
}

export async function getBtcBasis(fresh = false): Promise<BtcBasisResult> {
  try {
    const data = await cached(
      "idx:btc-basis",
      INDICES_TTL,
      async () => {
        const [markRows, indexRows] = await Promise.all([
          fetchOkxJson<Array<{ markPx?: string; ts?: string }>>(
            `/api/v5/public/mark-price?instId=${OKX_BTC_SWAP}`,
          ),
          fetchOkxJson<Array<{ idxPx?: string; ts?: string }>>(
            `/api/v5/market/index-tickers?instId=BTC-USDT`,
          ),
        ]);
        const markPx = Number(markRows[0]?.markPx);
        const indexPx = Number(indexRows[0]?.idxPx);
        if (!Number.isFinite(markPx) || !Number.isFinite(indexPx) || indexPx <= 0) {
          throw new Error("invalid mark/index");
        }
        const basisPct = markPx / indexPx - 1;
        const tsCand = Number(markRows[0]?.ts ?? indexRows[0]?.ts);
        const out: BtcBasis = {
          markPx,
          indexPx,
          basisPct,
          instrument: OKX_BTC_SWAP,
          timestamp: Number.isFinite(tsCand) ? tsCand : Date.now(),
          source: "OKX",
          sourceUrl: "https://www.okx.com/zh-hans/trade-swap/btc-usdt-swap",
        };
        return out;
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "基差暂时无法获取" };
  }
}

export async function getMarketIndices(fresh = false): Promise<MarketIndicesBundle> {
  const [
    liquidations,
    btcDominance,
    altcoinSeason,
    vix,
    fundingBoard,
    basis,
  ] = await Promise.all([
    getLiquidations24h(fresh),
    getBtcDominance(fresh),
    getAltcoinSeason(fresh),
    getVix(fresh),
    getFundingBoard(fresh),
    getBtcBasis(fresh),
  ]);
  return {
    updatedAt: Date.now(),
    liquidations,
    btcDominance,
    altcoinSeason,
    vix,
    fundingBoard,
    basis,
  };
}

function fxToUsdApprox(currency: string): number | null {
  const c = currency.toUpperCase();
  if (c === "USD" || c === "USDT" || c === "USDC") return 1;
  if (c === "HKD") return 1 / 7.8;
  if (c === "CNY" || c === "CNH") return 1 / 7.2;
  if (c === "JPY") return 1 / 150;
  if (c === "EUR") return 1.08;
  if (c === "GBP") return 1.27;
  return null;
}

function classifySizeUsd(mcapUsd: number): {
  sizeClass: MarketCapAnalysis["sizeClass"];
  sizeClassZh: string;
} {
  if (mcapUsd >= 200e9) return { sizeClass: "mega", sizeClassZh: "超大盘" };
  if (mcapUsd >= 10e9) return { sizeClass: "large", sizeClassZh: "大盘" };
  if (mcapUsd >= 2e9) return { sizeClass: "mid", sizeClassZh: "中盘" };
  if (mcapUsd >= 300e6) return { sizeClass: "small", sizeClassZh: "小盘" };
  return { sizeClass: "micro", sizeClassZh: "微盘" };
}

export async function getMarketCapAnalysis(
  symbol: string,
  fresh = false,
): Promise<MarketCapResult> {
  const sym = symbol.trim();
  if (!sym) return { ok: false, error: "缺少标的" };
  try {
    const data = await cached(
      `mcap:${sym}`,
      MCAP_TTL,
      async () => {
        const rows = await fetchYahooQuoteJson([sym]);
        const row =
          rows.find((r) => String(r.symbol || "").toUpperCase() === sym.toUpperCase()) ??
          rows[0];
        if (!row) throw new Error("quote missing");
        const marketCap = num(row.marketCap);
        const sharesOutstanding = num(row.sharesOutstanding);
        const price = num(row.regularMarketPrice);
        const currency = String(row.currency || "USD");
        const name = String(row.longName || row.shortName || sym);
        const quoteType = row.quoteType != null ? String(row.quoteType) : null;

        let floatShares: number | null = null;
        if (quoteType === "EQUITY" || (!isCrypto(sym) && quoteType !== "CRYPTOCURRENCY")) {
          floatShares = await fetchYahooFloatShares(sym);
        }

        let floatMarketCap: number | null = null;
        if (floatShares != null && price != null && price > 0) {
          floatMarketCap = floatShares * price;
        }

        let sizeClass: MarketCapAnalysis["sizeClass"] = null;
        let sizeClassZh: string | null = null;
        let noteZh: string | null = null;
        if (marketCap != null && marketCap > 0) {
          const fx = fxToUsdApprox(currency);
          if (fx != null) {
            const { sizeClass: sc, sizeClassZh: zh } = classifySizeUsd(marketCap * fx);
            sizeClass = sc;
            sizeClassZh = zh;
            if (currency.toUpperCase() !== "USD") {
              noteZh = `市值分位按约 ${currency}→USD 粗换算（仅作大/中/小盘参考，非官方行业分类）。`;
            } else {
              noteZh = "市值分位：超大盘≥2000亿 / 大盘≥100亿 / 中盘≥20亿 / 小盘≥3亿 / 其余微盘（美元口径粗分）。";
            }
          } else {
            noteZh = `市值货币为 ${currency}，暂无可靠美元换算，故不下大中小盘标签。`;
          }
        }

        if (marketCap == null && floatMarketCap == null) {
          throw new Error("no market cap fields");
        }

        const out: MarketCapAnalysis = {
          symbol: String(row.symbol || sym),
          name,
          quoteType,
          currency,
          price,
          marketCap,
          floatMarketCap,
          sharesOutstanding,
          floatShares,
          sizeClass,
          sizeClassZh,
          timestamp: Date.now(),
          source: "Yahoo Finance",
          sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`,
          noteZh,
        };
        return out;
      },
      fresh,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "市值数据暂时无法获取" };
  }
}
