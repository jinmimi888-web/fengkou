import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const symbolsInput = z.object({
  symbols: z.array(z.string().min(1).max(24)).max(32),
});

const symbolInput = z.object({
  symbol: z.string().min(1).max(24),
});

const searchInput = z.object({
  q: z.string().max(40),
});

const newsInput = z.object({
  symbol: z.string().min(1).max(24),
  name: z.string().max(80).optional(),
  fresh: z.boolean().optional(),
});

export const fetchQuotes = createServerFn({ method: "POST" })
  .validator((input: unknown) => symbolsInput.parse(input))
  .handler(async ({ data }) => {
    const { getQuotes } = await import("./market.server");
    return getQuotes(data.symbols);
  });

export const fetchLiveQuotes = createServerFn({ method: "POST" })
  .validator((input: unknown) => symbolsInput.parse(input))
  .handler(async ({ data }) => {
    const { getLiveQuotes } = await import("./market.server");
    return getLiveQuotes(data.symbols);
  });

export const fetchBundle = createServerFn({ method: "POST" })
  .validator((input: unknown) => symbolInput.parse(input))
  .handler(async ({ data }) => {
    const { getBundle } = await import("./market.server");
    return getBundle(data.symbol);
  });

export const fetchNews = createServerFn({ method: "POST" })
  .validator((input: unknown) => newsInput.parse(input))
  .handler(async ({ data }) => {
    const { getNews } = await import("./market.server");
    return getNews(data.symbol, data.name, data.fresh);
  });

const riverInput = z.object({
  symbols: z.array(z.string().min(1).max(24)).max(16),
  fresh: z.boolean().optional(),
});

export const fetchWatchlistNews = createServerFn({ method: "POST" })
  .validator((input: unknown) => riverInput.parse(input))
  .handler(async ({ data }) => {
    const { getWatchlistNews } = await import("./market.server");
    return getWatchlistNews(data.symbols, data.fresh);
  });

export const searchTickers = createServerFn({ method: "POST" })
  .validator((input: unknown) => searchInput.parse(input))
  .handler(async ({ data }) => {
    const { searchSymbols } = await import("./market.server");
    return searchSymbols(data.q);
  });

export const runAnalysis = createServerFn({ method: "POST" })
  .validator((input: unknown) => symbolInput.parse(input))
  .handler(async ({ data }) => {
    const { analyzeSymbol } = await import("./analyze.server");
    return analyzeSymbol(data.symbol);
  });

const bookInput = z.object({
  positions: z
    .array(
      z.object({
        symbol: z.string().min(1).max(24),
        name: z.string().max(80),
        qty: z.number(),
        avgCost: z.number(),
        price: z.number(),
        currency: z.string().max(8),
        value: z.number(),
        pnlPct: z.number(),
        weight: z.number(),
        changePct: z.number(),
        rsi14: z.number().nullable(),
        vsSma20: z.number().nullable(),
      }),
    )
    .max(16),
  totals: z.object({
    currency: z.string().max(8),
    value: z.number(),
    cost: z.number(),
    pnl: z.number(),
    pnlPct: z.number(),
    realized: z.number(),
    count: z.number(),
    maxWeight: z.number(),
    totalPnl: z.number().optional(),
    totalPnlPct: z.number().optional(),
    top3Weight: z.number().optional(),
    winRate: z.number().optional(),
  }),
  headlines: z.array(z.string().max(160)).max(8),
});

export const runBookAnalysis = createServerFn({ method: "POST" })
  .validator((input: unknown) => bookInput.parse(input))
  .handler(async ({ data }) => {
    const { analyzeBook } = await import("./analyze.server");
    return analyzeBook(data);
  });
