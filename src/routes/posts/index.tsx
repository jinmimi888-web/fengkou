import { createFileRoute, Link } from "@tanstack/react-router";
import { SitePage } from "@/components/site-page";
import { Badge } from "@/components/ui/badge";
import { listPublishedArticles } from "@/lib/articles";

export const Route = createFileRoute("/posts/")({
  head: () => ({
    meta: [{ title: "文章 · 锋口" }],
  }),
  loader: async () => listPublishedArticles(),
  component: PostsIndexPage,
});

function formatDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      timeZone: "Asia/Phnom_Penh",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function PostsIndexPage() {
  const { articles } = Route.useLoaderData();

  return (
    <SitePage title="文章" subtitle="已发布的公开内容">
      {articles.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          暂无已发布文章。登录后可在「我的文章」撰写。
        </div>
      ) : (
        <ul className="grid gap-3">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                to="/posts/$slug"
                params={{ slug: a.slug }}
                className="glass block rounded-2xl p-5 transition hover:bg-white/70 dark:hover:bg-secondary/60"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-serif text-xl tracking-tight text-foreground">
                    {a.title}
                  </h2>
                  <Badge variant="wait">已发布</Badge>
                </div>
                {a.summary ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {a.summary}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {a.authorName ? `${a.authorName} · ` : ""}
                  {formatDate(a.publishedAt ?? a.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SitePage>
  );
}
