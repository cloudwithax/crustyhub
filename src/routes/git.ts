import { handleGitRequest } from "../git/http-backend";
import { ensureRepoForPush } from "../services/repo-service";
import { validateSlug } from "../git/paths";
import { touchRepo } from "../db/repos";

export async function handleGitHttp(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.includes(".git/")) return undefined;

  const match = path.match(/^\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,62})\.git\/(.*)$/);
  if (!match) return undefined;

  const slug = match[1];
  if (!validateSlug(slug)) return undefined;

  const method = request.method;

  if (path.endsWith("/info/refs") && method === "GET") {
    const service = url.searchParams.get("service");
    if (service === "git-receive-pack") {
      await ensureRepoForPush(slug);
    }
    return handleGitRequest("GET", `/${slug}.git/info/refs`, url.search.slice(1), null, null);
  }

  if (path.endsWith("/git-upload-pack") && method === "POST") {
    return handleGitRequest(
      "POST", `/${slug}.git/git-upload-pack`, "",
      request.body as ReadableStream<Uint8Array>,
      request.headers.get("content-type")
    );
  }

  if (path.endsWith("/git-receive-pack") && method === "POST") {
    await ensureRepoForPush(slug);
    const resp = await handleGitRequest(
      "POST", `/${slug}.git/git-receive-pack`, "",
      request.body as ReadableStream<Uint8Array>,
      request.headers.get("content-type")
    );
    touchRepo(slug).catch(() => {});
    return resp;
  }

  if (path.endsWith("/HEAD") && method === "GET") {
    return handleGitRequest("GET", `/${slug}.git/HEAD`, "", null, null);
  }

  if (path.includes("/objects/") && method === "GET") {
    return handleGitRequest("GET", path, "", null, null);
  }

  return undefined;
}
