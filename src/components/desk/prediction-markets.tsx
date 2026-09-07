import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPredictionMarkets } from "@/lib/finance/api";
import { relativeTime } from "@/lib/finance/tech";
import type {
  PredictionCategory,
  PredictionMarketItem,
  PredictionMarketsBundle,
  PredictionPlatform,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const QUERY_KEY = ["prediction-markets"] as const;

let pendingFresh = false;

type TabKey = "all" | PredictionCategory;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "macro", label: "股市宏观" },
  { key: "crypto", label: "数字货币" },
];

function formatUsdCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${Math.round(abs).toLocaleString("en-US")}`;
}

function platformTone(p: PredictionPlatform): string {
  if (p === "polymarket") return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  if (p === "kalshi") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
}

function ProbBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const tone =
    clamped >= 60 ? "bg-up" : clamped <= 40 ? "bg-down" : "bg-bone";
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full opacity-90", tone)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground">
        {clamped.toFixed(clamped % 1 === 0 ? 0 : 1)}%
      </span>
    </div>
  );
}

function MarketCard({ item }: { item: PredictionMarketItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border-b border-border/50 px-2.5 py-2 last:border-b-0 hover:bg-secondary/40"
    >
      <div className="flex items-start gap-1.5">
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded px-1 py-px text-[9px] tracking-wide",
            platformTone(item.platform),
          )}
        >
          {item.platformLabel}
        </span>
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-foreground">
          {item.title}
        </p>
        <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      </div>
      <ProbBar value={item.yesProb} />
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>Yes 隐含概率</span>
        {item.volume != null ? (
          <span className="tabular-nums">量 {formatUsdCompact(item.volume)}</span>
        ) : null}
        {item.liquidity != null && item.liquidity > 0 ? (
          <span className="tabular-nums">液 {formatUsdCompact(item.liquidity)}</span>
        ) : null}
        <span className="text-muted-foreground/80">
          {item.category === "crypto" ? "加密" : "宏观"}
        </span>
      </div>
    </a>
  );
}

function usePredictionMarkets() {
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const fresh = pendingFresh;
      pendingFresh = false;
      return fetchPredictionMarkets({ data: { fresh } });
    },
    staleTime: 12 * 60_000,
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: true,
  });

  async function refresh() {
    pendingFresh = true;
    await q.refetch();
  }

  return { q, refresh };
}

function venueNotes(bundle: PredictionMarketsBundle | undefined): string[] {
  if (!bundle) return [];
  const notes: string[] = [];
  for (const [label, v] of [
    ["Polymarket", bundle.polymarket],
    ["Kalshi", bundle.kalshi],
    ["Manifold", bundle.manifold],
  ] as const) {
    if (!v.ok) notes.push(`${label}：${v.error}`);
    else if (v.noteZh) notes.push(`${label}：${v.noteZh}`);
  }
  return notes;
}

/** Right-rail / desk panel: multi-venue prediction market odds. */
export function PredictionMarketsPanel({
  board,
}: {
  board: "equity" | "crypto";
}) {
  const { q, refresh } = usePredictionMarkets();
  const bundle = q.data as PredictionMarketsBundle | undefined;
  const loading = q.isPending && !bundle;
  const fetching = q.isFetching;

  const defaultTab: TabKey = board === "crypto" ? "crypto" : "macro";
  const [tab, setTab] = useState<TabKey>(defaultTab);

  useEffect(() => {
    setTab(board === "crypto" ? "crypto" : "macro");
  }, [board]);

  const rows = useMemo(() => {
    const items = bundle?.items ?? [];
    if (tab === "all") return items.slice(0, 16);
    return items.filter((i) => i.category === tab).slice(0, 14);
  }, [bundle?.items, tab]);

  const notes = venueNotes(bundle);

  return (
    <div className="flex max-h-[min(42vh,380px)] min-h-[200px] flex-col overflow-hidden rounded-md border border-border/70 bg-card/60 xl:max-h-[320px]">
      <div className="flex items-center gap-2 border-b border-border/70 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] tracking-widest text-muted-foreground">市场预测</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {bundle?.updatedAt
              ? `${relativeTime(bundle.updatedAt) || "刚刚"}更新`
              : fetching
                ? "拉取中"
                : "Polymarket · Kalshi · Manifold"}
          </p>
        </div>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          disabled={fetching}
          onClick={() => void refresh()}
          aria-label="刷新预测市场"
        >
          <RefreshCw className={cn("size-3.5", fetching && "animate-spin")} />
        </button>
      </div>

      <div className="flex gap-1 border-b border-border/50 px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] tracking-wide",
              tab === t.key
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="space-y-2 p-3 text-[11px] text-muted-foreground">
            <p>暂无可用赔率</p>
            {notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        ) : (
          <div>
            {rows.map((item) => (
              <MarketCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 px-2.5 py-1.5 text-[9px] leading-relaxed text-muted-foreground">
        <p>{bundle?.disclaimerZh ?? "预测市场赔率≠投资建议"}</p>
        <p className="mt-0.5 opacity-80">
          来源：Polymarket Gamma · Kalshi trade-api · Manifold 公开接口
        </p>
        {notes.length > 0 && rows.length > 0 ? (
          <p className="mt-0.5 opacity-80">{notes.join("；")}</p>
        ) : null}
      </div>
    </div>
  );
}
