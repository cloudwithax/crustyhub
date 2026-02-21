import postgres from "postgres";
import { DATABASE_URL } from "../config/env";

export const sql = postgres(DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS repos (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      is_public BOOLEAN NOT NULL DEFAULT true,
      default_branch TEXT NOT NULL DEFAULT 'main',
      created_by_user_id BIGINT REFERENCES users(id),
      created_via TEXT NOT NULL DEFAULT 'web',
      forked_from_repo_id BIGINT REFERENCES repos(id),
      star_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS repo_stars (
      id BIGSERIAL PRIMARY KEY,
      repo_id BIGINT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(repo_id, user_id),
      UNIQUE(repo_id, session_id)
    )
  `;

  await sql.unsafe(`DO $$ BEGIN
    CREATE TYPE issue_state AS ENUM ('open', 'closed');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);

  await sql`
    CREATE TABLE IF NOT EXISTS issues (
      id BIGSERIAL PRIMARY KEY,
      repo_id BIGINT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      body_markdown TEXT NOT NULL DEFAULT '',
      state issue_state NOT NULL DEFAULT 'open',
      created_by_user_id BIGINT REFERENCES users(id),
      author_name TEXT DEFAULT 'anonymous',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ,
      UNIQUE(repo_id, number)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS issue_comments (
      id BIGSERIAL PRIMARY KEY,
      issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      body_markdown TEXT NOT NULL,
      created_by_user_id BIGINT REFERENCES users(id),
      author_name TEXT DEFAULT 'anonymous',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log("database tables initialized");
}
