import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchContractIndex } from "@/lib/finance/api";
import { relativeTime } from "@/lib/finance/tech";
import type { ContractIndex, ContractIndexResult } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const QUERY_KEY = ["contract-index"] as const;

let pendingFresh = false;

function toneFor(value: number): "short" | "neutral" | "long" {
  if (value <= 40) return "short";
  if (value >= 60) return "long";
  return "neutral";
}

function formatFundingPct(rate: number): string {
  const pct = rate * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(4)}%`;
}

function formatOiUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

function formatOiChange(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

function Gauge({ value, compact }: { value: number; compact?: boolean }) {
  const tone = toneFor(value);
  return (
    <div className={cn(compact ? "min-w-[88px] flex-1" : "min-w-[140px] flex-1 sm:min-w-[220px] sm:max-w-xs")}>
      {!compact ? (
        <div className="mb-1 flex items-center justify-between text-[10px] tracking-widest text-muted-foreground">
          <span>空头拥挤</span>
          <span>多头过热</span>
        </div>
      ) : null}
      <div className={cn("relative overflow-hidden rounded-full bg-secondary", compact ? "h-1.5" : "h-2")}>
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              "linear-gradient(90deg, #6a9bb8 0%, #b89a74 45%, #c07a72 100%)",
          }}
        />
        <div
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-[var(--shadow-border-hover)]",
            compact ? "size-2.5" : "size-3",
            tone === "short" && "bg-up",
            tone === "long" && "bg-down",
            tone === "neutral" && "bg-bone",
          )}
          style={{ left: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function Readouts({ data, compact }: { data: ContractIndex; compact?: boolean }) {
  const tone = toneFor(data.value);
  if (compact) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            tone === "short" && "text-up",
            tone === "long" && "text-down",
            tone === "neutral" && "text-bone",
          )}
        >
          {data.value}
        </span>
        <span
          className={cn(
            "text-[11px]",
            tone === "short" && "text-up",
            tone === "long" && "text-down",
            tone === "neutral" && "text-bone",
          )}
        >
          {data.classificationZh}
        </span>
        <span
          className={cn(
            "text-[10px] tabular-nums",
            data.fundingRate > 0 && "text-down",
            data.fundingRate < 0 && "text-up",
            data.fundingRate === 0 && "text-muted-foreground",
          )}
        >
          费率 {formatFundingPct(data.fundingRate)}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          多空 {data.longShortRatio.toFixed(2)}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] tracking-widest text-muted-foreground">合约指数</span>
        <span
          className={cn(
            "text-sm tabular-nums font-medium",
            tone === "short" && "text-up",
            tone === "long" && "text-down",
            tone === "neutral" && "text-bone",
          )}
        >
          {data.value}
        </span>
      </div>
      <span
        className={cn(
          "text-xs font-medium",
          tone === "short" && "text-up",
          tone === "long" && "text-down",
          tone === "neutral" && "text-bone",
        )}
      >
        {data.classificationZh}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] tracking-widest text-muted-foreground">资金费率</span>
        <span
          className={cn(
            "text-sm tabular-nums",
            data.fundingRate > 0 && "text-down",
            data.fundingRate < 0 && "text-up",
            data.fundingRate === 0 && "text-bone",
          )}
        >
          {formatFundingPct(data.fundingRate)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] tracking-widest text-muted-foreground">多空比</span>
        <span className="text-sm tabular-nums text-foreground">
          {data.longShortRatio.toFixed(2)}
        </span>
      </div>
      {data.oiUsd != null ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] tracking-widest text-muted-foreground">持仓额</span>
          <span className="text-sm tabular-nums text-foreground">
            {formatOiUsd(data.oiUsd)}
            {data.oiChangePct24h != null ? (
              <span
                className={cn(
                  "ml-1 text-[11px]",
                  data.oiChangePct24h > 0 && "text-down",
                  data.oiChangePct24h < 0 && "text-up",
                  data.oiChangePct24h === 0 && "text-muted-foreground",
                )}
              >
                {formatOiChange(data.oiChangePct24h)}/24h
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function useContractIndex(enabled: boolean) {
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const fresh = pendingFresh;
      pendingFresh = false;
      return fetchContractIndex({ data: { fresh } });
    },
    enabled,
    staleTime: 15 * 60_000,
    refetchInterval: 20 * 60_000,
    refetchOnWindowFocus: true,
  });

  async function refresh() {
    pendingFresh = true;
    await q.refetch();
  }

  return { q, refresh };
}

/** Crypto-board header: OKX BTC perpetual 合约指数 (funding + long/short). */
export function ContractIndexPulse({
  board,
  compact,
}: {
  board: "equity" | "crypto";
  compact?: boolean;
}) {
  const enabled = board === "crypto";
  const { q, refresh } = useContractIndex(enabled);
  const result = q.data as ContractIndexResult | undefined;
  const loading = enabled && q.isPending && !result;

  if (compact) {
    if (board === "equity") {
      return (
        <div className="flex min-w-[140px] shrink-0 flex-col justify-center gap-0.5 rounded-xl border border-white/35 bg-white/25 px-2.5 py-1.5 opacity-70 backdrop-blur-md dark:border-border/50 dark:bg-secondary/15">
          <span className="text-[10px] tracking-widest text-muted-foreground">合约指数</span>
          <span className="text-[10px] text-muted-foreground">股票看板不适用</span>
        </div>
      );
    }
    return (
      <div className="flex min-w-[190px] shrink-0 flex-col justify-center gap-1 rounded-xl border border-white/45 bg-white/35 px-2.5 py-1.5 backdrop-blur-md dark:border-border/70 dark:bg-secondary/25">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] tracking-widest text-muted-foreground">合约情绪</span>
          <span className="text-[9px] text-muted-foreground">BTC·OKX</span>
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-foreground"
            disabled={q.isFetching}
            onClick={() => void refresh()}
            aria-label="刷新合约指数"
          >
            <RefreshCw className={cn("size-3", q.isFetching && "animate-spin")} />
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-5 w-full rounded" />
        ) : result?.ok ? (
          <>
            <Readouts data={result.data} compact />
            <Gauge value={result.data.value} compact />
          </>
        ) : (
          <p className="text-[10px] text-down">
            {result && !result.ok ? result.error : "暂不可用"}
          </p>
        )}
      </div>
    );
  }

  if (board === "equity") {
    return (
      <div className="flex w-full flex-col gap-1 border-t border-border bg-card/40 px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs tracking-widest text-muted-foreground">合约指数</span>
          <span className="text-[11px] text-muted-foreground">
            仅虚拟货币看板可用 · 股票看板不适用
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 border-t border-border bg-card/60 px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs tracking-widest text-muted-foreground">合约情绪</span>
        <span className="text-[11px] text-muted-foreground">BTC 永续 · OKX</span>
        {result?.ok ? (
          <span className="text-xs text-muted-foreground">
            {relativeTime(result.data.timestamp) || "刚刚"}更新
          </span>
        ) : q.isFetching ? (
          <span className="text-xs text-muted-foreground">正在拉取</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground"
          disabled={q.isFetching}
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn("size-3", q.isFetching && "animate-spin")} />
          刷新
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-8 w-full rounded-md" />
      ) : result?.ok ? (
        <div className="flex flex-wrap items-center gap-4">
          <Readouts data={result.data} />
          <Gauge value={result.data.value} />
          <a
            href={result.data.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-bone underline-offset-2 hover:underline"
          >
            来源 {result.data.source}
          </a>
        </div>
      ) : (
        <p className="text-xs text-down">
          {result && !result.ok
            ? result.error
            : "合约指数暂时无法获取，请稍后重试"}
        </p>
      )}
      {result?.ok ? (
        <p className="text-[10px] text-muted-foreground">{result.data.formulaZh}</p>
      ) : null}
    </div>
  );
}
