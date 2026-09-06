import { CATALOG, isCrypto, searchCatalog } from "./catalog";
import { computeTech, sparkline } from "./tech";
import type { Bar, LiveQuote, NewsItem, Quote, QuoteBundle, SearchHit } from "./types";

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
  if (isCrypto(symbol)) {
    const code = symbol.replace(/-USD$/i, "");
    return [
      `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=US&ceid=US:zh-Hans`,
      `https://news.google.com/rss/search?q=${encodeURIComponent(`${code} crypto`)}&hl=en-US&gl=US&ceid=US:en`,
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
    `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=US&ceid=US:zh-Hans`,
    `https://news.google.com/rss/search?q=${encodeURIComponent(`${symbol} stock`)}&hl=en-US&gl=US&ceid=US:en`,
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
    const { ok, text } = await fetchText(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=8`,
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
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSym}&region=US&lang=en-US`,
      ];
      const feeds = await Promise.allSettled([
        ...urls.map((url) => rssFeed(url, symbol)),
        yahooSearchNews(symbol).then((items) => focusNews(symbol, label, items)),
      ]);
      const groups = feeds
        .filter((f): f is PromiseFulfilledResult<NewsItem[]> => f.status === "fulfilled")
        .map((f) => f.value);
      return focusNews(symbol, label, mergeNews(groups)).slice(0, 18);
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
