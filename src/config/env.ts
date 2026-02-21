import { join } from "path";

export const PORT = parseInt(process.env.PORT || "3000", 10);
export const HOST = process.env.HOST || "0.0.0.0";
export const DATABASE_URL = process.env.DATABASE_URL || "postgres://crustyhub:crustyhub@localhost:5432/crustyhub";
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
export const REPOS_DIR = join(DATA_DIR, "repos");
export const TRASH_DIR = join(DATA_DIR, "trash");
export const GIT_HTTP_BACKEND = process.env.GIT_HTTP_BACKEND || "/usr/lib/git-core/git-http-backend";
export const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
