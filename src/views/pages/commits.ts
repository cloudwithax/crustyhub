import { layout, escHtml, timeAgo } from "../layout";
import type { Repo } from "../../db/repos";
import type { CommitInfo } from "../../git/read";

export function commitsPage(repo: Repo, ref: string, commits: CommitInfo[]): string {
  return layout(`${repo.slug} commits`, `
    <div class="repo-header">
      <h1><a href="/${escHtml(repo.slug)}">${escHtml(repo.slug)}</a> / commits</h1>
      <span class="ref-badge">🌿 ${escHtml(ref)}</span>
    </div>
    <div class="commit-list">
      ${commits.length === 0 ? "<p>no commits yet.</p>" : commits.map((c) => `
        <div class="commit-row">
          <div class="commit-main">
            <a href="/${escHtml(repo.slug)}/commit/${escHtml(c.hash)}" class="commit-msg">${escHtml(c.subject)}</a>
          </div>
          <div class="commit-details">
            <a href="/${escHtml(repo.slug)}/commit/${escHtml(c.hash)}" class="commit-hash">${escHtml(c.hash.slice(0, 8))}</a>
            <span class="commit-author">${escHtml(c.author)}</span>
            <span class="commit-date">${timeAgo(c.date)}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `);
}
