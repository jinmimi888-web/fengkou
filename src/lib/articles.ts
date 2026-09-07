import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

export type ArticleStatus = "draft" | "pending" | "published" | "rejected";

export type ArticleListItem = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  status: ArticleStatus;
  updatedAt: string;
  publishedAt: string | null;
  rejectReason: string | null;
  authorName?: string | null;
};

export type ArticleDetail = ArticleListItem & {
  body: string;
  userId: string;
};

const TITLE_MAX = 80;
const SUMMARY_MAX = 200;
const BODY_MAX = 50_000;
const SLUG_MAX = 80;
export const REJECT_REASON_MAX = 500;

const STATUS_VALUES = ["draft", "pending", "published", "rejected"] as const;

const articleFields = z.object({
  title: z.string().min(1).max(TITLE_MAX),
  slug: z.string().max(SLUG_MAX).optional(),
  summary: z.string().max(SUMMARY_MAX).optional(),
  body: z.string().max(BODY_MAX),
  status: z.enum(["draft", "pending", "published"]),
});

const updateInput = articleFields.extend({
  id: z.string().min(1).max(80),
});

const idInput = z.object({ id: z.string().min(1).max(80) });
const slugInput = z.object({ slug: z.string().min(1).max(SLUG_MAX) });

function iso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function parseArticleStatus(raw: string | null | undefined): ArticleStatus {
  if (raw === "pending" || raw === "published" || raw === "rejected" || raw === "draft") {
    return raw;
  }
  return "draft";
}

export function articleStatusLabel(status: ArticleStatus): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "pending":
      return "待审核";
    case "published":
      return "已发布";
    case "rejected":
      return "已驳回";
  }
}

/** Badge variant hint for UI. */
export function articleStatusBadgeVariant(
  status: ArticleStatus,
): "default" | "up" | "wait" | "down" | "warn" {
  switch (status) {
    case "published":
      return "up";
    case "pending":
      return "wait";
    case "rejected":
      return "down";
    default:
      return "default";
  }
}

export function slugifyTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX);
  return base || `post-${Date.now().toString(36)}`;
}

export function normalizeSlug(raw: string | undefined, title: string): string {
  const cleaned = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX);
  return cleaned || slugifyTitle(title);
}

function mapRow(r: {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  summary: string;
  body?: string;
  status: string;
  updated_at: string | Date;
  published_at: string | Date | null;
  reject_reason?: string | null;
  author_name?: string | null;
}): ArticleDetail {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    slug: r.slug,
    summary: r.summary ?? "",
    body: r.body ?? "",
    status: parseArticleStatus(r.status),
    updatedAt: iso(r.updated_at) ?? "",
    publishedAt: iso(r.published_at),
    rejectReason: r.reject_reason ?? null,
    authorName: r.author_name ?? null,
  };
}

async function newId(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(16).toString("hex");
}

async function ensureUniqueSlug(
  sql: Awaited<ReturnType<(typeof import("@/lib/db"))["getSql"]>>,
  slug: string,
  exceptId?: string,
): Promise<string> {
  let candidate = slug;
  for (let i = 0; i < 20; i += 1) {
    const rows = await sql.query<{ id: string }>(
      `select id from articles where slug = $1 and deleted_at is null and ($2::text is null or id <> $2) limit 1`,
      [candidate, exceptId ?? null],
    );
    if (!rows.length) return candidate;
    const suffix = `-${(i + 2).toString(36)}`;
    candidate = `${slug.slice(0, Math.max(1, SLUG_MAX - suffix.length))}${suffix}`;
  }
  return `${slug.slice(0, 60)}-${Date.now().toString(36)}`;
}

async function callerIsAdmin(userId: string, bearerToken?: string): Promise<boolean> {
  const { userIsAdmin } = await import("@/lib/admin");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const session = await getSessionUser(bearerToken);
  const email = session?.id === userId ? session.email : null;
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
  return userIsAdmin(userId, resolved);
}

/**
 * Resolve write status for create/update.
 * Non-admins cannot publish; "published" request becomes pending.
 * Editing a published article as non-admin with draft keeps draft;
 * submitting review goes pending and leaves public until approved.
 */
function resolveWriteStatus(
  requested: "draft" | "pending" | "published",
  isAdmin: boolean,
): {
  status: ArticleStatus;
  setPublishedAt: boolean;
  clearPublishedAt: boolean;
  clearRejectReason: boolean;
} {
  if (requested === "published") {
    if (isAdmin) {
      return {
        status: "published",
        setPublishedAt: true,
        clearPublishedAt: false,
        clearRejectReason: true,
      };
    }
    // Non-admin cannot publish — treat as submit for review.
    return {
      status: "pending",
      setPublishedAt: false,
      clearPublishedAt: true,
      clearRejectReason: true,
    };
  }
  if (requested === "pending") {
    return {
      status: "pending",
      setPublishedAt: false,
      clearPublishedAt: true,
      clearRejectReason: true,
    };
  }
  return {
    status: "draft",
    setPublishedAt: false,
    clearPublishedAt: true,
    clearRejectReason: false,
  };
}

export const listMyArticles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
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
    }>(
      `select id, user_id, title, slug, summary, status, updated_at, published_at, reject_reason
       from articles
       where user_id = $1 and deleted_at is null
       order by updated_at desc
       limit 100`,
      [context.userId],
    );
    return { articles: rows.map((r) => mapRow(r)) };
  });

export const getMyArticle = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [row] = await sql.query<{
      id: string;
      user_id: string;
      title: string;
      slug: string;
      summary: string;
      body: string;
      status: string;
      updated_at: string | Date;
      published_at: string | Date | null;
      reject_reason: string | null;
    }>(
      `select id, user_id, title, slug, summary, body, status, updated_at, published_at, reject_reason
       from articles
       where id = $1 and user_id = $2 and deleted_at is null`,
      [data.id, context.userId],
    );
    if (!row) return { article: null };
    return { article: mapRow(row) };
  });

