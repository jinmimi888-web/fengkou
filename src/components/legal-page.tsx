import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <header className="glass-nav border-b border-white/40 dark:border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
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
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            返回首页
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-lg [&_h2]:text-foreground [&_strong]:text-foreground/90">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
