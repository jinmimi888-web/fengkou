import { create } from "zustand";
import { DEFAULT_CRYPTO, DEFAULT_WATCHLIST, isCrypto, type AssetKind } from "@/lib/finance/catalog";
import {
  MAX_TRADES,
  newTradeId,
  reducePositions,
  type Trade,
  type TradeSide,
} from "@/lib/finance/ledger";
import type { Analysis, BookAnalysis } from "@/lib/finance/types";
import type { DeskSnapshot } from "@/lib/account";

export type TradeDraft = {
  symbol: string;
  side: TradeSide;
  qty: number;
  price: number;
  fee?: number;
  at?: number;
  note?: string;
};

type DeskState = DeskSnapshot & {
  hydrated: boolean;
  setHydrated: (value?: boolean) => void;
  replaceDesk: (snap: DeskSnapshot) => void;
  select: (symbol: string) => void;
  setBoard: (board: AssetKind) => void;
  addSymbol: (symbol: string) => boolean;
  removeSymbol: (symbol: string) => void;
  setNote: (symbol: string, note: string) => void;
  saveAnalysis: (analysis: Analysis) => void;
  addTrade: (draft: TradeDraft) => { ok: true } | { ok: false; error: string };
  removeTrade: (id: string) => void;
  clearSymbolTrades: (symbol: string) => void;
  saveBookAnalysis: (analysis: BookAnalysis) => void;
  setBookScope: (scope: DeskSnapshot["bookScope"], universe?: string[]) => void;
  toggleBookSymbol: (symbol: string) => void;
  setBookSymbols: (symbols: string[]) => void;
};

const defaults: DeskSnapshot = {
  symbols: [...DEFAULT_WATCHLIST],
  selected: DEFAULT_WATCHLIST[0],
  board: "equity",
  notes: {},
  analyses: {},
  trades: [],
  bookAnalysis: null,
  bookScope: "all",
  bookSymbols: [],
};

export function snapshotDesk(s: Pick<DeskState, keyof DeskSnapshot>): DeskSnapshot {
  return {
    symbols: s.symbols,
    selected: s.selected,
    board: s.board,
    notes: s.notes,
    analyses: s.analyses,
    trades: s.trades,
    bookAnalysis: s.bookAnalysis,
    bookScope: s.bookScope,
    bookSymbols: s.bookSymbols,
  };
}

export function readOrphanLocalDesk(): DeskSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("fengkhou-desk-v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: Partial<DeskSnapshot> };
    const s = parsed.state ?? (parsed as Partial<DeskSnapshot>);
    if (!Array.isArray(s.symbols) || s.symbols.length === 0) return null;
    return {
      symbols: s.symbols.filter((x): x is string => typeof x === "string").slice(0, 16),
      selected: typeof s.selected === "string" ? s.selected : s.symbols[0] ?? "",
      board: s.board === "crypto" ? "crypto" : "equity",
      notes: s.notes && typeof s.notes === "object" ? s.notes : {},
      analyses: s.analyses && typeof s.analyses === "object" ? s.analyses : {},
      trades: Array.isArray(s.trades) ? s.trades.slice(0, MAX_TRADES) : [],
      bookAnalysis: s.bookAnalysis ?? null,
      bookScope: s.bookScope === "custom" ? "custom" : "all",
      bookSymbols: Array.isArray(s.bookSymbols)
        ? s.bookSymbols.filter((x): x is string => typeof x === "string").slice(0, 32)
        : [],
    };
  } catch {
    return null;
  }
}

export function clearOrphanLocalDesk() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("fengkhou-desk-v1");
  } catch {
    /* ignore */
  }
}