export const createArticle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => articleFields.parse(input))
  .handler(async ({ context, data }) => {
    const title = data.title.trim();
    if (!title) return { ok: false as const, error: "请填写标题" };
    if (title.length > TITLE_MAX) return { ok: false as const, error: `标题最多 ${TITLE_MAX} 字` };
    const summary = (data.summary ?? "").trim().slice(0, SUMMARY_MAX);
    const body = data.body.slice(0, BODY_MAX);
    if (body.length > BODY_MAX) return { ok: false as const, error: `正文最多 ${BODY_MAX} 字` };
    let slug = normalizeSlug(data.slug, title);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    slug = await ensureUniqueSlug(sql, slug);
    const id = await newId();
    const isAdmin = await callerIsAdmin(context.userId, context.bearerToken);
    const resolved = resolveWriteStatus(data.status, isAdmin);
    const publishedAt =
      resolved.status === "published" ? new Date().toISOString() : null;
    await sql.query(
      `insert into articles (id, user_id, title, slug, summary, body, status, published_at, reject_reason, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, null, now())`,
      [id, context.userId, title, slug, summary, body, resolved.status, publishedAt],
    );
    return { ok: true as const, id, slug, status: resolved.status };
  });

export const updateArticle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => updateInput.parse(input))
  .handler(async ({ context, data }) => {
    const title = data.title.trim();
    if (!title) return { ok: false as const, error: "请填写标题" };
    const summary = (data.summary ?? "").trim().slice(0, SUMMARY_MAX);
    const body = data.body.slice(0, BODY_MAX);
    let slug = normalizeSlug(data.slug, title);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [existing] = await sql.query<{
      id: string;
      status: string;
      published_at: string | Date | null;
      reject_reason: string | null;
    }>(
      `select id, status, published_at, reject_reason from articles
       where id = $1 and user_id = $2 and deleted_at is null`,
      [data.id, context.userId],
    );
    if (!existing) return { ok: false as const, error: "文章不存在" };
    slug = await ensureUniqueSlug(sql, slug, data.id);
    const isAdmin = await callerIsAdmin(context.userId, context.bearerToken);
    const resolved = resolveWriteStatus(data.status, isAdmin);

    // Safer: any non-admin edit that leaves published content must leave public
    // (status pending/draft). Admin may keep/set published via 直接发布.
    let nextStatus = resolved.status;
    if (
      !isAdmin &&
      parseArticleStatus(existing.status) === "published" &&
      data.status === "published"
    ) {
      nextStatus = "pending";
    }

    let publishedAt: string | null = iso(existing.published_at);
    if (nextStatus === "published") {
      publishedAt = publishedAt ?? new Date().toISOString();
    } else if (nextStatus === "pending" || nextStatus === "draft") {
      // Hide from public until re-approved / re-published.
      publishedAt = null;
    }

    const rejectReason =
      nextStatus === "pending" || nextStatus === "published"
        ? null
        : existing.reject_reason;

    await sql.query(
      `update articles set
         title = $1, slug = $2, summary = $3, body = $4, status = $5,
         published_at = $6, reject_reason = $7, updated_at = now()
       where id = $8 and user_id = $9 and deleted_at is null`,
      [
        title,
        slug,
        summary,
        body,
        nextStatus,
        publishedAt,
        rejectReason,
        data.id,
        context.userId,
      ],
    );
    return { ok: true as const, id: data.id, slug, status: nextStatus };
  });

export const deleteMyArticle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const result = await sql.query(
      `update articles set deleted_at = now(), updated_at = now(), status = 'draft', reject_reason = null
       where id = $1 and user_id = $2 and deleted_at is null
       returning id`,
      [data.id, context.userId],
    );
    if (!result.length) return { ok: false as const, error: "文章不存在" };
    return { ok: true as const };
  });

/** Public: published articles only. */
export const listPublishedArticles = createServerFn({ method: "GET" }).handler(async () => {
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
  }>(
    `select a.id, a.user_id, a.title, a.slug, a.summary, a.status,
            a.updated_at, a.published_at, a.reject_reason,
            coalesce(p.display_name, u.name) as author_name
     from articles a
     left join "user" u on u.id = a.user_id
     left join profiles p on p.user_id = a.user_id
     where a.deleted_at is null and a.status = 'published'
     order by a.published_at desc nulls last, a.updated_at desc
     limit 100`,
  );
  return { articles: rows.map((r) => mapRow(r)) };
});

export const getPublishedArticle = createServerFn({ method: "GET" })
  .validator((input: unknown) => slugInput.parse(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [row] = await sql.query<{
      id: string;
      user_id: string;
      title: string;
      slug: string;
      summary: string;
      body: string;
      status: string;
      updated_at: string | Date;
      published_at: string | Date | null;
      reject_reason: string | null;
      author_name: string | null;
    }>(
      `select a.id, a.user_id, a.title, a.slug, a.summary, a.body, a.status,
              a.updated_at, a.published_at, a.reject_reason,
              coalesce(p.display_name, u.name) as author_name
       from articles a
       left join "user" u on u.id = a.user_id
       left join profiles p on p.user_id = a.user_id
       where a.slug = $1 and a.deleted_at is null and a.status = 'published'`,
      [data.slug],
    );
    if (!row) return { article: null };
    return { article: mapRow(row) };
  });

export { TITLE_MAX, SUMMARY_MAX, BODY_MAX, SLUG_MAX, STATUS_VALUES };
