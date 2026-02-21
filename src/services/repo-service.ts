import { mkdir, rename } from "fs/promises";
import { existsSync } from "fs";
import { repoPath, trashPath, validateSlug } from "../git/paths";
import { gitInit } from "../git/git-spawn";
import * as reposDb from "../db/repos";
import { REPOS_DIR, TRASH_DIR, PAGES_CACHE_DIR } from "../config/env";
import { checkDiskSpace } from "../middleware/git-guard";

export async function ensureDirectories() {
  await mkdir(REPOS_DIR, { recursive: true });
  await mkdir(TRASH_DIR, { recursive: true });
  await mkdir(PAGES_CACHE_DIR, { recursive: true });
}

export async function createRepo(slug: string, description = "", createdVia = "web"): Promise<reposDb.Repo> {
  if (!validateSlug(slug)) throw new Error("invalid repository name");

  const diskBlock = await checkDiskSpace();
  if (diskBlock) throw new Error("server disk space critically low");

  const path = repoPath(slug);
  if (existsSync(path)) {
    const existing = await reposDb.findRepoBySlug(slug);
    if (existing) return existing;
  }

  await gitInit(path);
  return reposDb.createRepo(slug, description, createdVia);
}

export async function ensureRepoForPush(slug: string): Promise<void> {
  if (!validateSlug(slug)) throw new Error("invalid repository name");

  const diskBlock = await checkDiskSpace();
  if (diskBlock) throw new Error("server disk space critically low");

  const path = repoPath(slug);
  if (existsSync(path)) return;

  await gitInit(path);

  const existing = await reposDb.findRepoBySlug(slug);
  if (!existing) {
    await reposDb.createRepo(slug, "", "push");
  }
}

export async function deleteRepo(slug: string): Promise<void> {
  const repo = await reposDb.findRepoBySlug(slug);
  if (!repo) throw new Error("repo not found");

  const src = repoPath(slug);
  const dst = trashPath(slug);

  if (existsSync(src)) {
    await rename(src, dst);
  }

  await reposDb.softDeleteRepo(repo.id);
}

export async function forkRepo(sourceSlug: string, newSlug: string): Promise<reposDb.Repo> {
  if (!validateSlug(newSlug)) throw new Error("invalid repository name");

  const source = await reposDb.findRepoBySlug(sourceSlug);
  if (!source) throw new Error("source repo not found");

  const srcPath = repoPath(sourceSlug);
  const dstPath = repoPath(newSlug);

  const proc = Bun.spawn(["git", "clone", "--bare", srcPath, dstPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`fork failed: ${err}`);
  }

  return reposDb.createRepo(newSlug, `Fork of ${sourceSlug}`, "fork", null, source.id);
}
