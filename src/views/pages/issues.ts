import { layout, escHtml, timeAgo } from "../layout";
import type { Repo } from "../../db/repos";
import type { Issue } from "../../db/issues";

export function issuesPage(repo: Repo, issues: Issue[], state: string, openCount: number, closedCount: number): string {
  return layout(`${repo.slug} issues`, `
    <div class="repo-header">
      <h1><a href="/${escHtml(repo.slug)}">${escHtml(repo.slug)}</a> / issues</h1>
      <a href="/${escHtml(repo.slug)}/issues/new" class="btn btn-primary">new issue</a>
    </div>
    <div class="issue-filters">
      <a href="/${escHtml(repo.slug)}/issues?state=open" class="${state === "open" ? "active" : ""}">${openCount} open</a>
      <a href="/${escHtml(repo.slug)}/issues?state=closed" class="${state === "closed" ? "active" : ""}">${closedCount} closed</a>
    </div>
    <div class="issue-list">
      ${issues.length === 0 ? `<p class="empty-state">no ${state} issues.</p>` : issues.map((issue) => `
        <div class="issue-row">
          <span class="issue-icon">${issue.state === "open" ? "🟢" : "🔴"}</span>
          <div class="issue-main">
            <a href="/${escHtml(repo.slug)}/issues/${issue.number}" class="issue-title">${escHtml(issue.title)}</a>
            <div class="issue-meta">
              #${issue.number} &middot; opened ${timeAgo(issue.created_at)} by ${escHtml(issue.author_name)}
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `);
}

export function newIssuePage(repo: Repo, error?: string): string {
  return layout(`${repo.slug} - new issue`, `
    <div class="repo-header">
      <h1><a href="/${escHtml(repo.slug)}">${escHtml(repo.slug)}</a> / <a href="/${escHtml(repo.slug)}/issues">issues</a> / new</h1>
    </div>
    ${error ? `<div class="alert alert-error">${escHtml(error)}</div>` : ""}
    <form method="POST" action="/${escHtml(repo.slug)}/issues/new" class="form">
      <div class="form-group">
        <label for="title">title</label>
        <input type="text" id="title" name="title" required autofocus>
      </div>
      <div class="form-group">
        <label for="body">description (markdown supported)</label>
        <textarea id="body" name="body" rows="10"></textarea>
      </div>
      <div class="form-group">
        <label for="author">your name (optional)</label>
        <input type="text" id="author" name="author" placeholder="anonymous">
      </div>
      <button type="submit" class="btn btn-primary">create issue</button>
    </form>
  `);
}

export function issueDetailPage(repo: Repo, issue: Issue, comments: { body_markdown: string; author_name: string; created_at: Date }[], renderedBody: string, renderedComments: string[]): string {
  return layout(`${repo.slug} #${issue.number}`, `
    <div class="repo-header">
      <h1><a href="/${escHtml(repo.slug)}">${escHtml(repo.slug)}</a> / <a href="/${escHtml(repo.slug)}/issues">issues</a> / #${issue.number}</h1>
    </div>
    <div class="issue-detail">
      <div class="issue-title-row">
        <h2>${escHtml(issue.title)}</h2>
        <span class="badge ${issue.state}">${issue.state}</span>
      </div>
      <div class="issue-meta">
        opened ${timeAgo(issue.created_at)} by ${escHtml(issue.author_name)}
      </div>
      ${issue.body_markdown ? `<div class="issue-body markdown-body">${renderedBody}</div>` : ""}
    </div>
    <div class="comments">
      ${comments.map((c, i) => `
        <div class="comment">
          <div class="comment-header">
            <strong>${escHtml(c.author_name)}</strong> &middot; ${timeAgo(c.created_at)}
          </div>
          <div class="comment-body markdown-body">${renderedComments[i]}</div>
        </div>
      `).join("")}
    </div>
    <div class="comment-form">
      <h3>add a comment</h3>
      <form method="POST" action="/${escHtml(repo.slug)}/issues/${issue.number}/comment" class="form">
        <div class="form-group">
          <textarea name="body" rows="5" required placeholder="leave a comment (markdown supported)"></textarea>
        </div>
        <div class="form-group">
          <input type="text" name="author" placeholder="your name (optional)">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">comment</button>
          <form method="POST" action="/${escHtml(repo.slug)}/issues/${issue.number}/toggle" style="display:inline">
            <button type="submit" class="btn btn-sm">${issue.state === "open" ? "close issue" : "reopen issue"}</button>
          </form>
        </div>
      </form>
    </div>
  `);
}
