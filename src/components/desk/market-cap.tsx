import { useRef } from "react";
import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMarketCap } from "@/lib/finance/api";
import { isCrypto } from "@/lib/finance/catalog";
import { relativeTime } from "@/lib/finance/tech";
import type { MarketCapAnalysis, MarketCapResult } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

function formatMcap(v: number, currency: string): string {
  const abs = Math.abs(v);
  const c = currency || "USD";
  const prefix = c === "USD" ? "$" : `${c} `;
  if (abs >= 1e12) return `${prefix}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${prefix}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${prefix}${(abs / 1e6).toFixed(1)}M`;
  return `${prefix}${Math.round(abs).toLocaleString("en-US")}`;
}

function formatShares(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return Math.round(v).toLocaleString("en-US");
}

function Readouts({ data }: { data: MarketCapAnalysis }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {data.marketCap != null ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] tracking-widest text-muted-foreground">市值</span>
          <span className="text-sm font-medium tabular-nums text-bone">
            {formatMcap(data.marketCap, data.currency)}
          </span>
        </div>
      ) : null}
      {data.floatMarketCap != null ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] tracking-widest text-muted-foreground">流通</span>
          <span className="text-sm tabular-nums text-foreground">
            {formatMcap(data.floatMarketCap, data.currency)}
          </span>
        </div>
      ) : null}
      {data.sizeClassZh ? (
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-bone">
          {data.sizeClassZh}
        </span>
      ) : null}
      {data.sharesOutstanding != null ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] tracking-widest text-muted-foreground">总股本</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {formatShares(data.sharesOutstanding)}
          </span>
        </div>
      ) : null}
      {data.floatShares != null ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] tracking-widest text-muted-foreground">流通股</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {formatShares(data.floatShares)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Selected-symbol market-cap analysis (stocks priority). */
export function MarketCapPulse({ symbol }: { symbol: string }) {
  const crypto = isCrypto(symbol);
  const pendingFresh = useRef(false);

  const q = useQuery({
    queryKey: ["market-cap", symbol],
    queryFn: async () => {
      const fresh = pendingFresh.current;
      pendingFresh.current = false;
      return fetchMarketCap({ data: { symbol, fresh } });
    },
    enabled: Boolean(symbol),
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: true,
  });

  const result = q.data as MarketCapResult | undefined;
  const loading = q.isPending && !result;

  return (
    <div className="glass glass-tight border border-white/50 px-3 py-2 dark:border-border/70">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[10px] tracking-widest text-muted-foreground">市值分析</span>
        <span className="text-[10px] text-muted-foreground">
          {crypto ? "加密" : "股票"}
        </span>
        {result?.ok ? (
          <span className="text-[10px] text-muted-foreground">
            {relativeTime(result.data.timestamp) || "刚刚"}
          </span>
        ) : q.isFetching ? (
          <span className="text-[10px] text-muted-foreground">拉取中</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
          disabled={q.isFetching}
          onClick={() => {
            pendingFresh.current = true;
            void q.refetch();
          }}
        >
          <RefreshCw className={cn("size-3", q.isFetching && "animate-spin")} />
          刷新
        </Button>
      </div>

      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-full rounded" />
      ) : result?.ok ? (
        <div className="mt-1.5 flex flex-col gap-1">
          <Readouts data={result.data} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <a
              href={result.data.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-bone underline-offset-2 hover:underline"
            >
              来源 {result.data.source}
            </a>
            {result.data.noteZh ? (
              <p className="text-[10px] text-muted-foreground">{result.data.noteZh}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-down">
          {result && !result.ok ? result.error : "市值数据暂时无法获取"}
        </p>
      )}
    </div>
  );
}
