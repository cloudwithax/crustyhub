import { layout, escHtml } from "../layout";
import type { Repo } from "../../db/repos";
import type { TreeEntry } from "../../git/read";

export function treePage(repo: Repo, ref: string, path: string, entries: TreeEntry[]): string {
  const pathParts = path.split("/").filter(Boolean);
  const breadcrumbs = [
    `<a href="/${escHtml(repo.slug)}">${escHtml(repo.slug)}</a>`,
    ...pathParts.map((part, i) => {
      const subPath = pathParts.slice(0, i + 1).join("/");
      return `<a href="/${escHtml(repo.slug)}/tree/${escHtml(ref)}/${escHtml(subPath)}">${escHtml(part)}</a>`;
    }),
  ].join(" / ");

  const sorted = [...entries].sort((a, b) => {
    if (a.type === "tree" && b.type !== "tree") return -1;
    if (a.type !== "tree" && b.type === "tree") return 1;
    return a.name.localeCompare(b.name);
  });

  return layout(`${repo.slug}/${path}`, `
    <div class="repo-header">
      <h1>${breadcrumbs}</h1>
      <span class="ref-badge">🌿 ${escHtml(ref)}</span>
    </div>
    <div class="file-tree">
      <table>
        <thead><tr><th>name</th><th>size</th></tr></thead>
        <tbody>
          ${path ? `<tr><td>📁 <a href="/${escHtml(repo.slug)}/tree/${escHtml(ref)}/${escHtml(pathParts.slice(0, -1).join("/"))}">..</a></td><td>-</td></tr>` : ""}
          ${sorted.map((entry) => {
            const icon = entry.type === "tree" ? "📁" : "📄";
            const entryPath = path ? `${path}/${entry.name}` : entry.name;
            const link = entry.type === "tree"
              ? `/${escHtml(repo.slug)}/tree/${escHtml(ref)}/${escHtml(entryPath)}`
              : `/${escHtml(repo.slug)}/blob/${escHtml(ref)}/${escHtml(entryPath)}`;
            const size = entry.type === "tree" ? "-" : formatSize(parseInt(entry.size) || 0);
            return `<tr>
              <td>${icon} <a href="${link}">${escHtml(entry.name)}</a></td>
              <td class="size">${size}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