export const useDeskStore = create<DeskState>()((set, get) => ({
  ...defaults,
  hydrated: false,
  setHydrated: (value = true) => set({ hydrated: value }),
  replaceDesk: (snap) =>
    set({
      symbols: snap.symbols.length ? snap.symbols : [...DEFAULT_WATCHLIST],
      selected: snap.selected || snap.symbols[0] || DEFAULT_WATCHLIST[0],
      board: snap.board === "crypto" ? "crypto" : "equity",
      notes: snap.notes ?? {},
      analyses: snap.analyses ?? {},
      trades: Array.isArray(snap.trades) ? snap.trades : [],
      bookAnalysis: snap.bookAnalysis ?? null,
      bookScope: snap.bookScope === "custom" ? "custom" : "all",
      bookSymbols: Array.isArray(snap.bookSymbols) ? snap.bookSymbols.slice(0, 32) : [],
      hydrated: true,
    }),
  select: (symbol) =>
    set({ selected: symbol, board: isCrypto(symbol) ? "crypto" : "equity" }),
  setBoard: (board) => {
    let { symbols, selected } = get();
    if (board === "crypto" && !symbols.some(isCrypto)) {
      const room = Math.max(0, 16 - symbols.length);
      const add = DEFAULT_CRYPTO.filter((s) => !symbols.includes(s)).slice(0, room);
      if (add.length) symbols = [...symbols, ...add];
    }
    const pool = symbols.filter((s) => (isCrypto(s) ? "crypto" : "equity") === board);
    const nextSelected = pool.includes(selected) ? selected : (pool[0] ?? selected);
    set({ symbols, board, selected: nextSelected });
  },
  addSymbol: (symbol) => {
    const next = symbol.trim();
    if (!next) return false;
    const { symbols } = get();
    const board = isCrypto(next) ? "crypto" : "equity";
    if (symbols.includes(next)) {
      set({ selected: next, board });
      return true;
    }
    if (symbols.length >= 16) return false;
    set({ symbols: [next, ...symbols], selected: next, board });
    return true;
  },
  removeSymbol: (symbol) => {
    const symbols = get().symbols.filter((s) => s !== symbol);
    const selected =
      get().selected === symbol ? (symbols[0] ?? "") : get().selected;
    const notes = { ...get().notes };
    delete notes[symbol];
    set({
      symbols,
      selected,
      notes,
      board: selected ? (isCrypto(selected) ? "crypto" : "equity") : get().board,
    });
  },
  setNote: (symbol, note) =>
    set({ notes: { ...get().notes, [symbol]: note } }),
  saveAnalysis: (analysis) =>
    set({
      analyses: { ...get().analyses, [analysis.symbol]: analysis },
    }),
  addTrade: (draft) => {
    const symbol = draft.symbol.trim();
    const qty = draft.qty;
    const price = draft.price;
    const fee = draft.fee && draft.fee > 0 ? draft.fee : 0;
    if (!symbol) return { ok: false as const, error: "缺少代码" };
    if (!(qty > 0)) return { ok: false as const, error: "数量需大于 0" };
    if (!(price > 0)) return { ok: false as const, error: "价格需大于 0" };
    const { trades } = get();
    if (trades.length >= MAX_TRADES) {
      return { ok: false as const, error: "流水已满，先删几笔旧记录" };
    }
    if (draft.side === "sell") {
      const pos = reducePositions(trades).get(symbol);
      if (!pos || qty > pos.qty + 1e-8) {
        return { ok: false as const, error: "可卖数量不足" };
      }
    }
    const trade: Trade = {
      id: newTradeId(),
      symbol,
      side: draft.side,
      qty,
      price,
      fee,
      at: draft.at ?? Date.now(),
      note: (draft.note ?? "").slice(0, 80),
    };
    const symbols = get().symbols;
    const nextSymbols = symbols.includes(symbol)
      ? symbols
      : symbols.length >= 16
        ? symbols
        : [symbol, ...symbols];
    set({
      trades: [...trades, trade],
      symbols: nextSymbols,
      selected: symbol,
      board: isCrypto(symbol) ? "crypto" : "equity",
      bookAnalysis: null,
    });
    return { ok: true as const };
  },
  removeTrade: (id) =>
    set({
      trades: get().trades.filter((t) => t.id !== id),
      bookAnalysis: null,
    }),
  clearSymbolTrades: (symbol) =>
    set({
      trades: get().trades.filter((t) => t.symbol !== symbol),
      bookAnalysis: null,
    }),
  saveBookAnalysis: (analysis) => set({ bookAnalysis: analysis }),
  setBookScope: (scope, universe) => {
    if (scope === "all") {
      set({ bookScope: "all", bookAnalysis: null });
      return;
    }
    const current = get().bookSymbols;
    set({
      bookScope: "custom",
      bookSymbols: current.length ? current : [...(universe ?? [])],
      bookAnalysis: null,
    });
  },
  toggleBookSymbol: (symbol) => {
    const cur = get().bookSymbols;
    const next = cur.includes(symbol)
      ? cur.filter((s) => s !== symbol)
      : [...cur, symbol].slice(0, 32);
    set({ bookScope: "custom", bookSymbols: next, bookAnalysis: null });
  },
  setBookSymbols: (symbols) =>
    set({
      bookScope: "custom",
      bookSymbols: [...new Set(symbols)].slice(0, 32),
      bookAnalysis: null,
    }),
}));
