import { Elysia } from "elysia";
import { findRepoBySlug } from "../db/repos";
import * as issuesDb from "../db/issues";
import { issuesPage, newIssuePage, issueDetailPage } from "../views/pages/issues";
import { renderMarkdown } from "../services/markdown-service";

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
  .get("/:slug/issues/new", async ({ params }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);
    return html(newIssuePage(repo));
  })
  .post("/:slug/issues/new", async ({ params, body }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const { title, body: issueBody, author } = body as { title: string; body?: string; author?: string };
    if (!title?.trim()) {
      return html(newIssuePage(repo, "title is required"), 400);
    }

    const issue = await issuesDb.createIssue(repo.id, title.trim(), issueBody || "", author?.trim() || "anonymous");
    return new Response(null, {
      status: 302,
      headers: { location: `/${params.slug}/issues/${issue.number}` },
    });
  })
  .get("/:slug/issues/:number", async ({ params }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return html("<h1>404</h1>", 404);

    const issueNumber = parseInt(params.number as string, 10);
    if (isNaN(issueNumber)) return html("<h1>404</h1>", 404);

    const issue = await issuesDb.getIssue(repo.id, issueNumber);
    if (!issue) return html("<h1>404 - issue not found</h1>", 404);

    const comments = await issuesDb.getIssueComments(issue.id);
    const renderedBody = renderMarkdown(issue.body_markdown);
    const renderedComments = comments.map((c) => renderMarkdown(c.body_markdown));

    return html(issueDetailPage(repo, issue, comments, renderedBody, renderedComments));
  })
  .post("/:slug/issues/:number/comment", async ({ params, body }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return new Response("not found", { status: 404 });

    const issueNumber = parseInt(params.number as string, 10);
    const issue = await issuesDb.getIssue(repo.id, issueNumber);
    if (!issue) return new Response("not found", { status: 404 });

    const { body: commentBody, author } = body as { body: string; author?: string };
    if (commentBody?.trim()) {
      await issuesDb.addIssueComment(issue.id, commentBody.trim(), author?.trim() || "anonymous");
    }

    return new Response(null, {
      status: 302,
      headers: { location: `/${params.slug}/issues/${issueNumber}` },
    });
  })
  .post("/:slug/issues/:number/toggle", async ({ params }) => {
    const repo = await findRepoBySlug(params.slug);
    if (!repo) return new Response("not found", { status: 404 });

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
