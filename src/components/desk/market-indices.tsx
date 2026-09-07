import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMarketIndices } from "@/lib/finance/api";
import { relativeTime } from "@/lib/finance/tech";
import type {
  AltcoinSeason,
  BtcBasis,
  BtcDominance,
  FundingBoard,
  Liquidations24h,
  MarketIndicesBundle,
  VixQuote,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const QUERY_KEY = ["market-indices"] as const;

let pendingFresh = false;

function formatUsdCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

function formatFundingPct(rate: number): string {
  const pct = rate * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(4)}%`;
}

function formatBasisPct(pct: number): string {
  const bps = pct * 100;
  const sign = bps > 0 ? "+" : "";
  return `${sign}${bps.toFixed(3)}%`;
}

function Tile({
  label,
  children,
  footer,
  className,
  compact,
}: {
  label: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        compact
          ? "min-w-[108px] shrink-0 rounded-xl border border-white/45 bg-white/35 px-2 py-1.5 backdrop-blur-md dark:border-border/70 dark:bg-secondary/25"
          : "min-w-[140px] flex-1 rounded-2xl border border-white/50 bg-white/40 px-3 py-2 shadow-[var(--shadow-border)] backdrop-blur-xl dark:border-transparent dark:bg-secondary/40",
        className,
      )}
    >
      <p className="text-[10px] tracking-widest text-muted-foreground">{label}</p>
      <div className={cn(compact ? "mt-0.5" : "mt-1")}>{children}</div>
      {footer && !compact ? (
        <div className="mt-1 text-[10px] text-muted-foreground">{footer}</div>
      ) : null}
    </div>
  );
}

function LiqTile({ data, compact }: { data: Liquidations24h; compact?: boolean }) {
  return (
    <Tile
      label="24h 爆仓"
      compact={compact}
      footer={
        <>
          {data.topSymbol ? (
            <span>
              最大 {data.topSymbol} {data.topSide === "long" ? "多" : "空"}{" "}
              {data.topUsd != null ? formatUsdCompact(data.topUsd) : ""}
            </span>
          ) : (
            <span>~{data.windowHours}h · {data.source}</span>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={cn("tabular-nums text-down", compact ? "text-xs" : "text-sm")}>
          多 {formatUsdCompact(data.longUsd)}
        </span>
        <span className={cn("tabular-nums text-up", compact ? "text-xs" : "text-sm")}>
          空 {formatUsdCompact(data.shortUsd)}
        </span>
      </div>
    </Tile>
  );
}

function DomTile({ data, compact }: { data: BtcDominance; compact?: boolean }) {
  return (
    <Tile label="BTC 占比" compact={compact} footer={data.source}>
      <span className={cn("font-medium tabular-nums text-bone", compact ? "text-sm" : "text-lg")}>
        {data.dominancePct.toFixed(2)}%
      </span>
    </Tile>
  );
}

function AltTile({ data, compact }: { data: AltcoinSeason; compact?: boolean }) {
  const tone =
    data.value >= 75 ? "text-up" : data.value <= 25 ? "text-down" : "text-bone";
  return (
    <Tile
      label="山寨季"
      compact={compact}
      footer={
        <>
          {data.classificationZh} · {data.periodLabelZh}
          {data.mode === "proxy" ? " · 代理" : ""}
        </>
      }
    >
      <span className={cn("font-medium tabular-nums", tone, compact ? "text-sm" : "text-lg")}>
        {data.value}
      </span>
      {compact ? (
        <span className="ml-1 text-[10px] text-muted-foreground">{data.classificationZh}</span>
      ) : null}
    </Tile>
  );
}

function VixTile({ data, compact }: { data: VixQuote; compact?: boolean }) {
  const up = (data.changePct ?? 0) >= 0;
  return (
    <Tile label="VIX" compact={compact} footer={data.source}>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("font-medium tabular-nums text-bone", compact ? "text-sm" : "text-lg")}>
          {data.value.toFixed(2)}
        </span>
        {data.changePct != null ? (
          <span className={cn("text-[10px] tabular-nums", up ? "text-down" : "text-up")}>
            {up ? "+" : ""}
            {(data.changePct * 100).toFixed(2)}%
          </span>
        ) : null}
      </div>
    </Tile>
  );
}

function FundingTile({ data, compact }: { data: FundingBoard; compact?: boolean }) {
  const pos = data.topPositive[0];
  const neg = data.topNegative[0];
  return (
    <Tile label="费率榜" compact={compact} footer={data.source}>
      <div className={cn("flex flex-col gap-0.5 tabular-nums", compact ? "text-[11px]" : "text-sm")}>
        {pos ? (
          <span className="text-down">
            {pos.symbol} {formatFundingPct(pos.fundingRate)}
          </span>
        ) : (
          <span className="text-muted-foreground">无显著正费率</span>
        )}
        {neg ? (
          <span className="text-up">
            {neg.symbol} {formatFundingPct(neg.fundingRate)}
          </span>
        ) : (
          <span className="text-muted-foreground">无显著负费率</span>
        )}
      </div>
    </Tile>
  );
}

function BasisTile({ data, compact }: { data: BtcBasis; compact?: boolean }) {
  const prem = data.basisPct >= 0;
  return (
    <Tile
      label="基差 BTC"
      compact={compact}
      footer={`标记 ${data.markPx.toLocaleString("en-US")} / 指数 ${data.indexPx.toLocaleString("en-US")}`}
    >
      <span className={cn("font-medium tabular-nums", prem ? "text-down" : "text-up", compact ? "text-sm" : "text-lg")}>
        {formatBasisPct(data.basisPct)}
      </span>
      <span className="ml-1 text-[10px] text-muted-foreground">
        {prem ? "溢价" : "折价"}
      </span>
    </Tile>
  );
}

function ErrTile({ label, error, compact }: { label: string; error: string; compact?: boolean }) {
  return (
    <Tile label={label} compact={compact}>
      <p className="text-[10px] text-down">{error}</p>
    </Tile>
  );
}

function useMarketIndices(enabled: boolean) {
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const fresh = pendingFresh;
      pendingFresh = false;
      return fetchMarketIndices({ data: { fresh } });
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

function IndexTiles({
  board,
  bundle,
  compact,
}: {
  board: "equity" | "crypto";
  bundle: MarketIndicesBundle;
  compact?: boolean;
}) {
  if (board === "crypto") {
    return (
      <>
        {bundle.liquidations.ok ? (
          <LiqTile data={bundle.liquidations.data} compact={compact} />
        ) : (
          <ErrTile label="24h 爆仓" error={bundle.liquidations.error} compact={compact} />
        )}
        {bundle.btcDominance.ok ? (
          <DomTile data={bundle.btcDominance.data} compact={compact} />
        ) : (
          <ErrTile label="BTC 占比" error={bundle.btcDominance.error} compact={compact} />
        )}
        {bundle.altcoinSeason.ok ? (
          <AltTile data={bundle.altcoinSeason.data} compact={compact} />
        ) : (
          <ErrTile label="山寨季" error={bundle.altcoinSeason.error} compact={compact} />
        )}
        {bundle.fundingBoard.ok ? (
          <FundingTile data={bundle.fundingBoard.data} compact={compact} />
        ) : (
          <ErrTile label="费率榜" error={bundle.fundingBoard.error} compact={compact} />
        )}
        {bundle.basis.ok ? (
          <BasisTile data={bundle.basis.data} compact={compact} />
        ) : (
          <ErrTile label="基差 BTC" error={bundle.basis.error} compact={compact} />
        )}
      </>
    );
  }
  return (
    <>
      {bundle.vix.ok ? (
        <VixTile data={bundle.vix.data} compact={compact} />
      ) : (
        <ErrTile label="VIX" error={bundle.vix.error} compact={compact} />
      )}
      {bundle.btcDominance.ok ? (
        <DomTile data={bundle.btcDominance.data} compact={compact} />
      ) : (
        <ErrTile label="BTC 占比" error={bundle.btcDominance.error} compact={compact} />
      )}
      {bundle.altcoinSeason.ok ? (
        <AltTile data={bundle.altcoinSeason.data} compact={compact} />
      ) : null}
    </>
  );
}

/** Compact 「市场指数」 strip under Fear&Greed / ContractIndex. */
export function MarketIndicesPulse({
  board,
  compact,
}: {
  board: "equity" | "crypto";
  compact?: boolean;
}) {
  const { q, refresh } = useMarketIndices(true);
  const bundle = q.data as MarketIndicesBundle | undefined;
  const loading = q.isPending && !bundle;

  const footnotes: string[] = [];
  if (bundle?.liquidations.ok) footnotes.push(bundle.liquidations.data.noteZh);
  if (bundle?.altcoinSeason.ok) footnotes.push(bundle.altcoinSeason.data.noteZh);

  if (compact) {
    return (
      <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
        <div className="flex shrink-0 flex-col justify-center gap-0.5 px-0.5">
          <span className="text-[10px] tracking-widest text-muted-foreground whitespace-nowrap">
            市场指数
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            disabled={q.isFetching}
            onClick={() => void refresh()}
            aria-label="刷新市场指数"
          >
            <RefreshCw className={cn("size-3", q.isFetching && "animate-spin")} />
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-12 min-w-[200px] flex-1 rounded-md" />
        ) : bundle ? (
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5">
            <IndexTiles board={board} bundle={bundle} compact />
          </div>
        ) : (
          <p className="self-center text-[10px] text-down">指数暂不可用</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 border-t border-border bg-card/50 px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs tracking-widest text-muted-foreground">市场指数</span>
        <span className="text-[11px] text-muted-foreground">
          {board === "crypto" ? "加密看板 · VIX 隐藏" : "股票看板 · 加密指标可对照"}
        </span>
        {bundle ? (
          <span className="text-xs text-muted-foreground">
            {relativeTime(bundle.updatedAt) || "刚刚"}更新
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
        <Skeleton className="h-16 w-full rounded-md" />
      ) : bundle ? (
        <div className="flex flex-wrap gap-2">
          <IndexTiles board={board} bundle={bundle} />
        </div>
      ) : (
        <p className="text-xs text-down">市场指数暂时无法获取，请稍后重试</p>
      )}

      {footnotes.length > 0 ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {footnotes[0]}
          {footnotes[1] ? ` ${footnotes[1]}` : ""}
        </p>
      ) : null}
    </div>
  );
}
