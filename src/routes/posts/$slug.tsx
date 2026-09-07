import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarkdownBody } from "@/components/markdown-body";
import { SitePage } from "@/components/site-page";
import { getPublishedArticle } from "@/lib/articles";

export const Route = createFileRoute("/posts/$slug")({
  loader: async ({ params }) => {
    const res = await getPublishedArticle({ data: { slug: params.slug } });
    if (!res.article) throw notFound();
    return res;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.article
          ? `${loaderData.article.title} · 锋口`
          : "文章 · 锋口",
      },
      ...(loaderData?.article?.summary
        ? [{ name: "description", content: loaderData.article.summary }]
        : []),
    ],
  }),
  component: PostDetailPage,
});

function formatDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      timeZone: "Asia/Phnom_Penh",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function PostDetailPage() {
  const { article } = Route.useLoaderData();

  return (
    <SitePage
      title={article.title}
      subtitle={[
        article.authorName ? `作者 ${article.authorName}` : null,
        formatDate(article.publishedAt ?? article.updatedAt),
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <Link to="/posts" className="text-muted-foreground hover:text-foreground">
          全部文章
        </Link>
      }
    >
      {article.summary ? (
        <p className="mb-6 rounded-2xl border border-white/45 bg-white/35 px-4 py-3 text-sm leading-relaxed text-muted-foreground backdrop-blur-md dark:border-border/80 dark:bg-secondary/40">
          {article.summary}
        </p>
      ) : null}
      <article className="glass rounded-2xl p-5 sm:p-8">
        <MarkdownBody source={article.body} />
      </article>
    </SitePage>
  );
}
