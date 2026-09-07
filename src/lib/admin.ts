import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  parseArticleStatus,
  REJECT_REASON_MAX,
  type ArticleStatus,
} from "@/lib/articles";

export type UserRole = "user" | "admin";

export function parseAdminEmails(raw = process.env.ADMIN_EMAILS): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function emailIsAdmin(email: string | null | undefined, envEmails?: Set<string>): boolean {
  if (!email) return false;
  const set = envEmails ?? parseAdminEmails();
  return set.has(email.trim().toLowerCase());
}

/** Runtime admin gate: ADMIN_EMAILS env OR role === 'admin'. */
export async function userIsAdmin(
  userId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (emailIsAdmin(email)) return true;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const [row] = await sql.query<{ role: string | null }>(
    `select coalesce(role, 'user') as role from "user" where id = $1`,
    [userId],
  );
  return row?.role === "admin";
}

export async function requireAdmin(
  userId: string,
  bearerToken?: string,
): Promise<{ email: string | null }> {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const session = await getSessionUser(bearerToken);
  const email = session?.id === userId ? session.email : null;
  // Prefer session email; fall back to DB email when session email missing.
  let resolved = email;
  if (!resolved) {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [row] = await sql.query<{ email: string }>(
      `select email from "user" where id = $1`,
      [userId],
    );
    resolved = row?.email ?? null;
  }
  if (!(await userIsAdmin(userId, resolved))) {
    throw new Error("Forbidden");
  }
  return { email: resolved };
}

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const session = await getSessionUser(context.bearerToken);
    const email = session?.email ?? null;
    const admin = await userIsAdmin(context.userId, email);
    return { admin, email };
  });

const setRoleInput = z.object({
  userId: z.string().min(1).max(80),
  role: z.enum(["user", "admin"]),
});

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<{
      id: string;
      name: string;
      email: string;
      role: string;
      createdAt: string | Date;
    }>(
      `select u.id, u.name, u.email, coalesce(u.role, 'user') as role, u."createdAt"
       from "user" u
       order by u."createdAt" desc
       limit 200`,
    );
    return {
      users: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: (r.role === "admin" ? "admin" : "user") as UserRole,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
    };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => setRoleInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.bearerToken);
    if (data.userId === context.userId && data.role !== "admin") {
      // Allow demoting self only if still covered by ADMIN_EMAILS.
      const { getSessionUser } = await import("@/lib/auth/verify.server");
      const session = await getSessionUser(context.bearerToken);
      if (!emailIsAdmin(session?.email)) {
        return { ok: false as const, error: "不能移除自己的管理员身份（除非邮箱在 ADMIN_EMAILS 中）" };
      }
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(`update "user" set role = $1, "updatedAt" = now() where id = $2`, [
      data.role,
      data.userId,
    ]);
    return { ok: true as const };
  });

const articleActionInput = z.object({
  id: z.string().min(1).max(80),
});

const rejectInput = z.object({
  id: z.string().min(1).max(80),
  reason: z.string().max(REJECT_REASON_MAX).optional(),
});

export type AdminArticle = {
  id: string;
  userId: string;
  title: string;
  slug: string;
  summary: string;
  status: ArticleStatus;
  updatedAt: string;
  publishedAt: string | null;
  rejectReason: string | null;
  authorName: string | null;
  authorEmail: string | null;
};

function mapAdminArticle(r: {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  summary: string;
  status: string;
  updated_at: string | Date;
  published_at: string | Date | null;
  reject_reason: string | null;
  author_name: string | null;
  author_email: string | null;
}): AdminArticle {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    slug: r.slug,
    summary: r.summary,
    status: parseArticleStatus(r.status),
    updatedAt:
      r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    publishedAt: r.published_at
      ? r.published_at instanceof Date
        ? r.published_at.toISOString()
        : String(r.published_at)
      : null,
    rejectReason: r.reject_reason,
    authorName: r.author_name,
    authorEmail: r.author_email,
  };
}

export const adminListArticles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<{
      id: string;
      user_id: string;
      title: string;
      slug: string;
      summary: string;
      status: string;
      updated_at: string | Date;
      published_at: string | Date | null;
      reject_reason: string | null;
      author_name: string | null;
      author_email: string | null;
    }>(
      `select a.id, a.user_id, a.title, a.slug, a.summary, a.status,
              a.updated_at, a.published_at, a.reject_reason,
              u.name as author_name, u.email as author_email
       from articles a
       left join "user" u on u.id = a.user_id
       where a.deleted_at is null
       order by
         case a.status
           when 'pending' then 0
           when 'rejected' then 1
           when 'draft' then 2
           else 3
         end,
         a.updated_at desc
       limit 200`,
    );
    return { articles: rows.map(mapAdminArticle) };
  });

export const adminListPendingArticles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<{
      id: string;
      user_id: string;
      title: string;
      slug: string;
      summary: string;
      status: string;
      updated_at: string | Date;
      published_at: string | Date | null;
      reject_reason: string | null;
      author_name: string | null;
      author_email: string | null;
    }>(
      `select a.id, a.user_id, a.title, a.slug, a.summary, a.status,
              a.updated_at, a.published_at, a.reject_reason,
              u.name as author_name, u.email as author_email
       from articles a
       left join "user" u on u.id = a.user_id
       where a.deleted_at is null and a.status = 'pending'
       order by a.updated_at asc
       limit 200`,
    );
    return { articles: rows.map(mapAdminArticle) };
  });

export const adminApproveArticle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => articleActionInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const result = await sql.query(
      `update articles set
         status = 'published',
         published_at = coalesce(published_at, now()),
         reject_reason = null,
         updated_at = now()
       where id = $1 and deleted_at is null
       returning id`,
      [data.id],
    );
    if (!result.length) return { ok: false as const, error: "文章不存在" };
    return { ok: true as const };
  });

export const adminRejectArticle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => rejectInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.bearerToken);
    const reason = (data.reason ?? "").trim().slice(0, REJECT_REASON_MAX);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const result = await sql.query(
      `update articles set
         status = 'rejected',
         reject_reason = $2,
         published_at = null,
         updated_at = now()
       where id = $1 and deleted_at is null
       returning id`,
      [data.id, reason || null],
    );
    if (!result.length) return { ok: false as const, error: "文章不存在" };
    return { ok: true as const };
  });

export const adminUnpublishArticle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => articleActionInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(
      `update articles set status = 'draft', published_at = null, updated_at = now()
       where id = $1 and deleted_at is null`,
      [data.id],
    );
    return { ok: true as const };
  });

export const adminDeleteArticle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => articleActionInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(
      `update articles set deleted_at = now(), updated_at = now(), status = 'draft', reject_reason = null
       where id = $1 and deleted_at is null`,
      [data.id],
    );
    return { ok: true as const };
  });
