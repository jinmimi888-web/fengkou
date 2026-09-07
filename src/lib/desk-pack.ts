import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  emptyDesk,
  parseDeskSnapshot,
  upsertDeskSnapshot,
  type DeskSnapshot,
  type DeskSnapshotInput,
} from "@/lib/account";
import { DEFAULT_WATCHLIST } from "@/lib/finance/catalog";
import type { Analysis, BookAnalysis } from "@/lib/finance/types";
import type { Trade } from "@/lib/finance/ledger";

const createInput = z.object({
  desk: z.unknown().optional(),
});

const importInput = z.object({
  url: z.string().min(1).max(800),
});

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

function toDeskSnapshot(data: DeskSnapshotInput): DeskSnapshot {
  return {
    symbols: data.symbols,
    selected: data.selected,
    board: data.board,
    notes: data.notes,
    analyses: data.analyses as DeskSnapshot["analyses"],
    trades: data.trades as DeskSnapshot["trades"],
    bookAnalysis: (data.bookAnalysis ?? null) as DeskSnapshot["bookAnalysis"],
    bookScope: data.bookScope === "custom" ? "custom" : "all",
    bookSymbols: data.bookSymbols ?? [],
  };
}

function rowToDesk(row: {
  symbols: unknown;
  selected: string;
  board: string;
  notes: unknown;
  analyses: unknown;
  trades: unknown;
  book_analysis: unknown;
  book_scope: string | null;
  book_symbols: unknown;
}): DeskSnapshot {
  return {
    symbols: asJson<string[]>(row.symbols, [...DEFAULT_WATCHLIST]),
    selected: row.selected || DEFAULT_WATCHLIST[0],
    board: row.board === "crypto" ? "crypto" : "equity",
    notes: asJson<Record<string, string>>(row.notes, {}),
    analyses: asJson<Record<string, Analysis>>(row.analyses, {}),
    trades: asJson<Trade[]>(row.trades, []),
    bookAnalysis: asJson<BookAnalysis | null>(row.book_analysis, null),
    bookScope: row.book_scope === "custom" ? "custom" : "all",
    bookSymbols: asJson<string[]>(row.book_symbols, []),
  };
}

export function extractPackToken(urlOrPath: string): string | null {
  const raw = urlOrPath.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw, "http://local.invalid");
    const m = u.pathname.match(/\/api\/pack\/([A-Za-z0-9_-]+)\/?$/);
    if (m?.[1]) return m[1];
  } catch {
    /* fall through */
  }
  const m2 = raw.match(/(?:^|\/)api\/pack\/([A-Za-z0-9_-]+)\/?$/);
  return m2?.[1] ?? null;
}

async function resolveOrigin(): Promise<string> {
  const fromEnv = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    if (req) {
      const xfProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
      const host = (xfHost || req.headers.get("host") || "").trim();
      if (host) {
        const proto =
          xfProto ||
          (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
        return `${proto}://${host}`;
      }
    }
  } catch {
    /* ignore */
  }
  return "http://localhost:8080";
}

async function loadDeskForUser(userId: string): Promise<DeskSnapshot> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
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
    [userId],
  );
  return deskRow ? rowToDesk(deskRow) : emptyDesk();
}

export async function loadDeskPackByToken(
  token: string,
): Promise<
  | { status: "ok"; payload: DeskSnapshot }
  | { status: "missing" }
  | { status: "expired" }
> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const [row] = await sql.query<{
    payload: unknown;
    expires_at: string | Date;
  }>("select payload, expires_at from desk_packs where token = $1", [token]);
  if (!row) return { status: "missing" };
  const expires =
    row.expires_at instanceof Date
      ? row.expires_at.getTime()
      : new Date(row.expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    return { status: "expired" };
  }
  const payload = toDeskSnapshot(parseDeskSnapshot(asJson(row.payload, null)));
  return { status: "ok", payload };
}

/** Create a 7-day public download link for the current desk (no passwords). */
export const createDeskPack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => createInput.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const { randomBytes } = await import("node:crypto");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();

    const desk: DeskSnapshot =
      data.desk != null
        ? toDeskSnapshot(parseDeskSnapshot(data.desk))
        : await loadDeskForUser(context.userId);

    const id = randomBytes(16).toString("hex");
    const token = randomBytes(24).toString("hex");
    await sql.query(
      `insert into desk_packs (id, token, user_id, payload, expires_at)
       values ($1, $2, $3, $4::jsonb, now() + interval '7 days')`,
      [id, token, context.userId, JSON.stringify(desk)],
    );
    const origin = await resolveOrigin();
    return { ok: true as const, url: `${origin}/api/pack/${token}`, token };
  });

/** Import a pack by public URL into the current user's desk (overwrites). */
export const importDeskPack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => importInput.parse(input))
  .handler(async ({ context, data }) => {
    const token = extractPackToken(data.url);
    if (!token) {
      return { ok: false as const, error: "网址无效，请粘贴完整的资料包链接" };
    }
    const loaded = await loadDeskPackByToken(token);
    if (loaded.status === "missing") {
      return { ok: false as const, error: "资料包不存在" };
    }
    if (loaded.status === "expired") {
      return { ok: false as const, error: "资料包已过期（有效期 7 天）" };
    }
    const desk = await upsertDeskSnapshot(
      context.userId,
      parseDeskSnapshot(loaded.payload),
    );
    return { ok: true as const, desk };
  });
