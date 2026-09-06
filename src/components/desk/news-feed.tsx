import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { displayName } from "@/lib/finance/catalog";
import { relativeTime } from "@/lib/finance/tech";
import type { NewsItem } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const HOUR = 60 * 60 * 1000;

function isFresh(ts: number | null, windowMs = 2 * HOUR) {
  return ts != null && Date.now() - ts < windowMs;
}

export function NewsPulse({
  items,
  updatedAt,
  fetching,
  onOpen,
}: {
  items: NewsItem[];
  updatedAt?: number;
  fetching?: boolean;
  onOpen: () => void;
}) {
  if (!items.length && !fetching) return null;
  const top = items.slice(0, 3);
  const freshCount = items.filter((n) => isFresh(n.publishedAt, 6 * HOUR)).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1.5 border-t border-border bg-card/80 px-4 py-2.5 text-left sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs tracking-widest text-muted-foreground">动态</span>
        {freshCount > 0 ? (
          <span className="text-xs tabular-nums text-bone">{freshCount} 条近 6 小时</span>
        ) : (
          <span className="text-xs text-muted-foreground">观察池新闻</span>
        )}
        {updatedAt ? (
          <span className="text-xs text-muted-foreground">
            {fetching ? "正在收集" : `${relativeTime(updatedAt) || "刚刚"}更新`}
          </span>
        ) : fetching ? (
          <span className="text-xs text-muted-foreground">正在收集</span>
        ) : null}
      </div>
      {top.length ? (
        <div className="hidden min-w-0 gap-x-6 sm:flex">
          {top.map((n) => (
            <p key={n.id} className="min-w-0 flex-1 truncate text-xs">
              <span className="text-bone">{displayName(n.symbol)}</span>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <span className="text-muted-foreground">{n.title}</span>
            </p>
          ))}
        </div>
      ) : null}
      {top[0] ? (
        <p className="truncate text-xs text-muted-foreground sm:hidden">
          <span className="text-bone">{displayName(top[0].symbol)}</span>
          <span className="mx-1.5">·</span>
          {top[0].title}
        </p>
      ) : null}
    </button>
  );
}

export function NewsDesk({
  items,
  symbols,
  loading,
  fetching,
  updatedAt,
  onRefresh,
  onOpenSymbol,
}: {
  items: NewsItem[];
  symbols: string[];
  loading: boolean;
  fetching: boolean;
  updatedAt?: number;
  onRefresh: () => void;
  onOpenSymbol: (symbol: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const visible = useMemo(
    () => (filter ? items.filter((n) => n.symbol === filter) : items),
    [items, filter],
  );
  const chips = ["", ...symbols];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-muted-foreground">动态</p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight">最新新闻</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            自动收集观察池与持仓的公开新闻，约每 3 分钟更新一次。
            {updatedAt ? ` 上次 ${relativeTime(updatedAt) || "刚刚"}。` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={fetching}
          className="min-w-28"
        >
          <RefreshCw className={cn("size-4", fetching && "animate-spin")} />
          {fetching ? "收集中" : "立即刷新"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
        {chips.map((sym) => (
          <button
            key={sym || "all"}
            type="button"
            onClick={() => setFilter(sym)}
            className={cn(
              "h-9 rounded-md px-3 text-sm",
              filter === sym
                ? "bg-card text-foreground shadow-[var(--shadow-border)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {sym ? displayName(sym) : "全部"}
          </button>
        ))}
      </div>
      <NewsList
        items={visible}
        loading={loading}
        empty={filter ? "这只股票暂时没有抓到新闻" : "观察池新闻正在汇集"}
        showSymbol={!filter}
        onOpenSymbol={onOpenSymbol}
      />
    </div>
  );
}

export function NewsList({
  items,
  loading,
  empty,
  showSymbol,
  onOpenSymbol,
}: {
  items: NewsItem[];
  loading: boolean;
  empty: string;
  showSymbol?: boolean;
  onOpenSymbol?: (symbol: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-border)]">
        {empty}
      </div>
    );
  }

  const hour: NewsItem[] = [];
  const today: NewsItem[] = [];
  const earlier: NewsItem[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const todayStart = start.getTime();
  for (const n of items) {
    const t = n.publishedAt ?? 0;
    if (t && Date.now() - t < HOUR) hour.push(n);
    else if (t && t >= todayStart) today.push(n);
    else earlier.push(n);
  }
  const groups: { label: string; rows: NewsItem[] }[] = [
    { label: "一小时内", rows: hour },
    { label: "今天", rows: today },
    { label: "更早", rows: earlier },
  ].filter((g) => g.rows.length);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.label}>
          <p className="mb-2 px-1 text-xs tracking-widest text-muted-foreground">
            {g.label}
            <span className="ml-2 tabular-nums">{g.rows.length}</span>
          </p>
          <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
            {g.rows.map((n, i) => (
              <li key={`${n.id}-${i}`} className="border-b border-border last:border-0">
                <div className="flex items-start gap-2 px-4 py-3">
                  <a
                    href={n.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 hover:text-bone"
                  >
                    <p className="font-serif text-[15px] leading-snug">{n.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {showSymbol ? (
                        <span className="text-bone">{displayName(n.symbol)}</span>
                      ) : null}
                      <span>{n.source}</span>
                      <span>{relativeTime(n.publishedAt) || ""}</span>
                      {isFresh(n.publishedAt) ? (
                        <Badge variant="up">新</Badge>
                      ) : null}
                    </p>
                  </a>
                  {onOpenSymbol && showSymbol ? (
                    <button
                      type="button"
                      onClick={() => onOpenSymbol(n.symbol)}
                      className="mt-0.5 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      研判
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}