import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  LoaderCircle,
  Newspaper,
  ScanSearch,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AddSymbol } from "@/components/desk/add-symbol";
import { SiteFooter } from "@/components/site-footer";
import { AccountBar } from "@/components/desk/account-bar";
import { BookView } from "@/components/desk/book-view";
import { NewsDesk, NewsList, NewsRail } from "@/components/desk/news-feed";
import { FearGreedPulse } from "@/components/desk/fear-greed";
import { ContractIndexPulse } from "@/components/desk/contract-index";
import { MarketIndicesPulse } from "@/components/desk/market-indices";
import { MarketCapPulse } from "@/components/desk/market-cap";
import { PredictionMarketsPanel } from "@/components/desk/prediction-markets";
import { PositionPanel } from "@/components/desk/position-panel";
import { PriceChart } from "@/components/desk/price-chart";
import { Spark } from "@/components/desk/spark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDeskStore } from "@/lib/desk-store";
import {
  fetchLiveQuotes,
  fetchNews,
  fetchQuotes,
  fetchWatchlistNews,
  runAnalysis,
} from "@/lib/finance/api";
import { CRYPTO_TAPE, INDEX_TAPE, displayName, exchangeLabel, isCrypto, shortSymbol, unitLabel } from "@/lib/finance/catalog";
import {
  formatQty,
  markBook,
  neededFxSymbols,
  overlayLive,
  positionPnl,
  reducePositions,
  summarizeBook,
  type OpenPosition,
} from "@/lib/finance/ledger";
import {
  formatPct,
  formatPrice,
  formatVolume,
  relativeTime,
} from "@/lib/finance/tech";
import {
  DIMENSION_META,
  VERDICT_META,
  type Analysis,
  type DimensionKey,
  type NewsItem,
  type QuoteBundle,
  type Verdict,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const DIM_KEYS = Object.keys(DIMENSION_META) as DimensionKey[];

function verdictVariant(v: Verdict) {
  if (v === "enter") return "up" as const;
  if (v === "avoid") return "down" as const;
  if (v === "probe") return "wait" as const;
  return "outline" as const;
}

export function Desk() {
  const symbols = useDeskStore((s) => s.symbols);
  const selected = useDeskStore((s) => s.selected);
  const board = useDeskStore((s) => s.board);
  const select = useDeskStore((s) => s.select);
  const setBoard = useDeskStore((s) => s.setBoard);
  const removeSymbol = useDeskStore((s) => s.removeSymbol);
  const notes = useDeskStore((s) => s.notes);
  const setNote = useDeskStore((s) => s.setNote);
  const analyses = useDeskStore((s) => s.analyses);
  const saveAnalysis = useDeskStore((s) => s.saveAnalysis);
  const trades = useDeskStore((s) => s.trades);
  const hydrated = useDeskStore((s) => s.hydrated);

  const positions = useMemo(() => reducePositions(trades), [trades]);
  const heldSymbols = useMemo(() => [...positions.keys()], [positions]);

  const quoteSymbols = useMemo(() => {
    const fx = neededFxSymbols(heldSymbols);
    return [
      ...new Set([
        ...symbols,
        ...heldSymbols,
        ...INDEX_TAPE.map((x) => x.symbol),
        ...CRYPTO_TAPE.map((x) => x.symbol),
        ...fx,
      ]),
    ];
  }, [symbols, heldSymbols]);

  const newsSymbols = useMemo(
    () => [...new Set([...symbols, ...heldSymbols])].slice(0, 16),
    [symbols, heldSymbols],
  );

  const newsFreshRef = useRef(false);
  const symbolFreshRef = useRef(false);

  const quotesQ = useQuery({
    queryKey: ["quotes", quoteSymbols],
    queryFn: () => fetchQuotes({ data: { symbols: quoteSymbols } }),
    enabled: hydrated && quoteSymbols.length > 0,
    refetchInterval: 180_000,
    staleTime: 60_000,
  });

  const liveQ = useQuery({
    queryKey: ["live", quoteSymbols],
    queryFn: () => fetchLiveQuotes({ data: { symbols: quoteSymbols } }),
    enabled: hydrated && quoteSymbols.length > 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 8_000,
  });

  const newsQ = useQuery({
    queryKey: ["news", selected],
    queryFn: () => {
      const fresh = symbolFreshRef.current;
      symbolFreshRef.current = false;
      return fetchNews({
        data: {
          symbol: selected,
          name: quotesQ.data?.find((b) => b.quote.symbol === selected)?.quote.name,
          fresh,
        },
      });
    },
    enabled: hydrated && Boolean(selected),
    staleTime: 2 * 60_000,
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  const riverQ = useQuery({
    queryKey: ["river", newsSymbols],
    queryFn: () => {
      const fresh = newsFreshRef.current;
      newsFreshRef.current = false;
      return fetchWatchlistNews({ data: { symbols: newsSymbols, fresh } });
    },
    enabled: hydrated && newsSymbols.length > 0,
    staleTime: 2 * 60_000,
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  const [tab, setTab] = useState("judge");
  const [view, setView] = useState<"desk" | "book" | "feed">("desk");

  function refreshNews(force = false) {
    if (force) {
      newsFreshRef.current = true;
      symbolFreshRef.current = true;
    }
    void riverQ.refetch();
    if (selected) void newsQ.refetch();
  }

  const analyzeM = useMutation({
    mutationFn: () => runAnalysis({ data: { symbol: selected } }),
    onSuccess: (a) => {
      saveAnalysis(a);
      setTab("judge");
      toast("入场研判已更新");
    },
    onError: () => toast("研判失败，请稍后重试"),
  });

  const bySymbol = useMemo(
    () => overlayLive(quotesQ.data, liveQ.data),
    [quotesQ.data, liveQ.data],
  );

  const active = selected ? bySymbol.get(selected) : undefined;
  const analysis = selected ? analyses[selected] : undefined;
  const quote = active?.quote;
  const holding = selected ? positions.get(selected) : undefined;
  const bookPreview = useMemo(() => markBook(positions, bySymbol), [positions, bySymbol]);
  const report = useMemo(
    () => summarizeBook(trades, bookPreview, bySymbol),
    [trades, bookPreview, bySymbol],
  );
  const latestBySymbol = useMemo(() => {
    const map = new Map<string, NewsItem>();
    for (const n of riverQ.data ?? []) {
      if (!map.has(n.symbol)) map.set(n.symbol, n);
    }
    return map;
  }, [riverQ.data]);
  const selectedNews = selected
    ? (newsQ.data?.[0] ?? latestBySymbol.get(selected))
    : undefined;

  const stockCount = symbols.filter((s) => !isCrypto(s)).length;
  const cryptoCount = symbols.filter((s) => isCrypto(s)).length;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* —— Top bar —— */}
      <header className="glass-nav sticky top-0 z-40 border-b border-white/40 dark:border-border/80">
        <div className="flex min-h-12 items-center gap-1.5 px-2 py-1.5 sm:gap-3 sm:px-3 xl:px-4">
          <div className="flex shrink-0 items-center gap-2">
            <img
              src="/logo.png"
              alt="锋口"
              width={32}
              height={32}
              className="size-8 rounded-xl object-cover shadow-[var(--shadow-border)]"
            />
            <div className="hidden sm:block">
              <p className="font-serif text-base leading-none tracking-tight">锋口</p>
              <p className="mt-0.5 text-[9px] tracking-[0.16em] text-muted-foreground">
                入场研判台
              </p>
            </div>
          </div>

          <div className="seg shrink-0">
            <button
              type="button"
              onClick={() => setBoard("equity")}
              data-active={board === "equity"}
              className={cn("seg-item px-1.5 sm:px-2.5", board === "equity" && "is-active")}
            >
              股票
              <span className="ml-1 tabular-nums text-[10px] text-muted-foreground">
                {stockCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setBoard("crypto")}
              data-active={board === "crypto"}
              className={cn("seg-item px-1.5 sm:px-2.5", board === "crypto" && "is-active")}
            >
              虚拟货币
              <span className="ml-1 tabular-nums text-[10px] text-muted-foreground">
                {cryptoCount}
              </span>
            </button>
          </div>

          <div className="hidden min-w-0 flex-1 overflow-hidden lg:block">
            <IndexTape
              items={board === "crypto" ? CRYPTO_TAPE : INDEX_TAPE}
              bySymbol={bySymbol}
              compact
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="seg max-w-[42vw] overflow-x-auto sm:max-w-none">
              <button
                type="button"
                onClick={() => setView("desk")}
                data-active={view === "desk"}
                className={cn("seg-item", view === "desk" && "is-active")}
              >
                研判
              </button>
              <button
                type="button"
                onClick={() => setView("book")}
                data-active={view === "book"}
                className={cn("seg-item", view === "book" && "is-active")}
              >
                账本
                {bookPreview.rows.length > 0 ? (
                  <span className="ml-0.5 tabular-nums text-[10px] text-muted-foreground">
                    {bookPreview.rows.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setView("feed")}
                data-active={view === "feed"}
                className={cn("seg-item", view === "feed" && "is-active")}
              >
                动态
                {(riverQ.data?.length ?? 0) > 0 ? (
                  <span className="ml-0.5 tabular-nums text-[10px] text-muted-foreground">
                    {riverQ.data!.length}
                  </span>
                ) : null}
              </button>
            </div>
            <AccountBar />
          </div>
        </div>

        {/* —— Sentiment strip —— */}
        <div className="flex items-stretch gap-1.5 overflow-x-auto border-t border-white/35 bg-white/25 px-2 py-1.5 backdrop-blur-xl dark:border-border/60 dark:bg-card/30 sm:px-3 xl:px-4">
          <div className="flex shrink-0 items-center pr-1">
            <span className="text-[10px] tracking-widest text-muted-foreground whitespace-nowrap">
              市场情绪
            </span>
          </div>
          <FearGreedPulse board={board} compact />
          <ContractIndexPulse board={board} compact />
          <MarketIndicesPulse board={board} compact />
        </div>
      </header>

      {/* —— Workspace —— */}
      {view === "book" ? (
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 xl:px-5">
          <BookView
            bySymbol={bySymbol}
            headlines={(riverQ.data ?? []).slice(0, 8).map((n) => `${n.symbol} ${n.title}`)}
            onOpenSymbol={(s) => {
              select(s);
              setTab("position");
              setView("desk");
            }}
          />
        </main>
      ) : view === "feed" ? (
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 xl:px-5">
          <NewsDesk
            items={riverQ.data ?? []}
            symbols={newsSymbols}
            loading={riverQ.isPending && !riverQ.data}
            fetching={riverQ.isFetching}
            updatedAt={riverQ.dataUpdatedAt}
            onRefresh={() => refreshNews(true)}
            onOpenSymbol={(s) => {
              select(s);
              setTab("news");
              setView("desk");
            }}
          />
        </main>
      ) : (
        <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-0 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          {/* Left: watchlist */}
          <WatchColumn
            symbols={symbols}
            selected={selected}
            board={board}
            bySymbol={bySymbol}
            analyses={analyses}
            holdings={positions}
            headlines={latestBySymbol}
            onSelect={select}
            onRemove={removeSymbol}
          />

          {/* Center: hero + chart + tabs */}
          <section className="min-w-0 border-white/30 px-2 py-3 sm:px-3 xl:border-x xl:px-4 xl:py-3 dark:border-border/60">
            {!selected ? (
              <EmptyDesk />
            ) : (
              <div className="flex flex-col gap-3">
                <QuoteHero
                  symbol={selected}
                  bundle={active}
                  analysis={analysis}
                  holding={holding}
                  latestNews={selectedNews}
                  loading={quotesQ.isPending && liveQ.isPending}
                  analyzing={analyzeM.isPending}
                  onAnalyze={() => analyzeM.mutate()}
                  onHoldings={() => setTab("position")}
                  onNews={() => setTab("news")}
                />

                <MarketCapPulse symbol={selected} />

                {active && active.bars.length > 1 ? (
                  <PriceChart bars={active.bars} currency={quote?.currency ?? ""} />
                ) : quotesQ.isPending || quotesQ.isFetching ? (
                  <Skeleton className="h-56 w-full rounded-2xl" />
                ) : null}

                <Tabs value={tab} onValueChange={setTab} className="min-w-0">
                  <TabsList className="h-9 w-full justify-start overflow-x-auto rounded-full bg-secondary/60 p-0.5 sm:w-auto">
                    <TabsTrigger value="judge" className="h-8 gap-1 px-2.5 text-xs">
                      <ScanSearch className="size-3.5" />
                      入场研判
                    </TabsTrigger>
                    <TabsTrigger value="position" className="h-8 gap-1 px-2.5 text-xs">
                      <Wallet className="size-3.5" />
                      持仓
                    </TabsTrigger>
                    <TabsTrigger value="news" className="h-8 gap-1 px-2.5 text-xs">
                      <Newspaper className="size-3.5" />
                      个股新闻
                    </TabsTrigger>
                    <TabsTrigger value="tape" className="h-8 px-2.5 text-xs">
                      盘面
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="h-8 px-2.5 text-xs">
                      笔记
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="judge" className="mt-3">
                    <AnalysisPanel
                      analysis={analysis}
                      note={notes[selected] ?? ""}
                      onNote={(v) => setNote(selected, v)}
                      analyzing={analyzeM.isPending}
                      onAnalyze={() => analyzeM.mutate()}
                      hideNote
                    />
                  </TabsContent>

                  <TabsContent value="position" className="mt-3">
                    <PositionPanel symbol={selected} quote={quote} />
                  </TabsContent>

                  <TabsContent value="news" className="mt-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-muted-foreground">
                        {newsQ.dataUpdatedAt
                          ? `${relativeTime(newsQ.dataUpdatedAt) || "刚刚"}更新 · 自动收集中`
                          : "正在收集该股新闻"}
                      </p>
                      <button
                        type="button"
                        className="h-8 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => refreshNews(true)}
                      >
                        立即刷新
                      </button>
                    </div>
                    <NewsList
                      items={newsQ.data ?? []}
                      loading={newsQ.isPending && !newsQ.data}
                      empty="暂未抓到该标的新闻"
                    />
                  </TabsContent>

                  <TabsContent value="tape" className="mt-3">
                    <TechGrid bundle={active} />
                  </TabsContent>

                  <TabsContent value="notes" className="mt-3">
                    <NoteBox
                      note={notes[selected] ?? ""}
                      onNote={(v) => setNote(selected, v)}
                      standalone
                    />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </section>

          {/* Right: PnL + news */}
          <aside className="flex min-h-0 flex-col gap-2 border-t border-white/30 px-2 py-3 sm:px-3 xl:border-t-0 xl:px-3 xl:py-3 dark:border-border/60">
            <LivePnl
              book={bookPreview}
              report={report}
              updatedAt={liveQ.dataUpdatedAt}
              onOpen={() => setView("book")}
              compact
            />
            <PredictionMarketsPanel board={board} />
            <div className="min-h-[220px] flex-1 xl:min-h-0 xl:max-h-[calc(100dvh-22rem)]">
              <NewsRail
                items={riverQ.data ?? []}
                loading={riverQ.isPending && !riverQ.data}
                fetching={riverQ.isFetching}
                updatedAt={riverQ.dataUpdatedAt}
                onRefresh={() => refreshNews(true)}
                onOpenAll={() => setView("feed")}
                onOpenSymbol={(s) => {
                  select(s);
                  setTab("news");
                }}
              />
            </div>
            {holding && holding.qty > 0 && selected ? (
              <button
                type="button"
                onClick={() => setTab("position")}
                className="glass glass-tight border border-white/45 bg-card/50 dark:border-border/70 px-2.5 py-2 text-left hover:bg-card"
              >
                <p className="text-[10px] tracking-widest text-muted-foreground">当前仓位</p>
                <p className="mt-0.5 text-xs tabular-nums">
                  {shortSymbol(selected)} · {formatQty(holding.qty)} {unitLabel(selected)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  成本 {formatPrice(holding.avgCost, quote?.currency)}
                </p>
              </button>
            ) : null}
          </aside>
        </main>
      )}

      <SiteFooter />
    </div>
  );
}

function LivePnl({
  book,
  report,
  updatedAt,
  onOpen,
  compact,
}: {
  book: ReturnType<typeof markBook>;
  report: ReturnType<typeof summarizeBook>;
  updatedAt?: number;
  onOpen: () => void;
  compact?: boolean;
}) {
  if (!book.rows.length && !(report && (report.realized !== 0 || report.closedCount > 0))) {
    return compact ? (
      <button
        type="button"
        onClick={onOpen}
        className="glass glass-tight border border-white/40 bg-card/40 dark:border-border/60 px-2.5 py-2 text-left"
      >
        <p className="text-[10px] tracking-widest text-muted-foreground">实时盈亏</p>
        <p className="mt-0.5 text-xs text-muted-foreground">暂无持仓 · 打开账本</p>
      </button>
    ) : null;
  }
  const t = report
    ? report
    : book.usd
      ? book.usd
      : book.groups.length === 1
        ? book.groups[0]!
        : null;
  const total = report?.totalPnl ?? (t && "pnl" in t ? t.pnl : 0);
  const unrealized = report?.unrealized ?? (t && "pnl" in t ? t.pnl : 0);
  const realized = report?.realized ?? (t && "realized" in t ? t.realized : 0);
  const day = report?.dayPnl ?? (t && "dayPnl" in t ? t.dayPnl : 0);
  const ccy = report?.currency ?? (t && "currency" in t ? t.currency : "USD");
  const totalPct = report?.totalPnlPct ?? (t && "cost" in t && t.cost > 0 ? unrealized / t.cost : 0);

  function signed(n: number) {
    const body = formatPrice(n, ccy);
    return n > 0 ? `+${body}` : body;
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="glass glass-tight border border-white/50 bg-card/70 dark:border-border/70 px-2.5 py-2 text-left hover:bg-card"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] tracking-widest text-muted-foreground">实时盈亏</span>
          {updatedAt ? (
            <span className="text-[10px] text-muted-foreground">
              {relativeTime(updatedAt) || "刚刚"}
            </span>
          ) : null}
        </div>
        {t ? (
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
            <div>
              <p className="text-[10px] text-muted-foreground">总盈亏</p>
              <p
                className={cn(
                  "text-sm font-medium tabular-nums",
                  total >= 0 ? "text-up" : "text-down",
                )}
              >
                {signed(total)}
              </p>
              <p className={cn("text-[10px] tabular-nums", total >= 0 ? "text-up" : "text-down")}>
                {formatPct(totalPct)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">浮盈</p>
              <p
                className={cn(
                  "text-sm tabular-nums",
                  unrealized >= 0 ? "text-up" : "text-down",
                )}
              >
                {signed(unrealized)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">已实现</p>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  realized > 0 ? "text-up" : realized < 0 ? "text-down" : "text-muted-foreground",
                )}
              >
                {signed(realized)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">今日</p>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  day >= 0 ? "text-up" : "text-down",
                )}
              >
                {signed(day)}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {book.groups.map((g) => (
              <span
                key={g.currency}
                className={cn(
                  "text-xs tabular-nums",
                  g.pnl >= 0 ? "text-up" : "text-down",
                )}
              >
                {g.currency} {formatPrice(g.pnl, g.currency)}
              </span>
            ))}
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-border bg-card px-4 py-2.5 text-left"
    >
      <span className="text-xs tracking-widest text-muted-foreground">总盈亏</span>
      {t ? (
        <>
          <span
            className={cn(
              "text-sm tabular-nums",
              total >= 0 ? "text-up" : "text-down",
            )}
          >
            {signed(total)} {formatPct(totalPct)}
          </span>
          <span
            className={cn(
              "text-sm tabular-nums",
              unrealized >= 0 ? "text-up" : "text-down",
            )}
          >
            浮 {signed(unrealized)}
          </span>
          <span
            className={cn(
              "text-sm tabular-nums",
              realized > 0 ? "text-up" : realized < 0 ? "text-down" : "text-muted-foreground",
            )}
          >
            已实现 {signed(realized)}
          </span>
          <span
            className={cn(
              "text-sm tabular-nums",
              day >= 0 ? "text-up" : "text-down",
            )}
          >
            今 {signed(day)}
          </span>
        </>
      ) : (
        book.groups.map((g) => (
          <span
            key={g.currency}
            className={cn(
              "text-sm tabular-nums",
              g.pnl >= 0 ? "text-up" : "text-down",
            )}
          >
            {g.currency} {formatPrice(g.pnl, g.currency)}
          </span>
        ))
      )}
      {updatedAt ? (
        <span className="text-xs text-muted-foreground">
          {relativeTime(updatedAt) || "刚刚"}刷新
        </span>
      ) : null}
    </button>
  );
}

function IndexTape({
  items,
  bySymbol,
  compact,
}: {
  items: readonly { symbol: string; label: string }[];
  bySymbol: Map<string, QuoteBundle>;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="overflow-x-auto">
        <div className="flex items-center gap-x-3 px-1 whitespace-nowrap">
          {items.map((row) => {
            const quote = bySymbol.get(row.symbol)?.quote;
            const up = (quote?.changePct ?? 0) >= 0;
            return (
              <div
                key={row.symbol}
                className="flex items-center gap-1.5 text-[11px]"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="tabular-nums">
                  {quote ? formatPrice(quote.price, quote.currency) : "—"}
                </span>
                <span className={cn("tabular-nums", up ? "text-up" : "text-down")}>
                  {quote ? formatPct(quote.changePct) : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-x-hidden border-t border-border bg-card/60">
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 px-4 py-2">
        {items.map((row) => {
          const quote = bySymbol.get(row.symbol)?.quote;
          const up = (quote?.changePct ?? 0) >= 0;
          return (
            <div
              key={row.symbol}
              className="flex items-center gap-2 text-xs whitespace-nowrap"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="tabular-nums">
                {quote ? formatPrice(quote.price, quote.currency) : "—"}
              </span>
              <span className={cn("tabular-nums", up ? "text-up" : "text-down")}>
                {quote ? formatPct(quote.changePct) : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WatchColumn({
  symbols,
  selected,
  board,
  bySymbol,
  analyses,
  holdings,
  headlines,
  onSelect,
  onRemove,
}: {
  symbols: string[];
  selected: string;
  board: "equity" | "crypto";
  bySymbol: Map<string, QuoteBundle>;
  analyses: Record<string, Analysis>;
  holdings: Map<string, OpenPosition>;
  headlines: Map<string, NewsItem>;
  onSelect: (s: string) => void;
  onRemove: (s: string) => void;
}) {
  const visible = symbols.filter((s) => (isCrypto(s) ? "crypto" : "equity") === board);
  return (
    <aside className="min-w-0 border-b border-white/30 px-2 py-3 sm:px-3 xl:sticky xl:top-[6.5rem] xl:max-h-[calc(100dvh-6.5rem)] xl:self-start xl:overflow-y-auto xl:border-b-0 dark:border-border/60">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            观察池
          </p>
          <p className="text-sm font-medium">
            {board === "crypto" ? "虚拟货币" : "股票"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {symbols.length}/16
          </span>
          <AddSymbol kind={board} compact />
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
        {visible.map((sym) => {
          const b = bySymbol.get(sym);
          const q = b?.quote;
          const up = (q?.changePct ?? 0) >= 0;
          const v = analyses[sym]?.verdict;
          const pos = holdings.get(sym);
          const marked =
            pos && pos.qty > 0 && q && q.price > 0
              ? positionPnl(pos, q.price, q.previousClose, q.changePct)
              : null;
          return (
            <div
              key={sym}
              className={cn(
                "relative w-56 shrink-0 rounded-md border px-2.5 py-2 xl:w-full",
                selected === sym
                  ? "border-bone/40 bg-card/90 shadow-[var(--shadow-border-hover)] backdrop-blur-xl"
                  : "border-white/40 bg-card/35 hover:border-white/60 hover:bg-card/70 backdrop-blur-md dark:border-border/50",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(sym)}
                className="flex w-full items-start gap-2 pr-6 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium tracking-wide">
                      {shortSymbol(sym)}
                    </span>
                    {holdings.get(sym)?.qty ? (
                      <Badge variant="outline" className="h-5 px-1 text-[10px]">
                        持 {formatQty(holdings.get(sym)!.qty)}
                      </Badge>
                    ) : null}
                    {v ? (
                      <Badge variant={verdictVariant(v)} className="h-5 px-1 text-[10px]">
                        {VERDICT_META[v].label}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {displayName(sym, q?.name)}
                  </p>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-[13px] tabular-nums">
                      {q && q.price > 0 ? formatPrice(q.price, q.currency) : "—"}
                    </span>
                    <span
                      className={cn("text-[11px] tabular-nums", up ? "text-up" : "text-down")}
                    >
                      {q && q.price > 0 ? formatPct(q.changePct) : ""}
                    </span>
                  </div>
                  {marked ? (
                    <p
                      className={cn(
                        "mt-0.5 text-[10px] tabular-nums",
                        marked.pnl >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {marked.pnl >= 0 ? "盈" : "亏"} {formatPrice(marked.pnl, q?.currency)}{" "}
                      {formatPct(marked.pnlPct)}
                    </p>
                  ) : null}
                  {headlines.get(sym) ? (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {headlines.get(sym)!.title}
                    </p>
                  ) : null}
                </div>
                <Spark values={b?.spark ?? []} positive={up} />
              </button>
              <button
                type="button"
                aria-label={`移除 ${sym}`}
                onClick={() => onRemove(sym)}
                className="absolute top-1 right-1 flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          );
        })}
        {visible.length === 0 ? (
          <div className="w-full glass glass-tight border border-white/40 bg-card/40 dark:border-border/50 p-3 text-xs text-muted-foreground">
            {board === "crypto" ? "点上方加入观察，搜索比特币或 ETH。" : "先加入一只准备入场的股票。"}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function QuoteHero({
  symbol,
  bundle,
  analysis,
  holding,
  latestNews,
  loading,
  analyzing,
  onAnalyze,
  onHoldings,
  onNews,
}: {
  symbol: string;
  bundle?: QuoteBundle;
  analysis?: Analysis;
  holding?: OpenPosition;
  latestNews?: NewsItem;
  loading: boolean;
  analyzing: boolean;
  onAnalyze: () => void;
  onHoldings: () => void;
  onNews: () => void;
}) {
  const q = bundle?.quote;
  const up = (q?.changePct ?? 0) >= 0;
  const marked =
    holding && holding.qty > 0 && q && q.price > 0
      ? positionPnl(holding, q.price, q.previousClose, q.changePct)
      : null;
  return (
    <div className="flex flex-col gap-3 glass glass-tight border border-white/50 bg-card/70 dark:border-border/70 p-3 sm:flex-row sm:items-end sm:justify-between sm:p-4">
      <div className="min-w-0">
        <p className="text-[10px] tracking-[0.16em] text-muted-foreground">
          {isCrypto(symbol) ? "虚拟货币" : q?.exchange ? exchangeLabel(q.exchange) : "市场"}
        </p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h1 className="font-serif text-2xl tracking-tight sm:text-3xl">
            {displayName(symbol, q?.name)}
          </h1>
          <span className="text-xs text-muted-foreground">{shortSymbol(symbol)}</span>
        </div>
        {loading && !q ? (
          <Skeleton className="mt-3 h-9 w-36" />
        ) : (
          <div className="mt-2 flex flex-wrap items-end gap-2.5">
            <span className="text-3xl font-medium tabular-nums tracking-tight sm:text-4xl">
              {q && q.price > 0 ? formatPrice(q.price, q.currency) : "—"}
            </span>
            <span
              className={cn(
                "mb-0.5 inline-flex items-center gap-0.5 text-sm tabular-nums",
                up ? "text-up" : "text-down",
              )}
            >
              {up ? (
                <ArrowUpRight className="size-4" />
              ) : (
                <ArrowDownRight className="size-4" />
              )}
              {q && q.price > 0 ? formatPct(q.changePct) : ""}
            </span>
            {q && q.volume != null && q.volume > 0 ? (
              <span className="mb-0.5 text-[11px] text-muted-foreground">
                量 {formatVolume(q.volume)}
              </span>
            ) : null}
          </div>
        )}
        {marked ? (
          <button
            type="button"
            onClick={onHoldings}
            className="mt-2 text-left text-xs hover:text-foreground"
          >
            <span className="text-muted-foreground">
              持 {formatQty(holding!.qty)} {unitLabel(symbol)} · 成本{" "}
              {formatPrice(holding!.avgCost, q?.currency)}
            </span>
            <span
              className={cn(
                "ml-2 tabular-nums",
                marked.pnl >= 0 ? "text-up" : "text-down",
              )}
            >
              浮盈 {formatPrice(marked.pnl, q?.currency)} {formatPct(marked.pnlPct)}
            </span>
            <span
              className={cn(
                "ml-2 tabular-nums",
                marked.pnl + holding!.realized >= 0 ? "text-up" : "text-down",
              )}
            >
              总 {formatPrice(marked.pnl + holding!.realized, q?.currency)}
            </span>
            <span
              className={cn(
                "ml-2 tabular-nums",
                marked.dayPnl >= 0 ? "text-up" : "text-down",
              )}
            >
              今日 {formatPrice(marked.dayPnl, q?.currency)}
            </span>
          </button>
        ) : holding && holding.qty > 0 ? (
          <button
            type="button"
            onClick={onHoldings}
            className="mt-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            持 {formatQty(holding.qty)} {unitLabel(symbol)} · 成本{" "}
            {formatPrice(holding.avgCost, q?.currency)}
          </button>
        ) : null}
        {latestNews ? (
          <button
            type="button"
            onClick={onNews}
            className="mt-1.5 max-w-xl text-left text-[11px] text-muted-foreground hover:text-foreground"
          >
            <span className="text-bone">最新</span>
            <span className="mx-1.5">{latestNews.title}</span>
            <span>{relativeTime(latestNews.publishedAt)}</span>
          </button>
        ) : null}
      </div>
      <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
        {analysis ? (
          <Badge
            variant={verdictVariant(analysis.verdict)}
            className="self-start sm:self-end"
          >
            {VERDICT_META[analysis.verdict].label}
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">尚未研判</span>
        )}
        <Button onClick={onAnalyze} disabled={analyzing} className="min-w-36">
          {analyzing ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              正在研判
            </>
          ) : analysis ? (
            "重新研判入场"
          ) : (
            "现在研判入场"
          )}
        </Button>
      </div>
    </div>
  );
}

function AnalysisPanel({
  analysis,
  note,
  onNote,
  analyzing,
  onAnalyze,
  hideNote,
}: {
  analysis?: Analysis;
  note: string;
  onNote: (v: string) => void;
  analyzing: boolean;
  onAnalyze: () => void;
  hideNote?: boolean;
}) {
  if (!analysis) {
    return (
      <div className="glass glass-tight border border-white/50 bg-card/70 dark:border-border/70 p-5">
        <p className="font-serif text-xl">先做一次入场研判</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          模型会读取该股近期新闻、涨跌、波动与均线位置，从舆情、催化、动量、估值、流动性、宏观六个维度打分，并给出仓位区间与失效条件。
        </p>
        <Button className="mt-4" onClick={onAnalyze} disabled={analyzing}>
          {analyzing ? "正在研判" : "开始研判"}
        </Button>
        {!hideNote ? <NoteBox note={note} onNote={onNote} /> : null}
      </div>
    );
  }

  const v = analysis.verdict;
  return (
    <div className="flex flex-col gap-4">
      <div className="glass glass-tight border border-white/50 bg-card/70 dark:border-border/70 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant={verdictVariant(v)}>{VERDICT_META[v].label}</Badge>
            <h2 className="mt-3 font-serif text-2xl tracking-tight sm:text-3xl">
              {analysis.headline}
            </h2>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>把握 {analysis.conviction}/5</p>
            <p>风险 {analysis.riskScore}</p>
            <p>{relativeTime(analysis.generatedAt)}</p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {analysis.summary}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat
            label="建议仓位"
            value={`${analysis.sizeMinPct}–${analysis.sizeMaxPct}%`}
          />
          <Stat
            label="周期"
            value={
              analysis.horizon === "intraday"
                ? "日内"
                : analysis.horizon === "position"
                  ? "中线"
                  : "波段"
            }
          />
          <Stat label="失效条件" value={analysis.invalidation || "—"} />
        </div>
        <div className="mt-4 rounded-lg bg-secondary p-4">
          <p className="text-xs tracking-widest text-muted-foreground">入场计划</p>
          <p className="mt-1 text-sm leading-relaxed">{analysis.entryPlan}</p>
        </div>
        {analysis.predictionHints && analysis.predictionHints.length > 0 ? (
          <div className="mt-4 rounded-lg border border-border/60 bg-secondary/50 p-3">
            <p className="text-[11px] tracking-widest text-muted-foreground">
              相关预测市场（群众赔率，仅供参考）
            </p>
            <ul className="mt-2 space-y-2">
              {analysis.predictionHints.slice(0, 3).map((h) => {
                const prob =
                  h.yesProb % 1 === 0 ? String(h.yesProb) : h.yesProb.toFixed(1);
                return (
                  <li key={`${h.platform}:${h.url}:${h.title}`}>
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-2 text-sm leading-snug hover:text-foreground"
                    >
                      <span className="mt-0.5 shrink-0 rounded bg-background/80 px-1 py-px text-[10px] text-muted-foreground">
                        {h.platformLabel}
                      </span>
                      <span className="min-w-0 flex-1 text-muted-foreground group-hover:text-foreground">
                        {h.title}
                        <span className="ml-1 tabular-nums text-foreground">
                          Yes {prob}%
                        </span>
                      </span>
                      <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-60" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DIM_KEYS.map((key) => {
          const d = analysis.dimensions[key];
          return (
            <div
              key={key}
              className="glass glass-tight border border-white/45 bg-card/70 dark:border-border/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">{DIMENSION_META[key].label}</p>
                <span className="text-sm tabular-nums">{d.score}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-bone"
                  style={{ width: `${d.score}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {d.note}
              </p>
            </div>
          );
        })}
      </div>

      <div className="glass glass-tight border border-white/50 bg-card/70 dark:border-border/70 p-4">
        <p className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-down" />
          投资风险
        </p>
        <ul className="mt-3 space-y-3">
          {analysis.risks.map((r) => (
            <li key={r.title} className="flex gap-3">
              <Badge
                variant={
                  r.severity === "high"
                    ? "down"
                    : r.severity === "low"
                      ? "up"
                      : "warn"
                }
              >
                {r.severity === "high" ? "高" : r.severity === "low" ? "低" : "中"}
              </Badge>
              <div>
                <p className="text-sm">{r.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {r.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {analysis.watch.length > 0 && (
          <>
            <Separator className="my-4" />
            <p className="text-xs tracking-widest text-muted-foreground">
              接下来盯
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {analysis.watch.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!hideNote ? <NoteBox note={note} onNote={onNote} /> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className="text-[11px] tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-snug">{value}</p>
    </div>
  );
}

function NoteBox({
  note,
  onNote,
  standalone,
}: {
  note: string;
  onNote: (v: string) => void;
  standalone?: boolean;
}) {
  const [value, setValue] = useState(note);
  useEffect(() => setValue(note), [note]);
  return (
    <div
      className={cn(
        "glass glass-tight border border-white/50 bg-card/70 dark:border-border/70 p-3 sm:p-4",
        !standalone && "mt-4",
      )}
    >
      <p className="text-[10px] tracking-widest text-muted-foreground">
        入场理由（仅自己可见）
      </p>
      <Textarea
        className="mt-2"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onNote(value)}
        placeholder="为什么现在想买，计划买多少，能承受怎样的回撤"
      />
    </div>
  );
}

function TechGrid({ bundle }: { bundle?: QuoteBundle }) {
  if (!bundle) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  const { quote, tech } = bundle;
  const rows = [
    [
      "开盘区间",
      `${formatPrice(quote.dayLow, quote.currency)} – ${formatPrice(quote.dayHigh, quote.currency)}`,
    ],
    ["成交量", formatVolume(quote.volume)],
    [
      "52周",
      `${formatPrice(quote.fiftyTwoWeekLow, quote.currency)} – ${formatPrice(quote.fiftyTwoWeekHigh, quote.currency)}`,
    ],
    ["距高点", formatPct(tech.dist52wHigh)],
    ["20日均线", formatPrice(tech.sma20, quote.currency)],
    ["50日均线", formatPrice(tech.sma50, quote.currency)],
    ["相对 20 日均线", formatPct(tech.vsSma20)],
    ["相对 50 日均线", formatPct(tech.vsSma50)],
    ["14日强弱", tech.rsi14 != null ? tech.rsi14.toFixed(1) : "—"],
    ["20 日年化波动", formatPct(tech.vol20)],
    ["5 日涨跌", formatPct(tech.ret5d)],
    ["20 日涨跌", formatPct(tech.ret20d)],
    ["量比", tech.volumeRatio != null ? tech.volumeRatio.toFixed(2) : "—"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="glass glass-tight border border-white/45 bg-card/70 dark:border-border/60 p-3">
          <p className="text-[11px] text-muted-foreground">{k}</p>
          <p className="mt-1 text-sm tabular-nums">{v}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyDesk() {
  return (
    <div className="glass glass-tight border border-white/50 bg-card/70 dark:border-border/70 p-6">
      <p className="font-serif text-xl">观察池是空的</p>
      <p className="mt-2 text-sm text-muted-foreground">
        加入你准备现在入场的股票，锋口会收集新闻并给出多维建议。
      </p>
      <div className="mt-5">
        <AddSymbol />
      </div>
    </div>
  );
}
