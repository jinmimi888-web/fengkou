import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Check, LoaderCircle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useDeskStore } from "@/lib/desk-store";
import { displayName, shortSymbol, unitLabel } from "@/lib/finance/catalog";
import { runBookAnalysis } from "@/lib/finance/api";
import {
  formatQty,
  formatTradeDay,
  markBook,
  reducePositions,
  summarizeBook,
  summarizeSymbols,
  type BookReport,
  type SymbolPnl,
} from "@/lib/finance/ledger";
import { formatPct, formatPrice, relativeTime } from "@/lib/finance/tech";
import {
  BOOK_VERDICT_META,
  type BookVerdict,
  type QuoteBundle,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

function bookVariant(v: BookVerdict) {
  if (v === "add" || v === "hold") return "up" as const;
  if (v === "trim") return "down" as const;
  if (v === "rebalance") return "warn" as const;
  return "wait" as const;
}

function signedPrice(n: number, currency: string) {
  const body = formatPrice(n, currency);
  return n > 0 ? `+${body}` : body;
}

export function BookView({
  bySymbol,
  headlines,
  onOpenSymbol,
}: {
  bySymbol: Map<string, QuoteBundle>;
  headlines: string[];
  onOpenSymbol: (symbol: string) => void;
}) {
  const trades = useDeskStore((s) => s.trades);
  const bookAnalysis = useDeskStore((s) => s.bookAnalysis);
  const saveBookAnalysis = useDeskStore((s) => s.saveBookAnalysis);
  const bookScope = useDeskStore((s) => s.bookScope);
  const bookSymbols = useDeskStore((s) => s.bookSymbols);
  const setBookScope = useDeskStore((s) => s.setBookScope);
  const toggleBookSymbol = useDeskStore((s) => s.toggleBookSymbol);
  const setBookSymbols = useDeskStore((s) => s.setBookSymbols);

  const universe = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) set.add(t.symbol);
    return [...set].sort((a, b) => displayName(a).localeCompare(displayName(b), "zh"));
  }, [trades]);

  const picked = useMemo(() => {
    if (bookScope !== "custom") return universe;
    const allow = new Set(bookSymbols);
    return universe.filter((s) => allow.has(s));
  }, [bookScope, bookSymbols, universe]);

  const scopedTrades = useMemo(
    () => (picked.length === universe.length ? trades : trades.filter((t) => picked.includes(t.symbol))),
    [trades, picked, universe.length],
  );

  const positions = useMemo(() => reducePositions(scopedTrades), [scopedTrades]);
  const book = useMemo(() => markBook(positions, bySymbol), [positions, bySymbol]);
  const report = useMemo(
    () => summarizeBook(scopedTrades, book, bySymbol),
    [scopedTrades, book, bySymbol],
  );
  const perSymbol = useMemo(
    () => summarizeSymbols(scopedTrades, book, bySymbol),
    [scopedTrades, book, bySymbol],
  );
  const journal = useMemo(
    () => [...scopedTrades].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id)).slice(0, 24),
    [scopedTrades],
  );
  const custom = bookScope === "custom";
  const allPicked = custom && picked.length === universe.length && universe.length > 0;

  const analyzeM = useMutation({
    mutationFn: () =>
      runBookAnalysis({
        data: {
          positions: book.rows.map((r) => {
            const q = bySymbol.get(r.symbol)?.quote;
            const tech = bySymbol.get(r.symbol)?.tech;
            return {
              symbol: r.symbol,
              name: displayName(r.symbol, q?.name),
              qty: r.qty,
              avgCost: r.avgCost,
              price: r.price,
              currency: r.currency,
              value: r.value,
              pnlPct: r.pnlPct,
              weight: r.weight,
              changePct: q?.changePct ?? 0,
              rsi14: tech?.rsi14 ?? null,
              vsSma20: tech?.vsSma20 ?? null,
            };
          }),
          totals: {
            currency: report?.currency ?? "MIXED",
            value: report?.value ?? 0,
            cost: report?.cost ?? 0,
            pnl: report?.unrealized ?? 0,
            pnlPct: report?.unrealizedPct ?? 0,
            realized: report?.realized ?? 0,
            totalPnl: report?.totalPnl ?? 0,
            totalPnlPct: report?.totalPnlPct ?? 0,
            count: book.rows.length,
            maxWeight: report?.maxWeight ?? book.rows[0]?.weight ?? 0,
            top3Weight: report?.top3Weight ?? 0,
            winRate: report?.winRate ?? 0,
          },
          headlines,
        },
      }),
    onSuccess: (a) => {
      saveBookAnalysis(a);
      toast("组合研判已更新");
    },
    onError: () => toast("研判失败，请稍后重试"),
  });

  if (!trades.length) {
    return (
      <div className="rounded-xl bg-card p-8 shadow-[var(--shadow-border)]">
        <p className="font-serif text-2xl">账本还是空的</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          打开一只股票，在「持仓」里登记现有股数和平均成本，或记入买入卖出。锋口会按移动平均法跟踪成本和盈亏，再给你组合层面的建议。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-widest text-muted-foreground">账本</p>
            <h1 className="mt-1 font-serif text-3xl tracking-tight">总仓位报表</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {custom
                ? `自定义 ${picked.length} / ${universe.length} 只`
                : "全部标的"}
              {report
                ? ` · ${report.openCount} 只持仓 · ${report.closedCount} 只已了结 · ${scopedTrades.length} 笔流水`
                : ` · ${book.rows.length} 只持仓 · ${scopedTrades.length} 笔流水`}
              {book.usd && book.groups.length > 1 ? " · 已按现汇折美元" : ""}
            </p>
          </div>
          <Button
            onClick={() => analyzeM.mutate()}
            disabled={analyzeM.isPending || book.rows.length === 0}
            className="min-w-40"
          >
            {analyzeM.isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                正在研判
              </>
            ) : bookAnalysis ? (
              "重新整体研判"
            ) : (
              "整体研判"
            )}
          </Button>
        </div>

        <div className="mt-5">
          <p className="text-xs tracking-widest text-muted-foreground">计算范围</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-secondary p-1">
              <button
                type="button"
                onClick={() => setBookScope("all")}
                className={
                  !custom
                    ? "h-9 rounded-md bg-card px-3 text-sm shadow-[var(--shadow-border)]"
                    : "h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setBookScope("custom", universe)}
                className={
                  custom
                    ? "h-9 rounded-md bg-card px-3 text-sm shadow-[var(--shadow-border)]"
                    : "h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                自定义
              </button>
            </div>
            {custom ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBookSymbols(universe)}
                  disabled={allPicked}
                >
                  全选
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setBookSymbols([])}
                  disabled={picked.length === 0}
                >
                  清空
                </Button>
              </>
            ) : null}
          </div>
          {custom ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {universe.map((symbol) => {
                const on = picked.includes(symbol);
                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => toggleBookSymbol(symbol)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm",
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {on ? <Check className="size-3.5" /> : null}
                    {displayName(symbol)}
                    <span className={on ? "opacity-80" : ""}>{shortSymbol(symbol)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              账本计入全部有流水的股票。切到自定义可只算其中几只。
            </p>
          )}
        </div>

        {custom && picked.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            还没有勾选股票，报表暂不计算。点「全选」或点名字计入。
          </p>
        ) : report ? (
          <ReportHero report={report} />
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            多币种持仓，汇率尚未就绪，先按原币看各账户。
          </p>
        )}

        {book.groups.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {book.groups.map((g) => (
              <span
                key={g.currency}
                className="rounded-full bg-secondary px-3 py-1 text-xs tabular-nums"
              >
                {g.currency} {formatPrice(g.value, g.currency)}{" "}
                <span className={g.pnl >= 0 ? "text-up" : "text-down"}>
                  {formatPct(g.cost > 0 ? g.value / g.cost - 1 : 0)}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {report ? (
        <>
          <ReportMetrics report={report} />
          <ReportStructure report={report} onOpenSymbol={onOpenSymbol} />
        </>
      ) : null}

      {perSymbol.length > 0 ? (
        <SymbolPnlList rows={perSymbol} onOpenSymbol={onOpenSymbol} />
      ) : null}

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5">
          <p className="text-xs tracking-widest text-muted-foreground">持仓明细</p>
          <p className="text-xs text-muted-foreground">按市值权重</p>
        </div>
        {book.rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            流水还在，当前没有未平仓。
          </p>
        ) : (
          <ul className="mt-2">
            {book.rows.map((row) => {
              const q = bySymbol.get(row.symbol)?.quote;
              return (
                <li key={row.symbol} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => onOpenSymbol(row.symbol)}
                    className="flex w-full flex-col gap-2 px-4 py-4 text-left hover:bg-secondary/60 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 sm:w-40">
                      <p className="truncate text-sm font-medium">
                        {displayName(row.symbol, q?.name)}
                        <span className="ml-2 text-xs text-muted-foreground">{shortSymbol(row.symbol)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{row.symbol}</p>
                    </div>
                    <div className="grid flex-1 grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
                      <Cell label="持仓" value={`${formatQty(row.qty)} ${unitLabel(row.symbol)}`} />
                      <Cell
                        label="成本 / 现价"
                        value={`${formatPrice(row.avgCost, row.currency)} / ${row.price ? formatPrice(row.price, row.currency) : "—"}`}
                      />
                      <Cell
                        label="总盈亏"
                        value={signedPrice(row.pnl + row.realized, row.currency)}
                        tone={row.pnl + row.realized >= 0 ? "up" : "down"}
                      />
                      <Cell
                        label="浮盈"
                        value={
                          row.price
                            ? `${signedPrice(row.pnl, row.currency)} ${formatPct(row.pnlPct)}`
                            : "—"
                        }
                        tone={row.price ? (row.pnl >= 0 ? "up" : "down") : undefined}
                      />
                      <Cell
                        label="今日"
                        value={row.price ? signedPrice(row.dayPnl, row.currency) : "—"}
                        tone={row.price ? (row.dayPnl >= 0 ? "up" : "down") : undefined}
                      />
                      <Cell
                        label="已实现"
                        value={signedPrice(row.realized, row.currency)}
                        tone={
                          row.realized > 0 ? "up" : row.realized < 0 ? "down" : undefined
                        }
                      />
                      <Cell
                        label="权重"
                        value={row.weight > 0 ? `${(row.weight * 100).toFixed(1)}%` : "—"}
                      />
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-secondary sm:w-24 sm:shrink-0">
                      <div
                        className="h-full rounded-full bg-bone"
                        style={{ width: `${Math.min(100, row.weight * 100)}%` }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {bookAnalysis ? (
        <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge variant={bookVariant(bookAnalysis.verdict)}>
                {BOOK_VERDICT_META[bookAnalysis.verdict].label}
              </Badge>
              <h2 className="mt-3 font-serif text-2xl tracking-tight">
                {bookAnalysis.headline}
              </h2>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>把握 {bookAnalysis.conviction}/5</p>
              <p>风险 {bookAnalysis.riskScore}</p>
              <p>{relativeTime(bookAnalysis.generatedAt)}</p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {bookAnalysis.summary}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-secondary p-4">
              <p className="text-xs tracking-widest text-muted-foreground">集中度</p>
              <p className="mt-1 text-sm leading-relaxed">{bookAnalysis.concentration}</p>
            </div>
            <div className="rounded-lg bg-secondary p-4">
              <p className="text-xs tracking-widest text-muted-foreground">现在怎么做</p>
              <p className="mt-1 text-sm leading-relaxed">{bookAnalysis.action}</p>
            </div>
          </div>
          {bookAnalysis.suggestions.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {bookAnalysis.suggestions.map((s, i) => (
                <li key={`${s.symbol}-${i}`} className="flex gap-3">
                  <Badge variant="outline">{s.move}</Badge>
                  <div>
                    <p className="text-sm">
                      {s.symbol ? displayName(s.symbol) : "组合"}
                      {s.symbol ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {s.symbol}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <Separator className="my-4" />
          <p className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-down" />
            组合风险
          </p>
          <ul className="mt-3 space-y-3">
            {bookAnalysis.risks.map((r) => (
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
        </div>
      ) : (
        <div className="rounded-xl bg-card p-6 shadow-[var(--shadow-border)]">
          <p className="flex items-center gap-2 font-serif text-xl">
            <Wallet className="size-5" />
            还没有组合研判
          </p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            模型会看持仓权重、浮盈、均线位置与新闻，判断是否过重、该加还是该减。
          </p>
        </div>
      )}

      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <p className="text-xs tracking-widest text-muted-foreground">最近流水</p>
        {journal.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">暂无。</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {journal.map((t) => {
              const ccy = bySymbol.get(t.symbol)?.quote.currency;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <Badge variant={t.side === "buy" ? "up" : "down"}>
                    {t.side === "buy" ? "买" : "卖"}
                  </Badge>
                  <button
                    type="button"
                    className="text-sm hover:underline"
                    onClick={() => onOpenSymbol(t.symbol)}
                  >
                    {displayName(t.symbol)}
                  </button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatQty(t.qty)} × {formatPrice(t.price, ccy)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTradeDay(t.at)}
                  </span>
                  {t.note ? (
                    <span className="text-xs text-muted-foreground">{t.note}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SymbolPnlList({
  rows,
  onOpenSymbol,
}: {
  rows: SymbolPnl[];
  onOpenSymbol: (symbol: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
      <div className="px-4 pt-4 sm:px-5">
        <p className="text-xs tracking-widest text-muted-foreground">分标的总盈亏</p>
        <p className="mt-1 text-sm text-muted-foreground">
          每只股票单独轧差：总盈亏 = 浮动 + 已实现，收益率按该标的累计买入。
        </p>
      </div>
      <ul className="mt-2">
        {rows.map((row) => (
          <li key={row.symbol} className="border-b border-border last:border-0">
            <button
              type="button"
              onClick={() => onOpenSymbol(row.symbol)}
              className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-secondary/60 sm:px-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {displayName(row.symbol)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {shortSymbol(row.symbol)}
                    </span>
                    {!row.open ? (
                      <span className="ml-2 text-xs text-muted-foreground">已了结</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.open
                      ? `持 ${formatQty(row.qty)} ${unitLabel(row.symbol)}`
                      : "已平仓"}
                    {row.buyCount || row.sellCount
                      ? ` · ${row.buyCount} 买 / ${row.sellCount} 卖`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-xl font-medium tabular-nums",
                      row.total >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {signedPrice(row.total, row.currency)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatPct(row.totalPct)}
                    {row.netInvested > 0 ? ` · 净投入 ${formatPct(row.netInvestedPct)}` : ""}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <Cell
                  label="浮动"
                  value={signedPrice(row.unrealized, row.currency)}
                  tone={row.unrealized > 0 ? "up" : row.unrealized < 0 ? "down" : undefined}
                />
                <Cell
                  label="已实现"
                  value={signedPrice(row.realized, row.currency)}
                  tone={row.realized > 0 ? "up" : row.realized < 0 ? "down" : undefined}
                />
                <Cell
                  label="今日"
                  value={row.open ? signedPrice(row.dayPnl, row.currency) : "—"}
                  tone={
                    row.open ? (row.dayPnl >= 0 ? "up" : "down") : undefined
                  }
                />
                <Cell label="累计买入" value={formatPrice(row.buySpend, row.currency)} />
                <Cell label="累计卖出" value={formatPrice(row.sellProceeds, row.currency)} />
                <Cell label="净投入" value={formatPrice(row.netInvested, row.currency)} />
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full",
                    row.total >= 0 ? "bg-up" : "bg-down",
                  )}
                  style={{ width: `${Math.min(100, row.share * 100)}%` }}
                />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportHero({ report }: { report: BookReport }) {
  const ccy = report.currency;
  const up = report.totalPnl >= 0;
  const absU = Math.abs(report.unrealized);
  const absR = Math.abs(report.realized);
  const split = absU + absR;
  const uShare = split > 0 ? absU / split : 0;
  const rShare = split > 0 ? absR / split : 0;
  const mixed = report.unrealized * report.realized < 0;

  return (
    <div className="mt-5">
      <p className="text-xs tracking-widest text-muted-foreground">总盈亏</p>
      <p
        className={cn(
          "mt-1 font-serif text-4xl tracking-tight tabular-nums sm:text-5xl",
          up ? "text-up" : "text-down",
        )}
      >
        {signedPrice(report.totalPnl, ccy)}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        浮动 {signedPrice(report.unrealized, ccy)} + 已实现{" "}
        {signedPrice(report.realized, ccy)}
        <span className="mx-2 text-border">·</span>
        相对累计买入{" "}
        <span className={cn("tabular-nums", up ? "text-up" : "text-down")}>
          {formatPct(report.totalPnlPct)}
        </span>
        {report.netInvested > 0 ? (
          <>
            <span className="mx-2 text-border">·</span>
            相对净投入{" "}
            <span className={cn("tabular-nums", up ? "text-up" : "text-down")}>
              {formatPct(report.netInvestedPct)}
            </span>
          </>
        ) : null}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SplitCard
          label="浮动盈亏"
          value={signedPrice(report.unrealized, ccy)}
          hint={`相对持仓成本 ${formatPct(report.unrealizedPct)}`}
          tone={report.unrealized >= 0 ? "up" : "down"}
        />
        <SplitCard
          label="已实现"
          value={signedPrice(report.realized, ccy)}
          hint={
            report.sellCount > 0
              ? `${report.sellCount} 笔卖出`
              : "尚未记入卖出"
          }
          tone={
            report.realized > 0 ? "up" : report.realized < 0 ? "down" : undefined
          }
        />
        <SplitCard
          label="今日盈亏"
          value={signedPrice(report.dayPnl, ccy)}
          hint={`相对市值 ${formatPct(report.dayPnlPct)}`}
          tone={report.dayPnl >= 0 ? "up" : "down"}
        />
      </div>

      {split > 0 ? (
        <div className="mt-4">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full",
                report.unrealized >= 0 ? "bg-up" : "bg-down",
              )}
              style={{ width: `${uShare * 100}%` }}
            />
            <div
              className={cn(
                "h-full",
                report.realized >= 0 ? "bg-bone" : "bg-down",
              )}
              style={{ width: `${rShare * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {mixed
              ? "浮动与已实现方向相反，总盈亏为两者轧差。"
              : `浮动占 ${Math.round(uShare * 100)}% · 已实现占 ${Math.round(rShare * 100)}%`}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ReportMetrics({ report }: { report: BookReport }) {
  const ccy = report.currency;
  const winLabel =
    report.openCount > 0
      ? `${report.winCount} 盈 / ${report.loseCount} 亏${report.flatCount ? ` / ${report.flatCount} 平` : ""}`
      : "无持仓";
  return (
    <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)] sm:p-6">
      <p className="text-xs tracking-widest text-muted-foreground">仓位与资金</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="当前市值" value={formatPrice(report.value, ccy)} />
        <Mini label="持仓成本" value={formatPrice(report.cost, ccy)} />
        <Mini label="累计买入" value={formatPrice(report.buySpend, ccy)} />
        <Mini label="累计卖出" value={formatPrice(report.sellProceeds, ccy)} />
        <Mini label="净投入" value={formatPrice(report.netInvested, ccy)} />
        <Mini
          label="买卖笔数"
          value={`${report.buyCount} 买 / ${report.sellCount} 卖`}
        />
        <Mini
          label="持仓胜率"
          value={report.openCount > 0 ? formatPct(report.winRate) : "—"}
          hint={winLabel}
        />
        <Mini
          label="开仓 / 了结"
          value={`${report.openCount} / ${report.closedCount}`}
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        总盈亏 = 市值 − 净投入。收益率按累计买入计算，净投入已扣掉卖出回笼的现金。
      </p>
    </div>
  );
}

function ReportStructure({
  report,
  onOpenSymbol,
}: {
  report: BookReport;
  onOpenSymbol: (symbol: string) => void;
}) {
  const ccy = report.currency;
  const best = report.best;
  const worst =
    report.worst && report.best && report.worst.symbol !== report.best.symbol
      ? report.worst
      : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)] sm:p-6">
        <p className="text-xs tracking-widest text-muted-foreground">仓位结构</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Mini
            label="最大仓"
            value={report.maxWeight > 0 ? `${(report.maxWeight * 100).toFixed(1)}%` : "—"}
            hint={best ? displayName(best.symbol) : undefined}
          />
          <Mini
            label="前三集中度"
            value={
              report.top3Weight > 0 ? `${(report.top3Weight * 100).toFixed(1)}%` : "—"
            }
          />
        </div>
        {report.markets.length > 0 ? (
          <ul className="mt-5 space-y-3">
            {report.markets.map((m) => (
              <li key={m.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{m.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {(m.weight * 100).toFixed(1)}%
                    <span
                      className={cn(
                        "ml-2",
                        m.pnl >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {signedPrice(m.pnl, ccy)}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-bone"
                    style={{ width: `${Math.min(100, m.weight * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">暂无未平仓，市场结构为空。</p>
        )}
        {best ? (
          <p className="mt-4 text-xs text-muted-foreground">
            浮盈最多 {displayName(best.symbol)} {signedPrice(best.pnl, best.currency)}
            {worst ? (
              <>
                {" "}
                · {worst.pnl < 0 ? "浮亏最多" : "浮盈较少"} {displayName(worst.symbol)}{" "}
                {signedPrice(worst.pnl, worst.currency)}
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)] sm:p-6">
        <p className="text-xs tracking-widest text-muted-foreground">盈亏贡献</p>
        {report.contributions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">还没有可拆分的盈亏。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {report.contributions.slice(0, 8).map((c) => (
              <li key={c.symbol}>
                <button
                  type="button"
                  onClick={() => onOpenSymbol(c.symbol)}
                  className="flex w-full items-baseline justify-between gap-3 text-left text-sm"
                >
                  <span className="min-w-0 truncate">
                    {displayName(c.symbol)}
                    {!c.open ? (
                      <span className="ml-2 text-xs text-muted-foreground">已了结</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      c.total >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {signedPrice(c.total, ccy)}
                  </span>
                </button>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      c.total >= 0 ? "bg-up" : "bg-down",
                    )}
                    style={{ width: `${Math.min(100, c.share * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  浮动 {signedPrice(c.unrealized, ccy)}
                  <span className="mx-1.5">·</span>
                  已实现 {signedPrice(c.realized, ccy)}
                  <span className="mx-1.5">·</span>
                  占绝对额 {(c.share * 100).toFixed(0)}%
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SplitCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg bg-secondary p-4">
      <p className="text-xs tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-medium tabular-nums",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className="text-xs tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm leading-snug tabular-nums",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 tabular-nums",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </p>
    </div>
  );
}
