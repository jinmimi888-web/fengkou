import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl bg-secondary/80 shimmer", className)}
      {...props}
    />
  );
}

export { Skeleton };
