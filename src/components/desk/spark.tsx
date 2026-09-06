import { cn } from "@/lib/utils";

export function Spark({
  values,
  positive,
  className,
}: {
  values: number[];
  positive?: boolean;
  className?: string;
}) {
  if (values.length < 2) {
    return <div className={cn("h-8 w-16", className)} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 72;
  const h = 28;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const color = positive ? "var(--color-up)" : "var(--color-down)";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-8 w-[4.5rem]", className)}
      aria-hidden
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
