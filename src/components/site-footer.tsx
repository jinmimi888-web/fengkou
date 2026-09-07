import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/posts" as const, label: "文章" },
  { to: "/about" as const, label: "关于锋口" },
  { to: "/privacy" as const, label: "隐私政策" },
  { to: "/terms" as const, label: "用户协议" },
];

export function SiteFooter({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <footer
      className={cn(
        "border-t border-border text-xs leading-relaxed text-muted-foreground",
        compact ? "px-4 py-5 text-center" : "px-4 py-6 sm:px-6",
        className,
      )}
    >
      <div className={cn("mx-auto max-w-[1400px]", compact ? "" : "text-center")}>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className="font-serif text-sm text-foreground/80">锋口</span>
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {!compact ? (
          <p className="mt-3 max-w-2xl mx-auto">
            锋口汇集股票与虚拟货币的公开行情与新闻，并由模型做多维研判。
            内容不构成投资建议，不保证收益。入场有风险，仓位需你自己负责。
          </p>
        ) : (
          <p className="mt-2">内容不构成投资建议。账户资料只属于你自己。</p>
        )}
      </div>
    </footer>
  );
}
