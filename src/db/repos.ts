import { sql } from "./index";

export interface Repo {
  id: number;
  slug: string;
  description: string;
  is_public: boolean;
  default_branch: string;
  created_by_user_id: number | null;
  created_via: string;
  forked_from_repo_id: number | null;
  star_count: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export async function findRepoBySlug(slug: string): Promise<Repo | null> {
  const rows = await sql<Repo[]>`
    SELECT * FROM repos WHERE slug = ${slug} AND deleted_at IS NULL LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listRepos(limit = 50, offset = 0): Promise<Repo[]> {
  return sql<Repo[]>`
    SELECT * FROM repos WHERE deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function createRepo(slug: string, description = "", createdVia = "web", userId: number | null = null, forkedFrom: number | null = null): Promise<Repo> {
  const rows = await sql<Repo[]>`
    INSERT INTO repos (slug, description, created_via, created_by_user_id, forked_from_repo_id)
    VALUES (${slug}, ${description}, ${createdVia}, ${userId}, ${forkedFrom})
    RETURNING *
  `;
  return rows[0];
}

export async function updateRepo(id: number, updates: { description?: string; default_branch?: string }): Promise<Repo | null> {
  const rows = await sql<Repo[]>`
    UPDATE repos SET
      description = COALESCE(${updates.description ?? null}, description),
      default_branch = COALESCE(${updates.default_branch ?? null}, default_branch),
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function softDeleteRepo(id: number): Promise<void> {
  await sql`UPDATE repos SET deleted_at = now() WHERE id = ${id}`;
}

export async function touchRepo(slug: string): Promise<void> {
  await sql`UPDATE repos SET updated_at = now() WHERE slug = ${slug} AND deleted_at IS NULL`;
}

export async function getRepoCount(): Promise<number> {
  const rows = await sql<[{ count: string }]>`SELECT count(*)::text as count FROM repos WHERE deleted_at IS NULL`;
  return parseInt(rows[0].count, 10);
}

export async function starRepo(repoId: number, sessionId: string): Promise<void> {
  await sql`
    INSERT INTO repo_stars (repo_id, session_id) VALUES (${repoId}, ${sessionId})
    ON CONFLICT DO NOTHING
  `;
  await sql`
    UPDATE repos SET star_count = (SELECT count(*) FROM repo_stars WHERE repo_id = ${repoId})
    WHERE id = ${repoId}
  `;
}

export async function unstarRepo(repoId: number, sessionId: string): Promise<void> {
  await sql`DELETE FROM repo_stars WHERE repo_id = ${repoId} AND session_id = ${sessionId}`;
  await sql`
    UPDATE repos SET star_count = (SELECT count(*) FROM repo_stars WHERE repo_id = ${repoId})
    WHERE id = ${repoId}
  `;
}

export async function isStarred(repoId: number, sessionId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM repo_stars WHERE repo_id = ${repoId} AND session_id = ${sessionId} LIMIT 1`;
  return rows.length > 0;
}

export async function searchRepos(query: string, limit = 50): Promise<Repo[]> {
  return sql<Repo[]>`
    SELECT * FROM repos
    WHERE deleted_at IS NULL
      AND (slug ILIKE ${'%' + query + '%'} OR description ILIKE ${'%' + query + '%'})
    ORDER BY star_count DESC, updated_at DESC
    LIMIT ${limit}
  `;
}
