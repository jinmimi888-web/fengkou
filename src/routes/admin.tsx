import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SitePage } from "@/components/site-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminApproveArticle,
  adminDeleteArticle,
  adminListArticles,
  adminListUsers,
  adminRejectArticle,
  adminSetUserRole,
  adminUnpublishArticle,
  getAdminStatus,
  type AdminArticle,
  type UserRole,
} from "@/lib/admin";
import {
  articleStatusBadgeVariant,
  articleStatusLabel,
  REJECT_REASON_MAX,
} from "@/lib/articles";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "站点管理 · 锋口" }],
  }),
  component: AdminPage,
});

type AdminUser = Awaited<ReturnType<typeof adminListUsers>>["users"][number];
type Tab = "pending" | "articles" | "users";

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    const status = await getAdminStatus();
    if (!status.admin) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    const [a, u] = await Promise.all([adminListArticles(), adminListUsers()]);
    setArticles(a.articles);
    setUsers(u.users);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load().catch(() => setAllowed(false));
  }, [user, load]);

  const pending = useMemo(
    () => articles.filter((a) => a.status === "pending"),
    [articles],
  );

  if (isPending) return null;
  if (!user) return <RedirectToSignIn />;

  if (allowed === null) {
    return (
      <SitePage title="站点管理">
        <p className="text-sm text-muted-foreground">核对权限中…</p>
      </SitePage>
    );
  }

  if (!allowed) {
    return (
      <SitePage title="站点管理">
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          没有管理员权限。
          <p className="mt-2 text-xs">
            可将邮箱加入环境变量 ADMIN_EMAILS，或由现有管理员把你的角色设为 admin。
          </p>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/">返回首页</Link>
            </Button>
          </div>
        </div>
      </SitePage>
    );
  }

  function renderArticleActions(a: AdminArticle) {
    return (
      <div className="flex flex-wrap gap-2">
        {a.status === "pending" ? (
          <>
            <Button
              size="sm"
              disabled={busy === a.id}
              onClick={() => {
                setBusy(a.id);
                void adminApproveArticle({ data: { id: a.id } })
                  .then((res) => {
                    if (!res.ok) {
                      toast(res.error);
                      return;
                    }
                    toast("已通过并发布");
                    return load();
                  })
                  .finally(() => setBusy(null));
              }}
            >
              通过
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === a.id}
              onClick={() => {
                setRejectingId(a.id);
                setRejectReason("");
              }}
            >
              驳回
            </Button>
          </>
        ) : null}
        {a.status === "published" ? (
          <>
            <Button asChild size="sm" variant="outline">
              <Link to="/posts/$slug" params={{ slug: a.slug }}>
                查看
              </Link>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === a.id}
              onClick={() => {
                setBusy(a.id);
                void adminUnpublishArticle({ data: { id: a.id } })
                  .then(() => {
                    toast("已下架");
                    return load();
                  })
                  .finally(() => setBusy(null));
              }}
            >
              下架
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="destructive"
          disabled={busy === a.id}
          onClick={() => {
            if (!confirm(`确定删除「${a.title}」？`)) return;
            setBusy(a.id);
            void adminDeleteArticle({ data: { id: a.id } })
              .then(() => {
                toast("已删除");
                return load();
              })
              .finally(() => setBusy(null));
          }}
        >
          删除
        </Button>
      </div>
    );
  }

  function renderArticleRow(a: AdminArticle) {
    return (
      <li
        key={a.id}
        className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{a.title}</span>
            <Badge variant={articleStatusBadgeVariant(a.status)}>
              {articleStatusLabel(a.status)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {a.authorEmail || a.authorName || a.userId} · /posts/{a.slug}
          </p>
          {a.summary ? (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{a.summary}</p>
          ) : null}
          {a.status === "rejected" && a.rejectReason ? (
            <p className="mt-1 text-xs text-down">驳回原因：{a.rejectReason}</p>
          ) : null}
          {rejectingId === a.id ? (
            <div className="mt-3 grid gap-2 rounded-xl border border-border/60 bg-secondary/30 p-3">
              <label className="grid gap-1 text-xs text-muted-foreground">
                驳回原因（可选，≤{REJECT_REASON_MAX}）
                <Input
                  value={rejectReason}
                  maxLength={REJECT_REASON_MAX}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="例如：内容需补充出处 / 表述不清晰"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === a.id}
                  onClick={() => {
                    setBusy(a.id);
                    void adminRejectArticle({
                      data: { id: a.id, reason: rejectReason },
                    })
                      .then((res) => {
                        if (!res.ok) {
                          toast(res.error);
                          return;
                        }
                        toast("已驳回");
                        setRejectingId(null);
                        setRejectReason("");
                        return load();
                      })
                      .finally(() => setBusy(null));
                  }}
                >
                  确认驳回
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectReason("");
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        {renderArticleActions(a)}
      </li>
    );
  }

  return (
    <SitePage
      title="站点管理"
      subtitle="审核文章、管理用户角色"
      wide
      actions={
        <Link
          to="/account/articles"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          我的文章
        </Link>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === "pending" ? "default" : "outline"}
          onClick={() => setTab("pending")}
        >
          待审核{pending.length ? `（${pending.length}）` : ""}
        </Button>
        <Button
          size="sm"
          variant={tab === "articles" ? "default" : "outline"}
          onClick={() => setTab("articles")}
        >
          全部文章
        </Button>
        <Button
          size="sm"
          variant={tab === "users" ? "default" : "outline"}
          onClick={() => setTab("users")}
        >
          用户列表
        </Button>
      </div>

      {tab === "pending" ? (
        <ul className="grid gap-3">
          {pending.length === 0 ? (
            <li className="glass rounded-2xl p-6 text-sm text-muted-foreground">
              暂无待审核文章
            </li>
          ) : (
            pending.map(renderArticleRow)
          )}
        </ul>
      ) : null}

      {tab === "articles" ? (
        <ul className="grid gap-3">
          {articles.length === 0 ? (
            <li className="glass rounded-2xl p-6 text-sm text-muted-foreground">暂无文章</li>
          ) : (
            articles.map(renderArticleRow)
          )}
        </ul>
      ) : null}

      {tab === "users" ? (
        <ul className="grid gap-3">
          {users.map((u) => (
            <li
              key={u.id}
              className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{u.name || "未命名"}</span>
                  <Badge variant={u.role === "admin" ? "warn" : "default"}>
                    {u.role === "admin" ? "管理员" : "用户"}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["user", "admin"] as UserRole[]).map((role) => (
                  <Button
                    key={role}
                    size="sm"
                    variant={u.role === role ? "default" : "outline"}
                    disabled={busy === u.id || u.role === role}
                    onClick={() => {
                      setBusy(u.id);
                      void adminSetUserRole({ data: { userId: u.id, role } })
                        .then((res) => {
                          if (!res.ok) {
                            toast(res.error);
                            return;
                          }
                          toast(role === "admin" ? "已设为管理员" : "已设为普通用户");
                          return load();
                        })
                        .finally(() => setBusy(null));
                    }}
                  >
                    {role === "admin" ? "设为管理员" : "设为用户"}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </SitePage>
  );
}
