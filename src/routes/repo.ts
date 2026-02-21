import { Elysia } from "elysia";
import { findRepoBySlug, starRepo, unstarRepo, isStarred, updateRepo } from "../db/repos";
import { getIssueCount } from "../db/issues";
import { repoHomePage } from "../views/pages/repo-home";
import { treePage } from "../views/pages/tree";
import { blobPage } from "../views/pages/blob";
import { commitsPage } from "../views/pages/commits";
import { commitPage } from "../views/pages/commit";
import { settingsPage } from "../views/pages/settings";
import {
  listBranches, listTags, listTree, getBlob, getCommitLog,
  getCommitDetail, getReadme, getDefaultBranch, hasAnyCommits, repoExists,
} from "../git/read";
import { deleteRepo, forkRepo } from "../services/repo-service";
import { validateSlug } from "../git/paths";
import { validateDescription } from "../middleware/input-validator";
import { getClientIp } from "../middleware/rate-limiter";
import { isBanned } from "../middleware/spam-detector";

function getSessionId(request: Request): string {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(/crustyhub_session=([^;]+)/);
  if (match) return match[1];
  return Math.random().toString(36).slice(2);
}

function html(body: string, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html", ...extraHeaders },
  });
}

export const repoRoutes = new Elysia()
  .get("/:slug", async ({ params, request }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404 - repo not found</h1>", 404);
    if (!repoExists(params.slug)) return html("<h1>repo data missing from disk</h1>", 500);

    const sessionId = getSessionId(request);
    const defaultBranch = await getDefaultBranch(params.slug);
    const commits = hasAnyCommits(params.slug);
    const [branches, tags, _hasCommits] = await Promise.all([
      listBranches(params.slug),
      listTags(params.slug),
      commits,
    ]);

    let tree: any[] = [];
    let log: any[] = [];
    let readme = null;
    const hasC = await commits;

    if (hasC) {
      [tree, log, readme] = await Promise.all([
        listTree(params.slug, defaultBranch),
        getCommitLog(params.slug, defaultBranch, 10),
        getReadme(params.slug, defaultBranch),
      ]);
    }

    const starred = await isStarred(repo.id, sessionId);
    const openIssues = await getIssueCount(repo.id, "open");

    const setCookie = `crustyhub_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
    return html(
      repoHomePage(repo, branches, tags, tree, log, readme, defaultBranch, hasC, starred, openIssues),
      200,
      { "set-cookie": setCookie }
    );
  })
  .get("/:slug/tree/:ref/*", async ({ params }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const ref = params.ref;
    const path = (params as any)["*"] || "";
    const entries = await listTree(params.slug, ref, path);
    return html(treePage(repo, ref, path, entries));
  })
  .get("/:slug/blob/:ref/*", async ({ params }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const ref = params.ref;
    const path = (params as any)["*"] || "";
    const content = await getBlob(params.slug, ref, path);
    if (content === null) return html("<h1>404 - file not found</h1>", 404);
    return html(blobPage(repo, ref, path, content));
  })
  .get("/:slug/raw/:ref/*", async ({ params }) => {
    const ref = params.ref;
    const path = (params as any)["*"] || "";
    const content = await getBlob(params.slug, ref, path);
    if (content === null) return new Response("not found", { status: 404 });
    return new Response(content, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  })
  .get("/:slug/commits/:ref", async ({ params }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const commits = await getCommitLog(params.slug, params.ref, 100);
    return html(commitsPage(repo, params.ref, commits));
  })
  .get("/:slug/commit/:sha", async ({ params }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const detail = await getCommitDetail(params.slug, params.sha);
    if (!detail) return html("<h1>404 - commit not found</h1>", 404);
    return html(commitPage(repo, detail.info, detail.diff));
  })
  .post("/:slug/star", async ({ params, request }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return new Response("not found", { status: 404 });

    const sessionId = getSessionId(request);
    const starred = await isStarred(repo.id, sessionId);
    if (starred) {
      await unstarRepo(repo.id, sessionId);
    } else {
      await starRepo(repo.id, sessionId);
    }

    return new Response(null, {
      status: 302,
      headers: {
        location: `/${params.slug}`,
        "set-cookie": `crustyhub_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
      },
    });
  })
  .get("/:slug/settings", async ({ params, query }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const branches = await listBranches(params.slug);
    const msg = (query as any).msg as string | undefined;
    return html(settingsPage(repo, branches, msg));
  })
  .post("/:slug/settings", async ({ params, body }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const { description, default_branch } = body as { description?: string; default_branch?: string };
    const { clean: cleanDesc, error: descError } = validateDescription(description);
    if (descError) {
      return html(settingsPage(repo, await listBranches(params.slug), descError), 400);
    }
    await updateRepo(repo.id, { description: cleanDesc, default_branch });

    return new Response(null, {
      status: 302,
      headers: { location: `/${params.slug}/settings?msg=saved` },
    });
  })
  .post("/:slug/delete", async ({ params, request }) => {
    const ip = getClientIp(request);
    const banBlock = isBanned(ip);
    if (banBlock) return banBlock;

    try {
      await deleteRepo(params.slug);
      return new Response(null, { status: 302, headers: { location: "/" } });
    } catch {
      return new Response(null, { status: 302, headers: { location: `/${params.slug}/settings` } });
    }
  })
  .post("/:slug/fork", async ({ params, body, request }) => {
    const ip = getClientIp(request);
    const banBlock = isBanned(ip);
    if (banBlock) return banBlock;

    const { fork_name } = body as { fork_name: string };
    if (!fork_name || !validateSlug(fork_name)) {
      return new Response(null, { status: 302, headers: { location: `/${params.slug}/settings` } });
    }
    try {
      await forkRepo(params.slug, fork_name);
      return new Response(null, { status: 302, headers: { location: `/${fork_name}` } });
    } catch {
      return new Response(null, { status: 302, headers: { location: `/${params.slug}/settings` } });
    }
  });
