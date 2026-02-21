import { layout, escHtml } from "../layout";
import type { Repo } from "../../db/repos";
import type { BranchInfo } from "../../git/read";

export function settingsPage(repo: Repo, branches: BranchInfo[], message?: string): string {
  return layout(`${repo.slug} settings`, `
    <div class="repo-header">
      <h1><a href="/${escHtml(repo.slug)}">${escHtml(repo.slug)}</a> / settings</h1>
    </div>
    ${message ? `<div class="alert alert-success">${escHtml(message)}</div>` : ""}
    <form method="POST" action="/${escHtml(repo.slug)}/settings" class="form">
      <div class="form-group">
        <label for="description">description</label>
        <input type="text" id="description" name="description" value="${escHtml(repo.description || "")}">
      </div>
      <div class="form-group">
        <label for="default_branch">default branch</label>
        <select id="default_branch" name="default_branch">
          ${branches.map((b) => `<option value="${escHtml(b.name)}" ${b.name === repo.default_branch ? "selected" : ""}>${escHtml(b.name)}</option>`).join("")}
        </select>
      </div>
      <button type="submit" class="btn btn-primary">save</button>
    </form>
    <hr>
    <div class="danger-zone">
      <h3>danger zone</h3>
      <form method="POST" action="/${escHtml(repo.slug)}/delete" onsubmit="return confirm('are you sure? this cannot be undone.')">
        <button type="submit" class="btn btn-danger">delete repository</button>
      </form>
      <form method="POST" action="/${escHtml(repo.slug)}/fork" class="form" style="margin-top:1rem">
        <div class="form-group">
          <label for="fork_name">fork as</label>
          <input type="text" id="fork_name" name="fork_name" placeholder="${escHtml(repo.slug)}-fork" required>
        </div>
        <button type="submit" class="btn">fork repository</button>
      </form>
    </div>
  `);
}
