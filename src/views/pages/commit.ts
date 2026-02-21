import { layout, escHtml, timeAgo } from "../layout";
import type { Repo } from "../../db/repos";
import type { CommitInfo } from "../../git/read";

export function commitPage(repo: Repo, info: CommitInfo, diff: string): string {
  const diffHtml = formatDiff(diff);

  return layout(`${repo.slug} - ${info.hash.slice(0, 8)}`, `
    <div class="repo-header">
      <h1><a href="/${escHtml(repo.slug)}">${escHtml(repo.slug)}</a> / commit</h1>
    </div>
    <div class="commit-detail">
      <h2>${escHtml(info.subject)}</h2>
      <div class="commit-meta-detail">
        <span class="commit-hash">${escHtml(info.hash)}</span>
        <span>by <strong>${escHtml(info.author)}</strong> &lt;${escHtml(info.email)}&gt;</span>
        <span>${timeAgo(info.date)}</span>
        ${info.parents.length > 0 ? `<span>parent${info.parents.length > 1 ? "s" : ""}: ${info.parents.map((p) => `<a href="/${escHtml(repo.slug)}/commit/${escHtml(p)}">${escHtml(p.slice(0, 8))}</a>`).join(", ")}</span>` : ""}
      </div>
    </div>
    <div class="diff-view">
      <pre><code>${diffHtml}</code></pre>
    </div>
  `);
}

function formatDiff(raw: string): string {
  return raw.split("\n").map((line) => {
    const escaped = escHtml(line);
    if (line.startsWith("+") && !line.startsWith("+++")) {
      return `<span class="diff-add">${escaped}</span>`;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      return `<span class="diff-del">${escaped}</span>`;
    }
    if (line.startsWith("@@")) {
      return `<span class="diff-hunk">${escaped}</span>`;
    }
    if (line.startsWith("diff --git")) {
      return `<span class="diff-file">${escaped}</span>`;
    }
    return escaped;
  }).join("\n");
}
