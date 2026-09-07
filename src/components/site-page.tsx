import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";

export function SitePage({
  title,
  subtitle,
  children,
  actions,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <header className="glass-nav border-b border-white/40 dark:border-border">
        <div
          className={cn(
            "mx-auto flex items-center justify-between gap-4 px-4 py-4 sm:px-6",
            wide ? "max-w-5xl" : "max-w-3xl",
          )}
        >
          <Link to="/" className="flex items-center gap-3 hover:opacity-90">
            <img
              src="/logo.png"
              alt="锋口"
              width={40}
              height={40}
              className="size-10 rounded-xl object-cover shadow-[var(--shadow-border)]"
            />
            <div>
              <p className="font-serif text-xl leading-none tracking-tight">锋口</p>
              <p className="mt-1 text-[11px] tracking-[0.18em] text-muted-foreground">
                入场研判台
              </p>
            </div>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
            {actions}
            <Link to="/posts" className="text-muted-foreground hover:text-foreground">
              文章
            </Link>
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              返回首页
            </Link>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full flex-1 px-4 py-10 sm:px-6",
          wide ? "max-w-5xl" : "max-w-3xl",
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-8">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
