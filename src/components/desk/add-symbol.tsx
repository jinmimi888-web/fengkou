import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchTickers } from "@/lib/finance/api";
import { normalizeSymbol, searchCatalog, displayName, exchangeLabel, type AssetKind } from "@/lib/finance/catalog";
import { useDeskStore } from "@/lib/desk-store";
import type { SearchHit } from "@/lib/finance/types";

export function AddSymbol({ compact, kind }: { compact?: boolean; kind?: AssetKind }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const addSymbol = useDeskStore((s) => s.addSymbol);
  const local = searchCatalog(q, 8, kind);
  const search = useMutation({
    mutationFn: (query: string) => searchTickers({ data: { q: query } }),
  });

  useEffect(() => {
    const t = q.trim();
    if (t.length < 1) return;
    const id = window.setTimeout(() => search.mutate(t), 220);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const remote = search.data ?? [];
  const seen = new Set(local.map((x) => x.symbol));
  const hits: SearchHit[] = [
    ...local.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      exchange: c.exchange,
      type: c.kind === "crypto" ? "Crypto" : "Equity",
    })),
    ...remote.filter((h) => !seen.has(h.symbol)),
  ].slice(0, 10);

  function pick(symbol: string) {
    const next = normalizeSymbol(symbol);
    const ok = addSymbol(next);
    if (!ok) {
      toast("观察池已满，先移除一只再加。");
      return;
    }
    toast(`已加入 ${next}`);
    setOpen(false);
    setQ("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = normalizeSymbol(q);
    if (next) pick(next);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={compact ? "sm" : "default"} className={compact ? "h-7 gap-1 px-2 text-xs" : "gap-1.5"}>
          <Plus className={compact ? "size-3.5" : "size-4"} />
          {compact ? "添加" : "加入观察"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "crypto" ? "加入虚拟货币" : "加入准备入场的标的"}</DialogTitle>
          <DialogDescription>
            {kind === "crypto"
              ? "比特币、ETH、SOL，或 Yahoo 代码如 BTC-USD。"
              : "美股代码、港股四位数字、A 股六位数字、虚拟货币，或中文简称。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === "crypto" ? "例如 BTC、以太坊、SOL" : "例如 NVDA、腾讯、比特币"}
            aria-label="搜索标的"
          />
          <Button type="submit">加入</Button>
        </form>
        <ul className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {hits.map((hit) => (
            <li key={hit.symbol}>
              <button
                type="button"
                onClick={() => pick(hit.symbol)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-secondary"
              >
                <span>
                  <span className="block font-medium tracking-wide">{hit.symbol}</span>
                  <span className="text-xs text-muted-foreground">
                    {displayName(hit.symbol, hit.name)}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {exchangeLabel(hit.exchange)}
                </span>
              </button>
            </li>
          ))}
          {hits.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              没有匹配，直接回车将按代码加入
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
