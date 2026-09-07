import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArticleForm } from "@/components/article-form";
import { SitePage } from "@/components/site-page";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getAdminStatus } from "@/lib/admin";
import {
  articleStatusLabel,
  deleteMyArticle,
  getMyArticle,
  updateArticle,
  type ArticleDetail,
} from "@/lib/articles";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/account/articles/$id")({
  head: () => ({
    meta: [{ title: "编辑文章 · 锋口" }],
  }),
  component: EditArticlePage,
});

function EditArticlePage() {
  const { id } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [article, setArticle] = useState<ArticleDetail | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getMyArticle({ data: { id } }).then((res) => setArticle(res.article));
    void getAdminStatus()
      .then((s) => setIsAdmin(s.admin))
      .catch(() => setIsAdmin(false));
  }, [user, id]);

  if (isPending) return null;
  if (!user) return <RedirectToSignIn />;

  if (article === undefined) {
    return (
      <SitePage title="编辑文章">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </SitePage>
    );
  }

  if (!article) {
    return (
      <SitePage title="编辑文章">
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          找不到这篇文章，或你没有权限。
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/account/articles">返回列表</Link>
            </Button>
          </div>
        </div>
      </SitePage>
    );
  }

  return (
    <SitePage
      title="编辑文章"
      subtitle={articleStatusLabel(article.status)}
      actions={
        <div className="flex items-center gap-3">
          {article.status === "published" ? (
            <Link
              to="/posts/$slug"
              params={{ slug: article.slug }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              公开页
            </Link>
          ) : null}
          <Link
            to="/account/articles"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            返回列表
          </Link>
        </div>
      }
    >
      <ArticleForm
        initial={{
          title: article.title,
          slug: article.slug,
          summary: article.summary,
          body: article.body,
          status: article.status as typeof article.status,
        }}
        currentStatus={article.status}
        rejectReason={article.rejectReason}
        allowDirectPublish={isAdmin}
        submitLabel="保存修改"
        onSubmit={async (values) => {
          const res = await updateArticle({ data: { id: article.id, ...values } });
          if (!res.ok) return res.error;
          const nextStatus = "status" in res && res.status ? res.status : values.status;
          toast(
            nextStatus === "pending"
              ? "已提交审核"
              : nextStatus === "published"
                ? "已发布"
                : "草稿已保存",
          );
          setArticle({
            ...article,
            ...values,
            slug: res.slug,
            status: nextStatus,
            rejectReason:
              nextStatus === "pending" || nextStatus === "published"
                ? null
                : article.rejectReason,
            publishedAt: nextStatus === "published" ? article.publishedAt : null,
          });
          return null;
        }}
      />
      <div className="mt-4">
        <Button
          variant="destructive"
          onClick={() => {
            if (!confirm(`确定删除「${article.title}」？`)) return;
            void deleteMyArticle({ data: { id: article.id } }).then((res) => {
              if (!res.ok) {
                toast(res.error);
                return;
              }
              toast("已删除");
              void navigate({ to: "/account/articles" });
            });
          }}
        >
          删除文章
        </Button>
      </div>
    </SitePage>
  );
}
