import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-muted-foreground",
        up: "border-transparent bg-up/12 text-up",
        down: "border-transparent bg-down/12 text-down",
        wait: "border-transparent bg-bone/15 text-bone",
        warn: "border-transparent bg-warn/15 text-warn",
        outline: "border-border/80 text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
