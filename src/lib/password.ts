import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { usernameKey } from "@/lib/account";

/** Same character class as username: Chinese / letters / numbers / underscore. */
const PASSWORD_RE = /^[\u4e00-\u9fffA-Za-z0-9_]+$/;

/**
 * Shared password rules for signup, reset, set, and change.
 * Matches existing account-name character policy (no `!` or other punctuation).
 */
export function passwordError(raw: string): string | null {
  if (raw.length < 8) return "密码至少 8 位";
  if (raw.length > 72) return "密码最多 72 位";
  if (!PASSWORD_RE.test(raw)) return "只用中文、字母、数字或下划线";
  return null;
}

const requestInput = z.object({
  email: z.string().min(3).max(120),
  username: z.string().min(2).max(20),
});

const completeInput = z.object({
  ticket: z.string().min(16).max(80),
  newPassword: z.string().min(8).max(72),
});

const changeInput = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
});

const setInput = z.object({
  newPassword: z.string().min(8).max(72),
});

async function crypto() {
  return import("node:crypto");
}

function sha256(createHash: (typeof import("node:crypto"))["createHash"], value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function ensureResetTable(
  sql: Awaited<ReturnType<(typeof import("@/lib/db"))["getSql"]>>,
) {
  await sql.query(`
    create table if not exists password_resets (
      id text primary key,
      user_id text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);
}

async function sessionHeaders(bearerToken?: string): Promise<Headers> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const headers = new Headers(request?.headers);
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  return headers;
}

function apiErrorZh(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : "";
  const t = raw.toLowerCase();
  if (t.includes("password already") || t.includes("already has a password")) {
    return "这个账户已设置过登录密码，请改用修改密码";
  }
  if (t.includes("password is too short") || t.includes("too short")) return "密码至少 8 位";
  if (t.includes("password is too long") || t.includes("too long")) return "密码最多 72 位";
  if (t.includes("credential account not found")) {
    return "这个账户没有登录密码，请先设置";
  }
  if (t.includes("invalid password")) return "当前密码不正确";
  if (t.includes("unauthorized") || t.includes("session")) return "请重新登录后再试";
  return raw || "请稍后重试";
}

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestInput.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) return { ok: false as const, error: "请填写有效邮箱" };
    const key = usernameKey(data.username);
    const { createHash, randomBytes } = await crypto();
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureResetTable(sql);
    await sql.query("delete from password_resets where expires_at < now()");
    const [user] = await sql.query<{ id: string }>(
      `select id from "user" where lower(email) = $1`,
      [email],
    );
    const [profile] = user
      ? await sql.query<{ user_id: string }>(
          "select user_id from profiles where user_id = $1 and username_key = $2",
          [user.id, key],
        )
      : [];
    const [credential] = user
      ? await sql.query<{ id: string }>(
          `select id from account where "userId" = $1 and "providerId" = 'credential'`,
          [user.id],
        )
      : [];
    if (!user || !profile) {
      return { ok: false as const, error: "邮箱和用户名不匹配" };
    }
    if (!credential) {
      return {
        ok: false as const,
        error: "这个账户没有登录密码，请用 Google 或 X 登录",
      };
    }
    const recent = await sql.query<{ n: number }>(
      "select count(*)::int as n from password_resets where user_id = $1 and created_at > now() - interval '60 seconds'",
      [user.id],
    );
    if ((recent[0]?.n ?? 0) > 0) {
      return { ok: false as const, error: "请稍后再试" };
    }
    const ticket = randomBytes(24).toString("hex");
    await sql.query("delete from password_resets where user_id = $1", [user.id]);
    await sql.query(
      `insert into password_resets (id, user_id, token_hash, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [randomBytes(16).toString("hex"), user.id, sha256(createHash, ticket)],
    );
    return { ok: true as const, ticket };
  });

export const completePasswordReset = createServerFn({ method: "POST" })
  .validator((input: unknown) => completeInput.parse(input))
  .handler(async ({ data }) => {
    const bad = passwordError(data.newPassword);
    if (bad) return { ok: false as const, error: bad };
    const { createHash } = await crypto();
    const { hashPassword } = await import("better-auth/crypto");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureResetTable(sql);
    const [row] = await sql.query<{ user_id: string }>(
      "select user_id from password_resets where token_hash = $1 and expires_at > now()",
      [sha256(createHash, data.ticket)],
    );
    if (!row) {
      return { ok: false as const, error: "重置已过期，请重新申请" };
    }
    const hashed = await hashPassword(data.newPassword);
    await sql.query(
      `update account set password = $1, "updatedAt" = now()
       where "userId" = $2 and "providerId" = 'credential'`,
      [hashed, row.user_id],
    );
    await sql.query("delete from password_resets where user_id = $1", [row.user_id]);
    await sql.query(`delete from "session" where "userId" = $1`, [row.user_id]);
    return { ok: true as const };
  });

/**
 * Change password for accounts that already have a credential provider.
 * Prefer `authClient.changePassword` from the UI; this remains as a server fallback.
 */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => changeInput.parse(input))
  .handler(async ({ context, data }) => {
    const bad = passwordError(data.newPassword);
    if (bad) return { ok: false as const, error: bad };
    const { hashPassword, verifyPassword } = await import("better-auth/crypto");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [acct] = await sql.query<{ password: string | null }>(
      `select password from account where "userId" = $1 and "providerId" = 'credential'`,
      [context.userId],
    );
    if (!acct?.password) {
      return {
        ok: false as const,
        error: "这个账户没有登录密码，请先设置登录密码",
      };
    }
    const matched = await verifyPassword({
      hash: acct.password,
      password: data.currentPassword,
    });
    if (!matched) return { ok: false as const, error: "当前密码不正确" };
    const hashed = await hashPassword(data.newPassword);
    await sql.query(
      `update account set password = $1, "updatedAt" = now()
       where "userId" = $2 and "providerId" = 'credential'`,
      [hashed, context.userId],
    );
    return { ok: true as const };
  });

/**
 * Set a first login password for OAuth-only users (no credential account yet).
 * better-auth 1.6 `setPassword` is SERVER_ONLY (no HTTP route), so we call
 * `auth.api.setPassword` from this trusted server function.
 */
export const setLoginPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => setInput.parse(input))
  .handler(async ({ context, data }) => {
    const bad = passwordError(data.newPassword);
    if (bad) return { ok: false as const, error: bad };
    const { auth } = await import("@/lib/auth/server");
    const headers = await sessionHeaders(context.bearerToken);
    try {
      await auth.api.setPassword({
        body: { newPassword: data.newPassword },
        headers,
      });
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: apiErrorZh(err) };
    }
  });
