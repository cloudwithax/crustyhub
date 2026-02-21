import { sql } from "./index";

export interface Issue {
  id: number;
  repo_id: number;
  number: number;
  title: string;
  body_markdown: string;
  state: "open" | "closed";
  created_by_user_id: number | null;
  author_name: string;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

export interface IssueComment {
  id: number;
  issue_id: number;
  body_markdown: string;
  created_by_user_id: number | null;
  author_name: string;
  created_at: Date;
  updated_at: Date;
}

export async function listIssues(repoId: number, state: "open" | "closed" | "all" = "open", limit = 50, offset = 0): Promise<Issue[]> {
  if (state === "all") {
    return sql<Issue[]>`
      SELECT * FROM issues WHERE repo_id = ${repoId}
      ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
  }
  return sql<Issue[]>`
    SELECT * FROM issues WHERE repo_id = ${repoId} AND state = ${state}
    ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function getIssue(repoId: number, issueNumber: number): Promise<Issue | null> {
  const rows = await sql<Issue[]>`
    SELECT * FROM issues WHERE repo_id = ${repoId} AND number = ${issueNumber} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createIssue(repoId: number, title: string, bodyMarkdown: string, authorName = "anonymous"): Promise<Issue> {
  const rows = await sql<Issue[]>`
    INSERT INTO issues (repo_id, number, title, body_markdown, author_name)
    VALUES (
      ${repoId},
      COALESCE((SELECT max(number) FROM issues WHERE repo_id = ${repoId}), 0) + 1,
      ${title},
      ${bodyMarkdown},
      ${authorName}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function updateIssueState(repoId: number, issueNumber: number, state: "open" | "closed"): Promise<Issue | null> {
  const rows = await sql<Issue[]>`
    UPDATE issues SET
      state = ${state},
      closed_at = ${state === "closed" ? sql`now()` : sql`NULL`},
      updated_at = now()
    WHERE repo_id = ${repoId} AND number = ${issueNumber}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function getIssueComments(issueId: number): Promise<IssueComment[]> {
  return sql<IssueComment[]>`
    SELECT * FROM issue_comments WHERE issue_id = ${issueId}
    ORDER BY created_at ASC
  `;
}

export async function addIssueComment(issueId: number, bodyMarkdown: string, authorName = "anonymous"): Promise<IssueComment> {
  const rows = await sql<IssueComment[]>`
    INSERT INTO issue_comments (issue_id, body_markdown, author_name)
    VALUES (${issueId}, ${bodyMarkdown}, ${authorName})
    RETURNING *
  `;
  await sql`UPDATE issues SET updated_at = now() WHERE id = ${issueId}`;
  return rows[0];
}

export async function getIssueCount(repoId: number, state: "open" | "closed" | "all" = "open"): Promise<number> {
  if (state === "all") {
    const rows = await sql<[{ count: string }]>`SELECT count(*)::text as count FROM issues WHERE repo_id = ${repoId}`;
    return parseInt(rows[0].count, 10);
  }
  const rows = await sql<[{ count: string }]>`SELECT count(*)::text as count FROM issues WHERE repo_id = ${repoId} AND state = ${state}`;
  return parseInt(rows[0].count, 10);
}
