import { handleGitRequest } from "../git/http-backend";
import { ensureRepoForPush, bundleRepo } from "../services/repo-service";
import { validateSlug } from "../git/paths";
import { touchRepo } from "../db/repos";
import { invalidateCache } from "../services/pages-service";
import { getClientIp } from "../middleware/rate-limiter";
import {
  checkPushSize,
  acquireGitOp,
  releaseGitOp,
  checkRepoCreationQuota,
} from "../middleware/git-guard";

export async function handleGitHttp(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.includes(".git/")) return undefined;

  const match = path.match(/^\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,62})\.git\/(.*)$/);
  if (!match) return undefined;

  const slug = match[1];
  if (!validateSlug(slug)) return undefined;

  const method = request.method;
  const ip = getClientIp(request);

  // Concurrency guard for all git operations
  const concurrencyBlock = acquireGitOp(ip);
  if (concurrencyBlock) return concurrencyBlock;

  try {
    if (path.endsWith("/info/refs") && method === "GET") {
      const service = url.searchParams.get("service");
      if (service === "git-receive-pack") {
        const quotaBlock = checkRepoCreationQuota(ip);
        if (quotaBlock) return quotaBlock;
        await ensureRepoForPush(slug);
      }
      return await handleGitRequest("GET", `/${slug}.git/info/refs`, url.search.slice(1), null, null);
    }

    if (path.endsWith("/git-upload-pack") && method === "POST") {
      return await handleGitRequest(
        "POST", `/${slug}.git/git-upload-pack`, "",
        request.body as ReadableStream<Uint8Array>,
        request.headers.get("content-type")
      );
    }

    if (path.endsWith("/git-receive-pack") && method === "POST") {
      const sizeBlock = checkPushSize(request);
      if (sizeBlock) return sizeBlock;

      await ensureRepoForPush(slug);
      const resp = await handleGitRequest(
        "POST", `/${slug}.git/git-receive-pack`, "",
        request.body as ReadableStream<Uint8Array>,
        request.headers.get("content-type")
      );
      touchRepo(slug).catch(() => {});
      invalidateCache(slug).catch(() => {});
      bundleRepo(slug).catch(() => {});
      return resp;
    }

    if (path.endsWith("/HEAD") && method === "GET") {
      return await handleGitRequest("GET", `/${slug}.git/HEAD`, "", null, null);
    }

    if (path.includes("/objects/") && method === "GET") {
      return await handleGitRequest("GET", path, "", null, null);
    }

    return undefined;
  } finally {
    releaseGitOp(ip);
  }
}
