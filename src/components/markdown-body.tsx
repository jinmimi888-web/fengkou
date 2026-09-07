import { cn } from "@/lib/utils";

/** Escape HTML then apply a small markdown subset — safe for untrusted author body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

export function renderMarkdownToHtml(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(escapeHtml(line));
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeLists();
      continue;
    }

    const h = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      html.push(`<h${level}>${inlineFormat(escapeHtml(h[2]))}</h${level}>`);
      continue;
    }

    const ul = trimmed.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inlineFormat(escapeHtml(ul[1]))}</li>`);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inlineFormat(escapeHtml(ol[1]))}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p>${inlineFormat(escapeHtml(trimmed))}</p>`);
  }

  if (inCode) html.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`);
  closeLists();
  return html.join("\n");
}

export function MarkdownBody({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const html = renderMarkdownToHtml(source || "");
  return (
    <div
      className={cn(
        "prose-fengkou space-y-3 text-sm leading-relaxed text-foreground/90",
        "[&_h1]:font-serif [&_h1]:text-2xl [&_h1]:tracking-tight",
        "[&_h2]:font-serif [&_h2]:text-xl [&_h2]:tracking-tight",
        "[&_h3]:font-serif [&_h3]:text-lg",
        "[&_a]:text-tint [&_a]:underline-offset-2 hover:[&_a]:underline",
        "[&_code]:rounded-md [&_code]:bg-secondary/80 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-secondary/60 [&_pre]:p-3 [&_pre]:text-xs",
        "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
