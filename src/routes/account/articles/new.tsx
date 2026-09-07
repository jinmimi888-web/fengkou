import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArticleForm } from "@/components/article-form";
import { SitePage } from "@/components/site-page";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getAdminStatus } from "@/lib/admin";
import { createArticle, articleStatusLabel } from "@/lib/articles";
import { toast } from "sonner";

export const Route = createFileRoute("/account/articles/new")({
  head: () => ({
    meta: [{ title: "写新文章 · 锋口" }],
  }),
  component: NewArticlePage,
});

function NewArticlePage() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getAdminStatus()
      .then((s) => setIsAdmin(s.admin))
      .catch(() => setIsAdmin(false));
  }, [user]);

  if (isPending) return null;
  if (!user) return <RedirectToSignIn />;

  return (
    <SitePage
      title="写新文章"
      subtitle="支持 Markdown；保存草稿或提交审核"
      actions={
        <Link
          to="/account/articles"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          返回列表
        </Link>
      }
    >
      <ArticleForm
        submitLabel="保存"
        allowDirectPublish={isAdmin}
        onSubmit={async (values) => {
          const res = await createArticle({ data: values });
          if (!res.ok) return res.error;
          const label =
            "status" in res && res.status
              ? articleStatusLabel(res.status)
              : values.status === "published"
                ? "已发布"
                : values.status === "pending"
                  ? "已提交审核"
                  : "草稿已保存";
          toast(label);
          void navigate({ to: "/account/articles/$id", params: { id: res.id } });
          return null;
        }}
      />
    </SitePage>
  );
}
