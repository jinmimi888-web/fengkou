import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFearGreed } from "@/lib/finance/api";
import { relativeTime } from "@/lib/finance/tech";
import type { FearGreedIndex, FearGreedResult } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const QUERY_KEY = ["fear-greed"] as const;

let pendingFresh = false;

function toneFor(value: number): "fear" | "neutral" | "greed" {
  if (value <= 45) return "fear";
  if (value >= 55) return "greed";
  return "neutral";
}

function Gauge({ value, compact }: { value: number; compact?: boolean }) {
  const tone = toneFor(value);
  return (
    <div className={cn(compact ? "min-w-[88px] flex-1" : "min-w-[140px] flex-1 sm:min-w-[220px] sm:max-w-xs")}>
      {!compact ? (
        <div className="mb-1 flex items-center justify-between text-[10px] tracking-widest text-muted-foreground">
          <span>恐慌</span>
          <span>贪婪</span>
        </div>
      ) : null}
      <div className={cn("relative overflow-hidden rounded-full bg-secondary", compact ? "h-1.5" : "h-2")}>
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              "linear-gradient(90deg, #c07a72 0%, #b89a74 45%, #6f9e8a 100%)",
          }}
        />
        <div
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-[var(--shadow-border-hover)]",
            compact ? "size-2.5" : "size-3",
            tone === "fear" && "bg-down",
            tone === "greed" && "bg-up",
            tone === "neutral" && "bg-bone",
          )}
          style={{ left: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function Readouts({ data, compact }: { data: FearGreedIndex; compact?: boolean }) {
  const greed = data.value;
  const fear = 100 - data.value;
  const tone = toneFor(data.value);
  if (compact) {
    return (
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            tone === "fear" && "text-down",
            tone === "greed" && "text-up",
            tone === "neutral" && "text-bone",
          )}
        >
          {greed}
        </span>
        <span
          className={cn(
            "text-[11px]",
            tone === "fear" && "text-down",
            tone === "greed" && "text-up",
            tone === "neutral" && "text-bone",
          )}
        >
          {data.classificationZh}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">恐 {fear}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] tracking-widest text-muted-foreground">贪婪指数</span>
        <span className="text-sm tabular-nums text-up">{greed}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] tracking-widest text-muted-foreground">恐慌指数</span>
        <span className="text-sm tabular-nums text-down">{fear}</span>
      </div>
      <span
        className={cn(
          "text-xs font-medium",
          tone === "fear" && "text-down",
          tone === "greed" && "text-up",
          tone === "neutral" && "text-bone",
        )}
      >
        {data.classificationZh}
      </span>
    </div>
  );
}

function useFearGreed() {
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const fresh = pendingFresh;
      pendingFresh = false;
      return fetchFearGreed({ data: { fresh } });
    },
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: true,
  });

  async function refresh() {
    pendingFresh = true;
    await q.refetch();
  }

  return { q, refresh };
}

/** Header strip: Alternative.me Crypto Fear & Greed (single index, dual poles). */
export function FearGreedPulse({
  board,
  compact,
}: {
  board: "equity" | "crypto";
  compact?: boolean;
}) {
  const { q, refresh } = useFearGreed();
  const result = q.data as FearGreedResult | undefined;
  const loading = q.isPending && !result;

  if (compact) {
    return (
      <div className="flex min-w-[168px] shrink-0 flex-col justify-center gap-1 rounded-xl border border-white/45 bg-white/35 px-2.5 py-1.5 backdrop-blur-md dark:border-border/70 dark:bg-secondary/25">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] tracking-widest text-muted-foreground">恐慌贪婪</span>
          {board === "equity" ? (
            <span className="text-[9px] text-muted-foreground">加密对照</span>
          ) : null}
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-foreground"
            disabled={q.isFetching}
            onClick={() => void refresh()}
            aria-label="刷新恐慌贪婪"
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

  return (
    <div className="flex w-full flex-col gap-2 border-t border-border bg-card/60 px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs tracking-widest text-muted-foreground">市场情绪</span>
        {board === "equity" ? (
          <span className="text-[11px] text-muted-foreground">
            暂无可靠免费股市 Fear & Greed · 显示加密指数
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">加密市场</span>
        )}
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
            : "情绪指数暂时无法获取，请稍后重试"}
        </p>
      )}
      {result?.ok ? (
        <p className="text-[10px] text-muted-foreground">
          同一指数两极读数：贪婪指数 = 原值（0–100），恐慌指数 = 100 − 原值；非两套独立接口。
        </p>
      ) : null}
    </div>
  );
}
