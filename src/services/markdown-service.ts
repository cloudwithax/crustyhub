import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

function sanitize(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "");
}

export function renderMarkdown(source: string): string {
  const raw = marked.parse(source) as string;
  return sanitize(raw);
}
