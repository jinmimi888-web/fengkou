import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SitePage } from "@/components/site-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  articleStatusBadgeVariant,
  articleStatusLabel,
  deleteMyArticle,
  listMyArticles,
  type ArticleListItem,
} from "@/lib/articles";
import { toast } from "sonner";

export const Route = createFileRoute("/account/articles/")({
  head: () => ({
    meta: [{ title: "我的文章 · 锋口" }],
  }),
  component: MyArticlesPage,
});

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      timeZone: "Asia/Phnom_Penh",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function MyArticlesPage() {
  const { user, isPending } = useCurrentUserState();
  const [articles, setArticles] = useState<ArticleListItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await listMyArticles();
    setArticles(res.articles);
  }, []);

  useEffect(() => {
    if (!user) return;
    void refresh().catch(() => setArticles([]));
  }, [user, refresh]);

  if (isPending) return null;
  if (!user) return <RedirectToSignIn />;

  return (
    <SitePage
      title="我的文章"
      subtitle="保存草稿或提交审核；通过后才会出现在公开列表"
      actions={
        <Button asChild size="sm">
          <Link to="/account/articles/new">写新文章</Link>
        </Button>
      }
    >
      {articles == null ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : articles.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          还没有文章。
          <div className="mt-4">
            <Button asChild>
              <Link to="/account/articles/new">写第一篇</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="grid gap-3">
          {articles.map((a) => (
            <li
              key={a.id}
              className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/account/articles/$id"
                    params={{ id: a.id }}
                    className="truncate font-medium hover:text-bone"
                  >
                    {a.title}
                  </Link>
                  <Badge variant={articleStatusBadgeVariant(a.status)}>
                    {articleStatusLabel(a.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  /posts/{a.slug} · 更新 {formatDate(a.updatedAt)}
                </p>
                {a.status === "rejected" && a.rejectReason ? (
                  <p className="mt-1 text-xs text-down">驳回：{a.rejectReason}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {a.status === "published" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/posts/$slug" params={{ slug: a.slug }}>
                      查看
                    </Link>
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="secondary">
                  <Link to="/account/articles/$id" params={{ id: a.id }}>
                    编辑
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId === a.id}
                  onClick={() => {
                    if (!confirm(`确定删除「${a.title}」？`)) return;
                    setBusyId(a.id);
                    void deleteMyArticle({ data: { id: a.id } })
                      .then((res) => {
                        if (!res.ok) {
                          toast(res.error);
                          return;
                        }
                        toast("已删除");
                        return refresh();
                      })
                      .finally(() => setBusyId(null));
                  }}
                >
                  删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SitePage>
  );
}
