import { Elysia } from "elysia";
import { findRepoBySlug } from "../db/repos";
import * as issuesDb from "../db/issues";
import { issuesPage, newIssuePage, issueDetailPage } from "../views/pages/issues";
import { renderMarkdown } from "../services/markdown-service";
import {
  validateIssueTitle,
  validateIssueBody,
  validateAuthor,
} from "../middleware/input-validator";
import { getClientIp } from "../middleware/rate-limiter";
import { scoreWriteRequest, isBanned, checkBannedPatterns } from "../middleware/spam-detector";
import { getOrCreateCsrfToken } from "../middleware/csrf";

function getSessionId(request: Request): string {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(/crustyhub_session=([^;]+)/);
  if (match) return match[1];
  return Math.random().toString(36).slice(2);
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

export const issueRoutes = new Elysia()
  .get("/:slug/issues", async ({ params, query }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const state = ((query as any).state || "open") as "open" | "closed";
    const [issues, openCount, closedCount] = await Promise.all([
      issuesDb.listIssues(repo.id, state),
      issuesDb.getIssueCount(repo.id, "open"),
      issuesDb.getIssueCount(repo.id, "closed"),
    ]);

    return html(issuesPage(repo, issues, state, openCount, closedCount));
  })
  .get("/:slug/issues/new", async ({ params, request }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);
    const sessionId = getSessionId(request);
    const csrfToken = getOrCreateCsrfToken(sessionId);
    return html(newIssuePage(repo, undefined, csrfToken));
  })
  .post("/:slug/issues/new", async ({ params, body, request }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const ip = getClientIp(request);
    const banBlock = isBanned(ip);
    if (banBlock) return banBlock;

    const { title, body: issueBody, author } = body as { title: string; body?: string; author?: string };

    const { clean: cleanTitle, error: titleError } = validateIssueTitle(title);
    if (titleError) {
      return html(newIssuePage(repo, titleError), 400);
    }

    const { clean: cleanBody, error: bodyError } = validateIssueBody(issueBody);
    if (bodyError) {
      return html(newIssuePage(repo, bodyError), 400);
    }

    const { clean: cleanAuthor } = validateAuthor(author);

    const bannedBlock = checkBannedPatterns(cleanTitle, cleanBody);
    if (bannedBlock) return bannedBlock;

    const spamBlock = scoreWriteRequest(ip, { title: cleanTitle, body: cleanBody });
    if (spamBlock) return spamBlock;

    const issue = await issuesDb.createIssue(repo.id, cleanTitle, cleanBody, cleanAuthor);
    return new Response(null, {
      status: 302,
      headers: { location: `/${params.slug}/issues/${issue.number}` },
    });
  })
  .get("/:slug/issues/:number", async ({ params, request }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const issueNumber = parseInt(params.number as string, 10);
    if (isNaN(issueNumber)) return html("<h1>404</h1>", 404);

    const issue = await issuesDb.getIssue(repo.id, issueNumber);
    if (!issue) return html("<h1>404 - issue not found</h1>", 404);

    const comments = await issuesDb.getIssueComments(issue.id);
    const renderedBody = renderMarkdown(issue.body_markdown);
    const renderedComments = comments.map((c) => renderMarkdown(c.body_markdown));

    const sessionId = getSessionId(request);
    const csrfToken = getOrCreateCsrfToken(sessionId);

    return html(issueDetailPage(repo, issue, comments, renderedBody, renderedComments, csrfToken));
  })
  .post("/:slug/issues/:number/comment", async ({ params, body, request }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return new Response("not found", { status: 404 });

    const issueNumber = parseInt(params.number as string, 10);
    const issue = await issuesDb.getIssue(repo.id, issueNumber);
    if (!issue) return new Response("not found", { status: 404 });

    const ip = getClientIp(request);
    const banBlock = isBanned(ip);
    if (banBlock) return banBlock;

    const { body: commentBody, author } = body as { body: string; author?: string };

    const { clean: cleanBody, error: bodyError } = validateIssueBody(commentBody);
    if (bodyError) {
      return new Response(bodyError, { status: 400 });
    }

    const { clean: cleanAuthor } = validateAuthor(author);

    if (cleanBody) {
      const bannedBlock = checkBannedPatterns(cleanBody);
      if (bannedBlock) return bannedBlock;

      const spamBlock = scoreWriteRequest(ip, { body: cleanBody });
      if (spamBlock) return spamBlock;

      await issuesDb.addIssueComment(issue.id, cleanBody, cleanAuthor);
    }

    return new Response(null, {
      status: 302,
      headers: { location: `/${params.slug}/issues/${issueNumber}` },
    });
  })
  .post("/:slug/issues/:number/toggle", async ({ params, request }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return new Response("not found", { status: 404 });

    const ip = getClientIp(request);
    const banBlock = isBanned(ip);
    if (banBlock) return banBlock;

    const issueNumber = parseInt(params.number as string, 10);
    const issue = await issuesDb.getIssue(repo.id, issueNumber);
    if (!issue) return new Response("not found", { status: 404 });

    const newState = issue.state === "open" ? "closed" : "open";
    await issuesDb.updateIssueState(repo.id, issueNumber, newState);

    return new Response(null, {
      status: 302,
      headers: { location: `/${params.slug}/issues/${issueNumber}` },
    });
  });
