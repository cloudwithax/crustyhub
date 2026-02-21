import { layout, escHtml } from "../layout";
import type { Repo } from "../../db/repos";
import { renderMarkdown } from "../../services/markdown-service";

export function blobPage(repo: Repo, ref: string, path: string, content: string): string {
  const pathParts = path.split("/").filter(Boolean);
  const fileName = pathParts[pathParts.length - 1] || path;
  const dirPath = pathParts.slice(0, -1).join("/");

  const breadcrumbs = [
    `<a href="/${escHtml(repo.slug)}">${escHtml(repo.slug)}</a>`,
    ...pathParts.slice(0, -1).map((part, i) => {
      const subPath = pathParts.slice(0, i + 1).join("/");
      return `<a href="/${escHtml(repo.slug)}/tree/${escHtml(ref)}/${escHtml(subPath)}">${escHtml(part)}</a>`;
    }),
    `<span>${escHtml(fileName)}</span>`,
  ].join(" / ");

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const isMarkdown = ["md", "markdown", "mdown"].includes(ext);
  const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext);
  const lineCount = content.split("\n").length;
  const byteSize = new TextEncoder().encode(content).length;

  let fileContent: string;
  if (isImage) {
    fileContent = `<div class="image-preview"><p>(binary image file, ${formatSize(byteSize)})</p></div>`;
  } else if (isMarkdown) {
    fileContent = `
      <div class="blob-rendered markdown-body">${renderMarkdown(content)}</div>
      <details>
        <summary>view source</summary>
        <div class="blob-code"><pre><code>${numberedLines(content)}</code></pre></div>
      </details>
    `;
  } else {
    fileContent = `<div class="blob-code"><pre><code>${numberedLines(content)}</code></pre></div>`;
  }

  return layout(`${repo.slug}/${path}`, `
    <div class="repo-header">
      <h1>${breadcrumbs}</h1>
      <span class="ref-badge">🌿 ${escHtml(ref)}</span>
    </div>
    <div class="blob-header">
      <span>${lineCount} lines</span>
      <span>${formatSize(byteSize)}</span>
      <a href="/${escHtml(repo.slug)}/raw/${escHtml(ref)}/${escHtml(path)}" class="btn btn-sm">raw</a>
    </div>
    ${fileContent}
  `);
}

function numberedLines(content: string): string {
  return content.split("\n").map((line, i) => {
    const num = i + 1;
    return `<span class="line-number" id="L${num}">${num}</span>${escHtml(line)}`;
  }).join("\n");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
