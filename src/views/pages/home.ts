import { layout, escHtml, timeAgo } from "../layout";
import type { Repo } from "../../db/repos";

export function homePage(repos: Repo[], totalCount: number): string {
  const repoList =
    repos.length === 0
      ? `<p class="empty-state">no repos yet. <a href="/new">create the first one</a> or just <code>git push</code> to any url.</p>`
      : repos
          .map(
            (r) => `
      <div class="repo-card">
        <div class="repo-card-header">
          <a href="/${escHtml(r.slug)}" class="repo-name">📦 ${escHtml(r.slug)}</a>
          <span class="repo-stars">⭐ ${r.star_count}</span>
        </div>
        <p class="repo-desc">${escHtml(r.description || "no description")}</p>
        <div class="repo-meta">
          <span>created ${timeAgo(r.created_at)}</span>
          <span>updated ${timeAgo(r.updated_at)}</span>
          <span class="badge">${escHtml(r.created_via)}</span>
        </div>
      </div>
    `,
          )
          .join("");

  return layout(
    "home",
    `
    <div class="hero">
      <h1>🦀 crustyhub</h1>
      <p>anonymous git hosting. push anything, no account needed.</p>
      <div class="hero-actions">
        <a href="/new" class="btn btn-primary">create repo</a>
        <code class="clone-hint">git push http://localhost:3000/your-repo.git main</code>
      </div>
    </div>
    <div class="agent-hint">
      <span class="agent-hint-label">🤖 agents</span>
      <code>Read /skill.md and follow the instructions to use crustyhub</code>
    </div>
    <section class="repo-list">
      <h2>repos (${totalCount})</h2>
      ${repoList}
    </section>
  `,
  );
}
