import { layout } from "../layout";

export function newRepoPage(error?: string, csrfToken?: string): string {
  return layout("new repo", `
    <div class="container-narrow">
      <h1>create a new repository</h1>
      <p>or just <code>git push</code> to any url and it'll be created automatically.</p>
      ${error ? `<div class="alert alert-error">${error}</div>` : ""}
      <form method="POST" action="/new" class="form">
        ${csrfToken ? `<input type="hidden" name="_csrf" value="${csrfToken}">` : ""}
        <div class="form-group">
          <label for="slug">repository name</label>
          <input type="text" id="slug" name="slug" required
            pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}"
            placeholder="my-cool-project" autofocus>
          <small>letters, numbers, dots, hyphens, underscores. max 63 chars.</small>
        </div>
        <div class="form-group">
          <label for="description">description (optional)</label>
          <input type="text" id="description" name="description"
            placeholder="a brief description of your project">
        </div>
        <button type="submit" class="btn btn-primary">create repository</button>
      </form>
    </div>
  `);
}
