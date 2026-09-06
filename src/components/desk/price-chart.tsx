import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/finance/tech";
import type { Bar } from "@/lib/finance/types";

const RANGES = [
  { id: "1M", days: 22, label: "近1月" },
  { id: "3M", days: 66, label: "近3月" },
  { id: "6M", days: 132, label: "近6月" },
] as const;

export function PriceChart({
  bars,
  currency,
}: {
  bars: Bar[];
  currency: string;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("6M");
  const days = RANGES.find((r) => r.id === range)?.days ?? 132;
  const data = useMemo(() => {
    const slice = bars.slice(-days);
    return slice.map((b) => ({
      t: b.t,
      c: b.c,
      label: new Date(b.t).toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
      }),
    }));
  }, [bars, days]);
  const up = (data.at(-1)?.c ?? 0) >= (data[0]?.c ?? 0);
  const stroke = up ? "var(--color-up)" : "var(--color-down)";
  const fill = up ? "var(--color-up)" : "var(--color-down)";

  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          走势
        </p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs",
                range === r.id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-48">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            暂无走势
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="px" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={fill} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={fill} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide />
              <YAxis
                domain={["auto", "auto"]}
                width={64}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-foreground)",
                  fontSize: 12,
                }}
                formatter={(value) => [
                  formatPrice(Number(value), currency),
                  "收盘",
                ]}
              />
              <Area
                type="monotone"
                dataKey="c"
                stroke={stroke}
                strokeWidth={1.6}
                fill="url(#px)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
