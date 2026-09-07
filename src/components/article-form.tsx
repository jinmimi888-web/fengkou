import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BODY_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
  normalizeSlug,
  slugifyTitle,
  type ArticleStatus,
} from "@/lib/articles";

/** Form-writable statuses (rejected is display-only; re-submit uses pending). */
export type ArticleFormStatus = "draft" | "pending" | "published";

export type ArticleFormValues = {
  title: string;
  slug: string;
  summary: string;
  body: string;
  status: ArticleFormStatus;
};

function toFormStatus(status: ArticleStatus | ArticleFormStatus | undefined): ArticleFormStatus {
  if (status === "published" || status === "pending" || status === "draft") return status;
  // rejected / unknown → default to draft so user can edit & re-submit
  return "draft";
}

export function ArticleForm({
  initial,
  submitLabel,
  onSubmit,
  allowDirectPublish = false,
  rejectReason = null,
  currentStatus,
}: {
  initial?: Partial<Omit<ArticleFormValues, "status">> & {
    status?: ArticleStatus | ArticleFormStatus;
  };
  submitLabel: string;
  onSubmit: (values: ArticleFormValues) => Promise<string | null>;
  /** Admin may 「直接发布」without review. */
  allowDirectPublish?: boolean;
  /** Shown when article was rejected. */
  rejectReason?: string | null;
  /** Live DB status (for banners). */
  currentStatus?: ArticleStatus;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [status, setStatus] = useState<ArticleFormStatus>(() => {
    // Rejected articles: default action is re-submit (pending) after edits.
    if (currentStatus === "rejected" || initial?.status === "rejected") return "pending";
    return toFormStatus(initial?.status);
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const previewSlug = useMemo(() => {
    if (slugTouched && slug.trim()) return normalizeSlug(slug, title || "post");
    return slugifyTitle(title || "post");
  }, [slug, slugTouched, title]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("请填写标题");
      return;
    }
    if (title.trim().length > TITLE_MAX) {
      setError(`标题最多 ${TITLE_MAX} 字`);
      return;
    }
    if (summary.length > SUMMARY_MAX) {
      setError(`摘要最多 ${SUMMARY_MAX} 字`);
      return;
    }
    if (body.length > BODY_MAX) {
      setError(`正文最多 ${BODY_MAX} 字`);
      return;
    }
    if (status === "published" && !allowDirectPublish) {
      setError("普通用户不能直接发布，请提交审核");
      return;
    }
    setBusy(true);
    try {
      const err = await onSubmit({
        title: title.trim(),
        slug: previewSlug,
        summary: summary.trim(),
        body,
        status,
      });
      if (err) setError(err);
    } catch {
      setError("保存失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  const showReject =
    currentStatus === "rejected" ||
    (Boolean(rejectReason) && currentStatus !== "pending" && currentStatus !== "published");

  return (
    <form onSubmit={(e) => void submit(e)} className="glass grid gap-4 rounded-2xl p-5 sm:p-6">
      {showReject ? (
        <div className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">
          <p className="font-medium">审核未通过</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            {rejectReason?.trim() || "未填写驳回原因。请修改后重新提交审核。"}
          </p>
        </div>
      ) : null}

      {currentStatus === "pending" ? (
        <div className="rounded-xl border border-bone/25 bg-bone/10 px-4 py-3 text-sm text-bone">
          正在等待管理员审核；公开列表中暂不可见。
        </div>
      ) : null}

      {currentStatus === "published" && !allowDirectPublish ? (
        <div className="rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
          修改已发布内容后需重新提交审核，通过前将从公开列表下线。
        </div>
      ) : null}

      <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
        标题（≤{TITLE_MAX}）
        <Input
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugifyTitle(e.target.value));
          }}
          required
          placeholder="写下标题"
        />
      </label>

      <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
        网址别名 slug
        <Input
          value={slugTouched ? slug : previewSlug}
          maxLength={80}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="auto-from-title"
          className="font-mono text-xs"
        />
        <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
          公开地址：/posts/{previewSlug || "…"}
        </span>
      </label>

      <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
        摘要（≤{SUMMARY_MAX}）
        <Textarea
          value={summary}
          maxLength={SUMMARY_MAX}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="一句话介绍（可选）"
          className="min-h-16"
        />
        <span className="text-right text-[11px] font-normal normal-case tracking-normal">
          {summary.length}/{SUMMARY_MAX}
        </span>
      </label>

      <label className="grid gap-1 text-xs tracking-widest text-muted-foreground">
        正文 Markdown（≤{BODY_MAX.toLocaleString()}）
        <Textarea
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"支持标题、列表、**粗体**、链接与代码块"}
          className="min-h-56 font-mono text-xs leading-relaxed"
        />
        <span className="text-right text-[11px] font-normal normal-case tracking-normal">
          {body.length}/{BODY_MAX}
        </span>
      </label>

      <fieldset className="grid gap-2">
        <legend className="text-xs tracking-widest text-muted-foreground">保存方式</legend>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={status === "draft" ? "default" : "outline"}
            onClick={() => setStatus("draft")}
          >
            保存草稿
          </Button>
          <Button
            type="button"
            size="sm"
            variant={status === "pending" ? "default" : "outline"}
            onClick={() => setStatus("pending")}
          >
            提交审核
          </Button>
          {allowDirectPublish ? (
            <Button
              type="button"
              size="sm"
              variant={status === "published" ? "default" : "outline"}
              onClick={() => setStatus("published")}
            >
              直接发布
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {status === "draft"
            ? "仅自己可见，不会进入公开列表。"
            : status === "pending"
              ? "提交后等待管理员通过，通过前不会公开。"
              : "管理员直接发布，立即出现在公开列表。"}
        </p>
      </fieldset>

      {error ? <p className="text-sm text-down">{error}</p> : null}

      <Button type="submit" disabled={busy}>
        {busy ? "保存中…" : submitLabel}
      </Button>
    </form>
  );
}
