import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { DEFAULT_WATCHLIST } from "@/lib/finance/catalog";
import type { Analysis, BookAnalysis } from "@/lib/finance/types";
import type { Trade } from "@/lib/finance/ledger";
import type { AssetKind } from "@/lib/finance/catalog";

export type BookScope = "all" | "custom";

export type DeskSnapshot = {
  symbols: string[];
  selected: string;
  board: AssetKind;
  notes: Record<string, string>;
  analyses: Record<string, Analysis>;
  trades: Trade[];
  bookAnalysis: BookAnalysis | null;
  bookScope: BookScope;
  bookSymbols: string[];
};

export type UserProfile = {
  username: string;
  displayName: string;
};

export const emptyDesk = (): DeskSnapshot => ({
  symbols: [...DEFAULT_WATCHLIST],
  selected: DEFAULT_WATCHLIST[0],
  board: "equity",
  notes: {},
  analyses: {},
  trades: [],
  bookAnalysis: null,
  bookScope: "all",
  bookSymbols: [],
});

const USERNAME_RE = /^[\u4e00-\u9fffA-Za-z0-9_]{2,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim();
}

export function usernameKey(raw: string): string {
  return normalizeUsername(raw).toLowerCase();
}

export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 2) return "用户名至少 2 个字";
  if (u.length > 20) return "用户名最多 20 个字";
  if (!USERNAME_RE.test(u)) return "只用中文、字母、数字或下划线";
  return null;
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

const snapshotSchema = z.object({
  symbols: z.array(z.string().min(1).max(24)).max(16),
  selected: z.string().max(24),
  board: z.enum(["equity", "crypto"]),
  notes: z.record(z.string(), z.string().max(2000)),
  analyses: z.record(z.string(), z.unknown()),
  trades: z.array(z.unknown()).max(200),
  bookAnalysis: z.unknown().nullable(),
  bookScope: z.enum(["all", "custom"]).optional(),
  bookSymbols: z.array(z.string().min(1).max(24)).max(32).optional(),
});

const profileInput = z.object({
  username: z.string().min(2).max(20),
  displayName: z.string().max(24).optional(),
});

export const loadAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [profileRow] = await sql.query<{
      username: string;
      display_name: string;
    }>("select username, display_name from profiles where user_id = $1", [
      context.userId,
    ]);
    const [deskRow] = await sql.query<{
      symbols: unknown;
      selected: string;
      board: string;
      notes: unknown;
      analyses: unknown;
      trades: unknown;
      book_analysis: unknown;
      book_scope: string | null;
      book_symbols: unknown;
    }>(
      "select symbols, selected, board, notes, analyses, trades, book_analysis, book_scope, book_symbols from desks where user_id = $1",
      [context.userId],
    );
    const profile: UserProfile | null = profileRow
      ? { username: profileRow.username, displayName: profileRow.display_name }
      : null;
    const desk: DeskSnapshot | null = deskRow
      ? {
          symbols: asJson<string[]>(deskRow.symbols, [...DEFAULT_WATCHLIST]),
          selected: deskRow.selected || DEFAULT_WATCHLIST[0],
          board: deskRow.board === "crypto" ? "crypto" : "equity",
          notes: asJson<Record<string, string>>(deskRow.notes, {}),
          analyses: asJson<Record<string, Analysis>>(deskRow.analyses, {}),
          trades: asJson<Trade[]>(deskRow.trades, []),
          bookAnalysis: asJson<BookAnalysis | null>(deskRow.book_analysis, null),
          bookScope: deskRow.book_scope === "custom" ? "custom" : "all",
          bookSymbols: asJson<string[]>(deskRow.book_symbols, []),
        }
      : null;
    return { profile, desk };
  });

export type DeskSnapshotInput = z.infer<typeof snapshotSchema>;

export function parseDeskSnapshot(input: unknown): DeskSnapshotInput {
  return snapshotSchema.parse(input);
}

/** Shared upsert used by saveDesk and desk-pack import. */
export async function upsertDeskSnapshot(
  userId: string,
  data: DeskSnapshotInput,
): Promise<DeskSnapshot> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const bookScope = data.bookScope === "custom" ? "custom" : "all";
  const bookSymbols = (data.bookSymbols ?? []).slice(0, 32);
  const snap: DeskSnapshot = {
    symbols: data.symbols,
    selected: data.selected,
    board: data.board,
    notes: data.notes,
    analyses: data.analyses as DeskSnapshot["analyses"],
    trades: data.trades as DeskSnapshot["trades"],
    bookAnalysis: (data.bookAnalysis ?? null) as DeskSnapshot["bookAnalysis"],
    bookScope,
    bookSymbols,
  };
  await sql.query(
    `insert into desks (user_id, symbols, selected, board, notes, analyses, trades, book_analysis, book_scope, book_symbols, updated_at)
     values ($1, $2::jsonb, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10::jsonb, now())
     on conflict (user_id) do update set
       symbols = excluded.symbols,
       selected = excluded.selected,
       board = excluded.board,
       notes = excluded.notes,
       analyses = excluded.analyses,
       trades = excluded.trades,
       book_analysis = excluded.book_analysis,
       book_scope = excluded.book_scope,
       book_symbols = excluded.book_symbols,
       updated_at = now()`,
    [
      userId,
      JSON.stringify(snap.symbols),
      snap.selected,
      snap.board,
      JSON.stringify(snap.notes),
      JSON.stringify(snap.analyses),
      JSON.stringify(snap.trades),
      snap.bookAnalysis == null ? null : JSON.stringify(snap.bookAnalysis),
      snap.bookScope,
      JSON.stringify(snap.bookSymbols),
    ],
  );
  return snap;
}

export const saveDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => snapshotSchema.parse(input))
  .handler(async ({ context, data }) => {
    await upsertDeskSnapshot(context.userId, data);
    return { ok: true as const };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => profileInput.parse(input))
  .handler(async ({ context, data }) => {
    const username = normalizeUsername(data.username);
    const err = usernameError(username);
    if (err) return { ok: false as const, error: err };
    const displayName = (data.displayName ?? username).trim().slice(0, 24) || username;
    const key = usernameKey(username);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const taken = await sql.query<{ user_id: string }>(
      "select user_id from profiles where username_key = $1 and user_id <> $2",
      [key, context.userId],
    );
    if (taken.length) return { ok: false as const, error: "这个用户名已被占用" };
    await sql.query(
      `insert into profiles (user_id, username, username_key, display_name, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (user_id) do update set
         username = excluded.username,
         username_key = excluded.username_key,
         display_name = excluded.display_name,
         updated_at = now()`,
      [context.userId, username, key, displayName],
    );
    return { ok: true as const, profile: { username, displayName } };
  });
