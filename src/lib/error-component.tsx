import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <span className="text-down" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-serif text-2xl">页面出了点问题</h1>
      <p className="max-w-md text-sm break-words text-muted-foreground">
        {error.message || "发生了意外错误，请刷新后再试。"}
      </p>
    </main>
  );
}

export function AppNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <p className="font-serif text-2xl">没有这个页面</p>
        <p className="mt-2 text-sm text-muted-foreground">回到锋口首页继续研判。</p>
        <a href="/" className="mt-5 inline-block text-sm text-bone hover:underline">
          返回首页
        </a>
      </div>
    </main>
  );
}
