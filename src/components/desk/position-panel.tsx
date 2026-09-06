import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeskStore } from "@/lib/desk-store";
import {
  formatQty,
  formatTradeDay,
  parseDateInput,
  positionPnl,
  reducePositions,
  symbolFlow,
  todayInput,
  type TradeSide,
} from "@/lib/finance/ledger";
import { unitLabel } from "@/lib/finance/catalog";
import { formatPct, formatPrice } from "@/lib/finance/tech";
import type { Quote } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

export function PositionPanel({
  symbol,
  quote,
}: {
  symbol: string;
  quote?: Quote;
}) {
  const trades = useDeskStore((s) => s.trades);
  const addTrade = useDeskStore((s) => s.addTrade);
  const removeTrade = useDeskStore((s) => s.removeTrade);
  const clearSymbolTrades = useDeskStore((s) => s.clearSymbolTrades);
  const pos = useMemo(
    () => reducePositions(trades).get(symbol),
    [trades, symbol],
  );
  const mine = useMemo(
    () =>
      trades
        .filter((t) => t.symbol === symbol)
        .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id)),
    [trades, symbol],
  );

  const holding = pos && pos.qty > 0;
  const closed = pos && pos.qty <= 1e-8 && Math.abs(pos.realized) > 1e-8;
  const currency = quote?.currency;
  const last = quote && quote.price > 0 ? quote.price : 0;
  const marked =
    holding && last
      ? positionPnl(pos, last, quote?.previousClose ?? null, quote?.changePct ?? 0)
      : null;
  const flow = useMemo(() => symbolFlow(trades, symbol), [trades, symbol]);
  const realized = pos?.realized ?? 0;
  const unrealized = marked?.pnl ?? 0;
  const totalPnl = unrealized + realized;
  const invested = flow.buySpend > 0 ? flow.buySpend : pos?.cost ?? 0;
  const totalPct = invested > 0 ? totalPnl / invested : 0;
  const netInvested = flow.buySpend - flow.sellProceeds;
  const up = totalPnl >= 0;
  const unit = unitLabel(symbol);

  const [side, setSide] = useState<TradeSide>("buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [day, setDay] = useState(todayInput);
  const [note, setNote] = useState("");

  useEffect(() => {
    setSide("buy");
    setQty("");
    setPrice("");
    setFee("");
    setDay(todayInput());
    setNote("");
  }, [symbol]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qn = Number(qty);
    const pn = Number(price);
    const fn = fee.trim() ? Number(fee) : 0;
    const result = addTrade({
      symbol,
      side,
      qty: qn,
      price: pn,
      fee: Number.isFinite(fn) ? fn : 0,
      at: parseDateInput(day),
      note,
    });
    if (!result.ok) {
      toast(result.error);
      return;
    }
    toast(side === "buy" ? "已记入买入" : "已记入卖出");
    setQty("");
    setNote("");
    setFee("");
  }

  function fillLast() {
    if (last) setPrice(String(last));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)] sm:p-6">
        {holding || closed ? (
          <>
            <p className="text-xs tracking-widest text-muted-foreground">
              {holding ? "这只标的 · 总盈亏" : "已了结 · 总盈亏"}
            </p>
            <p
              className={cn(
                "mt-2 font-serif text-4xl tracking-tight tabular-nums",
                up ? "text-up" : "text-down",
              )}
            >
              {totalPnl > 0 ? "+" : ""}
              {formatPrice(totalPnl, currency)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              浮动 {formatPrice(unrealized, currency)}
              <span className="mx-1.5">+</span>
              已实现 {formatPrice(realized, currency)}
              {invested > 0 ? (
                <>
                  <span className="mx-2 text-border">·</span>
                  相对累计买入{" "}
                  <span className={cn("tabular-nums", up ? "text-up" : "text-down")}>
                    {formatPct(totalPct)}
                  </span>
                </>
              ) : null}
            </p>
            {holding ? (
              <p className="mt-3 text-sm text-muted-foreground">
                持 {formatQty(pos.qty)} {unit} · 成本 {formatPrice(pos.avgCost, currency)}
                {last ? ` · 现价 ${formatPrice(last, currency)}` : ""}
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Mini
                label="浮动盈亏"
                value={
                  holding && last
                    ? `${formatPrice(unrealized, currency)}  ${formatPct(marked!.pnlPct)}`
                    : formatPrice(0, currency)
                }
                tone={unrealized > 0 ? "up" : unrealized < 0 ? "down" : undefined}
              />
              <Mini
                label="已实现"
                value={formatPrice(realized, currency)}
                tone={realized > 0 ? "up" : realized < 0 ? "down" : undefined}
              />
              <Mini
                label="今日盈亏"
                value={holding && last ? formatPrice(marked!.dayPnl, currency) : "—"}
                tone={
                  holding && last
                    ? marked!.dayPnl >= 0
                      ? "up"
                      : "down"
                    : undefined
                }
              />
              <Mini
                label="市值"
                value={holding && last ? formatPrice(marked!.value, currency) : "—"}
              />
              <Mini label="累计买入" value={formatPrice(flow.buySpend, currency)} />
              <Mini label="累计卖出" value={formatPrice(flow.sellProceeds, currency)} />
              <Mini label="净投入" value={formatPrice(netInvested, currency)} />
              <Mini
                label="买卖笔数"
                value={`${flow.buyCount} 买 / ${flow.sellCount} 卖`}
              />
            </div>
          </>
        ) : (
          <>
            <p className="font-serif text-2xl">登记这只{unitLabel(symbol) === "枚" ? "币" : "股票"}的仓位</p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              填现有数量和平均成本，记一笔买入即可建档。之后每笔买卖都会重算成本和盈亏。
            </p>
          </>
        )}
      </div>

      <form
        onSubmit={submit}
        className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]"
      >
        <p className="text-xs tracking-widest text-muted-foreground">
          {holding ? "记一笔买卖" : "登记持仓 / 记买入"}
        </p>
        <div className="mt-3 flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={side === "buy" ? "default" : "outline"}
            onClick={() => setSide("buy")}
          >
            买入
          </Button>
          <Button
            type="button"
            size="sm"
            variant={side === "sell" ? "default" : "outline"}
            onClick={() => setSide("sell")}
            disabled={!holding}
          >
            卖出
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="数量">
            <Input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={holding ? `成交${unitLabel(symbol)}数` : `现有${unitLabel(symbol)}数`}
              required
            />
          </Field>
          <Field label={holding ? "成交价" : "平均成本"}>
            <Input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={last ? String(last) : "价格"}
              required
            />
          </Field>
          <Field label="费用（可空）">
            <Input
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="日期（年-月-日）">
            <Input
              inputMode="numeric"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              placeholder="2026-09-06"
            />
          </Field>
        </div>
        <Field label="备注">
          <Input
            className="mt-3"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="分批、补仓、减仓理由"
            maxLength={80}
          />
        </Field>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit">{side === "buy" ? "记入买入" : "记入卖出"}</Button>
          {last ? (
            <Button type="button" variant="outline" onClick={fillLast}>
              填入现价
            </Button>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs tracking-widest text-muted-foreground">该股流水</p>
          {mine.length > 0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                clearSymbolTrades(symbol);
                toast("已清空该股流水");
              }}
            >
              清空该股
            </button>
          ) : null}
        </div>
        {mine.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">还没有记录。</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {mine.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={t.side === "buy" ? "up" : "down"}>
                      {t.side === "buy" ? "买" : "卖"}
                    </Badge>
                    <span className="text-sm tabular-nums">
                      {formatQty(t.qty)} × {formatPrice(t.price, currency)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTradeDay(t.at)}
                    {t.fee ? ` · 费 ${formatPrice(t.fee, currency)}` : ""}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="删除这笔"
                  className="size-9 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => removeTrade(t.id)}
                >
                  删
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className="text-[11px] tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm leading-snug tabular-nums",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </p>
    </div>
  );
}
