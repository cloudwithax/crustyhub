import { layout, escHtml, timeAgo } from "../layout";
import type { Repo } from "../../db/repos";
import type { TreeEntry, CommitInfo, BranchInfo } from "../../git/read";
import { renderMarkdown } from "../../services/markdown-service";
import { BASE_URL } from "../../config/env";

export function repoHomePage(
  repo: Repo,
  branches: BranchInfo[],
  tags: BranchInfo[],
  tree: TreeEntry[],
  commits: CommitInfo[],
  readme: { name: string; content: string } | null,
  defaultBranch: string,
  hasCommits: boolean,
  starred: boolean,
  openIssues: number,
  csrfToken?: string
): string {
  const cloneUrl = `${BASE_URL}/${repo.slug}.git`;

  if (!hasCommits) {
    return layout(repo.slug, `
      <div class="repo-header">
        <h1>📦 ${escHtml(repo.slug)}</h1>
        <p class="repo-desc">${escHtml(repo.description || "")}</p>
        <div class="repo-actions">
          <form method="POST" action="/${escHtml(repo.slug)}/star" style="display:inline">
            ${csrfToken ? `<input type="hidden" name="_csrf" value="${escHtml(csrfToken)}">` : ""}
            <button class="btn btn-sm">${starred ? "★ unstar" : "☆ star"} (${repo.star_count})</button>
          </form>
          <a href="/${escHtml(repo.slug)}/issues" class="btn btn-sm">issues (${openIssues})</a>
          <a href="/${escHtml(repo.slug)}/settings" class="btn btn-sm">settings</a>
        </div>
      </div>
      <div class="empty-repo">
        <h2>this repo is empty</h2>
        <p>push some code to get started:</p>
        <pre><code>git remote add origin ${escHtml(cloneUrl)}
git push -u origin main</code></pre>
        <p>or create a new repo and push:</p>
        <pre><code>mkdir my-project && cd my-project
git init
echo "# ${escHtml(repo.slug)}" > README.md
git add . && git commit -m "initial commit"
git remote add origin ${escHtml(cloneUrl)}
git push -u origin main</code></pre>
      </div>
    `);
  }

  const branchSelector = `
    <div class="branch-selector">
      <span class="current-branch">🌿 ${escHtml(defaultBranch)}</span>
      <span class="branch-count">${branches.length} branch${branches.length !== 1 ? "es" : ""}</span>
      <span class="tag-count">${tags.length} tag${tags.length !== 1 ? "s" : ""}</span>
    </div>
  `;

  const treeHtml = tree.length > 0 ? `
    <div class="file-tree">
      <table>
        <thead><tr><th>name</th><th>size</th></tr></thead>
        <tbody>
          ${tree
            .sort((a, b) => {
              if (a.type === "tree" && b.type !== "tree") return -1;
              if (a.type !== "tree" && b.type === "tree") return 1;
              return a.name.localeCompare(b.name);
            })
            .map((entry) => {
              const icon = entry.type === "tree" ? "📁" : "📄";
              const link = entry.type === "tree"
                ? `/${escHtml(repo.slug)}/tree/${escHtml(defaultBranch)}/${escHtml(entry.name)}`
                : `/${escHtml(repo.slug)}/blob/${escHtml(defaultBranch)}/${escHtml(entry.name)}`;
              const size = entry.type === "tree" ? "-" : formatSize(parseInt(entry.size) || 0);
              return `<tr>
                <td>${icon} <a href="${link}">${escHtml(entry.name)}</a></td>
                <td class="size">${size}</td>
              </tr>`;
            }).join("")}
        </tbody>
      </table>
    </div>
  ` : "";

  const readmeHtml = readme ? `
    <div class="readme-box">
      <div class="readme-header">📖 ${escHtml(readme.name)}</div>
      <div class="readme-body markdown-body">${renderMarkdown(readme.content)}</div>
    </div>
  ` : "";

  const commitsHtml = commits.length > 0 ? `
    <div class="recent-commits">
      <h3><a href="/${escHtml(repo.slug)}/commits/${escHtml(defaultBranch)}">recent commits</a></h3>
      ${commits.slice(0, 5).map((c) => `
        <div class="commit-row">
          <a href="/${escHtml(repo.slug)}/commit/${escHtml(c.hash)}" class="commit-hash">${escHtml(c.hash.slice(0, 8))}</a>
          <span class="commit-msg">${escHtml(c.subject)}</span>
          <span class="commit-meta">${escHtml(c.author)} &middot; ${timeAgo(c.date)}</span>
        </div>
      `).join("")}
    </div>
  ` : "";

  return layout(repo.slug, `
    <div class="repo-header">
      <h1>📦 ${escHtml(repo.slug)}</h1>
      <p class="repo-desc">${escHtml(repo.description || "")}</p>
      <div class="repo-actions">
        <form method="POST" action="/${escHtml(repo.slug)}/star" style="display:inline">
            ${csrfToken ? `<input type="hidden" name="_csrf" value="${escHtml(csrfToken)}">` : ""}
          <button class="btn btn-sm">${starred ? "★ unstar" : "☆ star"} (${repo.star_count})</button>
        </form>
        <a href="/${escHtml(repo.slug)}/issues" class="btn btn-sm">issues (${openIssues})</a>
        <a href="/${escHtml(repo.slug)}/settings" class="btn btn-sm">settings</a>
      </div>
    </div>
    <div class="clone-box">
      <label>clone:</label>
      <input type="text" value="${escHtml(cloneUrl)}" readonly onclick="this.select()">
    </div>
    ${branchSelector}
    ${treeHtml}
    ${commitsHtml}
    ${readmeHtml}
  `);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
