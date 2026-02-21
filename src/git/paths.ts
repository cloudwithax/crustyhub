import { join } from "path";
import { REPOS_DIR, TRASH_DIR } from "../config/env";

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;

export function validateSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes("..") && slug !== "." && slug !== "..";
}

export function repoPath(slug: string): string {
  return join(REPOS_DIR, `${slug}.git`);
}

export function trashPath(slug: string): string {
  return join(TRASH_DIR, `${slug}-${Date.now()}.git`);
}
